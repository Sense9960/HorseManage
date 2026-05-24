/**
 * Wallet service — single source of truth for any balance change.
 *
 * Rules other modules must rely on (do not bypass by hitting the model directly):
 *   - Every balance change goes through recordTx() so a WalletTransaction row
 *     is ALWAYS written with a balanceAfter snapshot (audit trail).
 *   - A user's wallet is created lazily on first use (getOrCreateWallet).
 *   - Debit refuses when balance < amount; the caller decides how to react.
 *   - A withdrawal is a two-phase Debit: balance is held immediately when the
 *     user requests it (status=Pending), then either confirmed by admin
 *     (status=Success) or refunded via a separate Credit tx (status=Failed).
 *   - notify() is called per balance change unless the caller opts out
 *     (e.g. when seeding initial balances we want a quiet credit).
 *
 * NOTE: operations here are NOT wrapped in a Mongo transaction. Concurrent
 * writes by the same user can race. For production move to sessions + abortable
 * transactions or use $inc with optimistic concurrency.
 */

import { Wallet, WalletTransaction, WALLET_TX_TYPES } from '../models/Wallet.js';
import { notify } from './notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const formatVnd = (n) => `${n.toLocaleString('vi-VN')} VND`;

const httpError = (message, statusCode) =>
    Object.assign(new Error(message), { statusCode });

/** Lazily create one wallet per user. Returns the existing wallet if any. */
export const getOrCreateWallet = async (userId) => {
    const existing = await Wallet.findOne({ user: userId });
    if (existing) return existing;
    return Wallet.create({ user: userId, balance: 0 });
};

/**
 * Single low-level balance mutation. All public helpers below funnel through
 * this so the audit row stays consistent. `extra` lets withdraw add Pending
 * status + payoutInfo without forking the function.
 */
const recordTx = async ({
    wallet,
    direction,
    type,
    amount,
    reference,
    externalRef,
    description,
    notifyUser = true,
    extra = {},
}) => {
    if (direction === 'Debit') {
        if (wallet.balance < amount) throw httpError('Số dư không đủ', 400);
        wallet.balance -= amount;
    } else {
        wallet.balance += amount;
    }
    await wallet.save();

    const tx = await WalletTransaction.create({
        wallet: wallet._id,
        user: wallet.user,
        type,
        direction,
        amount,
        balanceAfter: wallet.balance,
        reference,
        externalRef,
        description,
        ...extra,
    });

    if (notifyUser) {
        const isCredit = direction === 'Credit';
        await notify(wallet.user, {
            type: isCredit ? NOTIFICATION_TYPES.WALLET_CREDIT : NOTIFICATION_TYPES.WALLET_DEBIT,
            title: `${isCredit ? '+' : '-'}${formatVnd(amount)}`,
            body: description || type,
            data: { txId: tx._id, type, amount, balanceAfter: wallet.balance },
        });
    }

    return { wallet, tx };
};

const assertPositive = (amount) => {
    if (!amount || amount <= 0) throw httpError('amount phải > 0', 400);
};

/**
 * Credit a user's wallet. Used for deposits (SePay webhook), prize money,
 * receiving hire fees, refunds, and admin adjustments.
 */
export const credit = async (
    userId,
    amount,
    { type = WALLET_TX_TYPES.ADJUSTMENT, reference, externalRef, description, notifyUser = true } = {}
) => {
    assertPositive(amount);
    const wallet = await getOrCreateWallet(userId);
    return recordTx({ wallet, direction: 'Credit', type, amount, reference, externalRef, description, notifyUser });
};

/** Debit a user's wallet immediately (e.g. paying out a hire fee from owner). */
export const debit = async (
    userId,
    amount,
    { type = WALLET_TX_TYPES.ADJUSTMENT, reference, externalRef, description, notifyUser = true } = {}
) => {
    assertPositive(amount);
    const wallet = await getOrCreateWallet(userId);
    return recordTx({ wallet, direction: 'Debit', type, amount, reference, externalRef, description, notifyUser });
};

/**
 * Phase 1 of withdrawal — hold money on the user's wallet (Pending tx) until
 * admin approves. From the user's POV their balance is already reduced.
 */
export const requestWithdraw = async (userId, amount, payoutInfo, { description } = {}) => {
    assertPositive(amount);
    const wallet = await getOrCreateWallet(userId);

    const result = await recordTx({
        wallet,
        direction: 'Debit',
        type: WALLET_TX_TYPES.WITHDRAW,
        amount,
        description: description || 'Yêu cầu rút tiền',
        notifyUser: false,
        extra: { status: 'Pending', payoutInfo },
    });

    await notify(userId, {
        type: NOTIFICATION_TYPES.WALLET_DEBIT,
        title: `Yêu cầu rút ${formatVnd(amount)} đang chờ duyệt`,
        body: `Tiền đã được giữ. Sẽ chuyển về ${payoutInfo?.bankName || ''} ${payoutInfo?.accountNumber || ''} sau khi admin duyệt.`,
        data: { txId: result.tx._id, amount, balanceAfter: result.wallet.balance },
    });

    return result;
};

const loadPendingWithdraw = async (txId) => {
    const tx = await WalletTransaction.findById(txId);
    if (!tx) throw httpError('Không tìm thấy giao dịch', 404);
    if (tx.type !== WALLET_TX_TYPES.WITHDRAW || tx.status !== 'Pending') {
        throw httpError('Giao dịch không ở trạng thái rút tiền chờ duyệt', 400);
    }
    return tx;
};

/** Phase 2a — admin confirms the withdrawal was wired. No further balance change. */
export const approveWithdraw = async (txId, adminId, note = '') => {
    const tx = await loadPendingWithdraw(txId);
    tx.status = 'Success';
    tx.reviewedBy = adminId;
    tx.reviewedAt = new Date();
    tx.reviewNote = note;
    await tx.save();

    await notify(tx.user, {
        type: NOTIFICATION_TYPES.WALLET_DEBIT,
        title: `Rút ${formatVnd(tx.amount)} thành công`,
        body: `Đã chuyển khoản về ${tx.payoutInfo?.bankName || ''} ${tx.payoutInfo?.accountNumber || ''}`,
        data: { txId: tx._id, amount: tx.amount },
    });
    return tx;
};

/**
 * Phase 2b — admin rejects: keep the failed audit row but refund via a NEW
 * Refund credit (do not mutate the original tx so the audit chain stays sane).
 */
export const rejectWithdraw = async (txId, adminId, reason = '') => {
    const tx = await loadPendingWithdraw(txId);
    tx.status = 'Failed';
    tx.reviewedBy = adminId;
    tx.reviewedAt = new Date();
    tx.reviewNote = reason;
    await tx.save();

    await credit(tx.user, tx.amount, {
        type: WALLET_TX_TYPES.REFUND,
        reference: String(tx._id),
        description: `Hoàn tiền rút bị từ chối: ${reason || 'không nêu lý do'}`,
    });
    return tx;
};

/**
 * Move money between two users in two steps (debit + credit). If the debit
 * throws (insufficient funds) we never reach the credit — the sender's wallet
 * is untouched. If the credit throws after a successful debit the money is
 * stuck; caller must reconcile. Use only inside a try/catch the caller owns.
 */
export const transfer = async (
    fromUserId,
    toUserId,
    amount,
    { type = WALLET_TX_TYPES.HIRE_FEE_OUT, reference, description } = {}
) => {
    await debit(fromUserId, amount, { type, reference, description: `Chuyển: ${description || ''}` });
    return credit(toUserId, amount, {
        type: type === WALLET_TX_TYPES.HIRE_FEE_OUT ? WALLET_TX_TYPES.HIRE_FEE_IN : type,
        reference,
        description: `Nhận: ${description || ''}`,
    });
};
