import { Wallet, WalletTransaction, WALLET_TX_TYPES } from '../models/Wallet.js';
import { notify } from './notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

export const getOrCreateWallet = async (userId) => {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
    return wallet;
};

const recordTx = async ({ wallet, direction, type, amount, reference, externalRef, description, notifyUser = true }) => {
    if (direction === 'Debit') {
        if (wallet.balance < amount) {
            const err = new Error('Số dư không đủ');
            err.statusCode = 400;
            throw err;
        }
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
    });

    if (notifyUser) {
        const isCredit = direction === 'Credit';
        await notify(wallet.user, {
            type: isCredit ? NOTIFICATION_TYPES.WALLET_CREDIT : NOTIFICATION_TYPES.WALLET_DEBIT,
            title: isCredit ? `+${amount.toLocaleString('vi-VN')} ${wallet.currency}` : `-${amount.toLocaleString('vi-VN')} ${wallet.currency}`,
            body: description || type,
            data: { txId: tx._id, type, amount, balanceAfter: wallet.balance },
        });
    }

    return { wallet, tx };
};

export const credit = async (userId, amount, { type = WALLET_TX_TYPES.ADJUSTMENT, reference, externalRef, description, notifyUser = true } = {}) => {
    if (!amount || amount <= 0) throw Object.assign(new Error('amount phải > 0'), { statusCode: 400 });
    const wallet = await getOrCreateWallet(userId);
    return recordTx({ wallet, direction: 'Credit', type, amount, reference, externalRef, description, notifyUser });
};

export const debit = async (userId, amount, { type = WALLET_TX_TYPES.ADJUSTMENT, reference, externalRef, description, notifyUser = true } = {}) => {
    if (!amount || amount <= 0) throw Object.assign(new Error('amount phải > 0'), { statusCode: 400 });
    const wallet = await getOrCreateWallet(userId);
    return recordTx({ wallet, direction: 'Debit', type, amount, reference, externalRef, description, notifyUser });
};

export const requestWithdraw = async (userId, amount, payoutInfo, { description } = {}) => {
    if (!amount || amount <= 0) throw Object.assign(new Error('amount phải > 0'), { statusCode: 400 });
    const wallet = await getOrCreateWallet(userId);
    if (wallet.balance < amount) throw Object.assign(new Error('Số dư không đủ'), { statusCode: 400 });

    wallet.balance -= amount;
    await wallet.save();

    const tx = await WalletTransaction.create({
        wallet: wallet._id,
        user: userId,
        type: WALLET_TX_TYPES.WITHDRAW,
        direction: 'Debit',
        amount,
        balanceAfter: wallet.balance,
        status: 'Pending',
        description: description || 'Yêu cầu rút tiền',
        payoutInfo,
    });

    await notify(userId, {
        type: NOTIFICATION_TYPES.WALLET_DEBIT,
        title: `Yêu cầu rút ${amount.toLocaleString('vi-VN')} VND đang chờ duyệt`,
        body: `Tiền đã được giữ. Sẽ chuyển về ${payoutInfo?.bankName || ''} ${payoutInfo?.accountNumber || ''} sau khi admin duyệt.`,
        data: { txId: tx._id, amount, balanceAfter: wallet.balance },
    });

    return { wallet, tx };
};

export const approveWithdraw = async (txId, adminId, note = '') => {
    const tx = await WalletTransaction.findById(txId);
    if (!tx) throw Object.assign(new Error('Không tìm thấy giao dịch'), { statusCode: 404 });
    if (tx.type !== WALLET_TX_TYPES.WITHDRAW || tx.status !== 'Pending') {
        throw Object.assign(new Error('Giao dịch không ở trạng thái rút tiền chờ duyệt'), { statusCode: 400 });
    }
    tx.status = 'Success';
    tx.reviewedBy = adminId;
    tx.reviewedAt = new Date();
    tx.reviewNote = note;
    await tx.save();

    await notify(tx.user, {
        type: NOTIFICATION_TYPES.WALLET_DEBIT,
        title: `Rút ${tx.amount.toLocaleString('vi-VN')} VND thành công`,
        body: `Đã chuyển khoản về ${tx.payoutInfo?.bankName || ''} ${tx.payoutInfo?.accountNumber || ''}`,
        data: { txId: tx._id, amount: tx.amount },
    });
    return tx;
};

export const rejectWithdraw = async (txId, adminId, reason = '') => {
    const tx = await WalletTransaction.findById(txId);
    if (!tx) throw Object.assign(new Error('Không tìm thấy giao dịch'), { statusCode: 404 });
    if (tx.type !== WALLET_TX_TYPES.WITHDRAW || tx.status !== 'Pending') {
        throw Object.assign(new Error('Giao dịch không ở trạng thái rút tiền chờ duyệt'), { statusCode: 400 });
    }

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

export const transfer = async (fromUserId, toUserId, amount, { type = WALLET_TX_TYPES.HIRE_FEE_OUT, reference, description } = {}) => {
    await debit(fromUserId, amount, { type, reference, description: `Chuyển: ${description || ''}` });
    return credit(toUserId, amount, {
        type: type === WALLET_TX_TYPES.HIRE_FEE_OUT ? WALLET_TX_TYPES.HIRE_FEE_IN : type,
        reference,
        description: `Nhận: ${description || ''}`,
    });
};
