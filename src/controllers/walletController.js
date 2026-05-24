/**
 * Wallet endpoints (user-facing + SePay webhook + admin withdrawal review).
 *
 * Money flows:
 *   - DEPOSIT (in): user sends bank transfer with memo "NAP <userId>". SePay's
 *     webhook hits /api/sepay/webhook → we look up the userId in the memo and
 *     credit. Idempotent via externalRef = "sepay:<id>".
 *   - WITHDRAW (out): user calls POST /withdraw → balance held immediately
 *     (Pending tx). Admin reviews via /api/admin/withdrawals and either
 *     approves (final Success) or rejects (auto Refund credit row).
 *
 * Routes mounted at /api/wallet are restricted to OwnerHorse + Jockey
 * (enforced in walletRoutes.js). EndUser uses points, not money.
 */

import mongoose from 'mongoose';
import { WalletTransaction, WALLET_TX_TYPES } from '../models/Wallet.js';
import {
    getOrCreateWallet,
    credit,
    requestWithdraw,
    approveWithdraw,
    rejectWithdraw,
} from '../services/walletService.js';

const SEPAY_BANK_TAG = process.env.SEPAY_BANK_TAG || '';
const DEPOSIT_PREFIX = process.env.SEPAY_DEPOSIT_PREFIX || 'NAP';

export const getMyWallet = async (req, res) => {
    try {
        const wallet = await getOrCreateWallet(req.user._id);
        return res.status(200).send({ status: 'Success', message: 'Ví của bạn', data: wallet });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyTransactions = async (req, res) => {
    try {
        const { limit = 50, type } = req.query;
        const filter = { user: req.user._id };
        if (type) filter.type = type;
        const txs = await WalletTransaction.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit) || 50, 200));
        return res.status(200).send({ status: 'Success', message: 'Lịch sử giao dịch', data: txs });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Generate transfer instructions for the user. We do NOT create a Pending
 * deposit row here — the wallet only gets credited when SePay's webhook
 * confirms the bank actually received money. That keeps the flow trustless:
 * a user typing garbage on the transfer page never moves the balance.
 */
export const createDeposit = async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 10000) {
            return res.status(400).send({ status: 'Error', message: 'amount tối thiểu 10000 VND' });
        }
        const memo = `${DEPOSIT_PREFIX} ${req.user._id}`;
        return res.status(200).send({
            status: 'Success',
            message: 'Thông tin chuyển khoản (SePay sandbox)',
            data: {
                amount,
                currency: 'VND',
                memo,
                bankTag: SEPAY_BANK_TAG,
                note: 'Chuyển khoản đúng nội dung memo, ví sẽ tự động cộng tiền khi SePay xác nhận',
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const createWithdraw = async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName } = req.body;
        if (!amount || amount < 50000) {
            return res.status(400).send({ status: 'Error', message: 'amount tối thiểu 50000 VND' });
        }
        if (!bankName || !accountNumber || !accountName) {
            return res.status(400).send({
                status: 'Error',
                message: 'bankName, accountNumber, accountName là bắt buộc',
            });
        }
        const { wallet, tx } = await requestWithdraw(req.user._id, Number(amount), {
            bankName,
            accountNumber,
            accountName,
        });
        return res.status(201).send({
            status: 'Success',
            message: 'Đã gửi yêu cầu rút tiền, chờ admin duyệt',
            data: { tx, balance: wallet.balance },
        });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

export const listPendingWithdrawals = async (req, res) => {
    try {
        // Oldest first — admins should process the queue FIFO.
        const items = await WalletTransaction.find({
            type: WALLET_TX_TYPES.WITHDRAW,
            status: 'Pending',
        })
            .sort({ createdAt: 1 })
            .populate('user', 'fullName email');
        return res.status(200).send({ status: 'Success', message: 'Yêu cầu rút chờ duyệt', data: items });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const decideWithdraw = async (req, res) => {
    try {
        const { txId } = req.params;
        const { action, note } = req.body;
        if (!mongoose.isValidObjectId(txId)) {
            return res.status(400).send({ status: 'Error', message: 'txId không hợp lệ' });
        }
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'approve' hoặc 'reject'" });
        }
        const tx = action === 'approve'
            ? await approveWithdraw(txId, req.user._id, note)
            : await rejectWithdraw(txId, req.user._id, note);
        return res.status(200).send({
            status: 'Success',
            message: action === 'approve' ? 'Đã duyệt rút tiền' : 'Đã từ chối và hoàn tiền',
            data: tx,
        });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

/**
 * SePay calls our webhook with `Authorization: Apikey <key>`. We compare in
 * constant-ish time by string equality. Bearer is also accepted because some
 * sandbox setups use it.
 */
const verifySepayAuth = (req) => {
    const apiKey = process.env.SEPAY_API_KEY;
    if (!apiKey) return false;
    const header = req.headers.authorization || '';
    return header === `Apikey ${apiKey}` || header === `Bearer ${apiKey}`;
};

/**
 * Pull the userId from the transfer memo. We require the deposit prefix
 * (e.g. "NAP") right before the userId so unrelated 24-hex strings elsewhere
 * in the memo cannot be misread as user IDs.
 */
const extractUserIdFromContent = (content = '') => {
    const pattern = new RegExp(`${DEPOSIT_PREFIX}\\s*([a-f0-9]{24})`, 'i');
    const match = content.match(pattern);
    return match ? match[1] : null;
};

/**
 * SePay webhook handler. Inbound transfers only; outbound is ignored. We
 * dedupe by externalRef so SePay retries (or replays during testing) never
 * double-credit the user.
 */
export const sepayWebhook = async (req, res) => {
    try {
        if (!verifySepayAuth(req)) {
            return res.status(401).send({ status: 'Error', message: 'Sai SePay API key' });
        }
        const { id, transferType, transferAmount, content, referenceCode } = req.body || {};
        if (transferType !== 'in' || !transferAmount) {
            return res.status(200).send({ status: 'Success', message: 'Ignored (not inbound transfer)' });
        }

        const userId = extractUserIdFromContent(content);
        if (!userId) {
            console.warn('SePay webhook: no userId in content:', content);
            return res.status(200).send({
                status: 'Success',
                message: 'No userId found in memo, manual review needed',
            });
        }

        const externalRef = `sepay:${id || referenceCode}`;
        const exists = await WalletTransaction.findOne({ externalRef });
        if (exists) {
            return res.status(200).send({ status: 'Success', message: 'Already processed' });
        }

        const { wallet, tx } = await credit(userId, Number(transferAmount), {
            type: WALLET_TX_TYPES.DEPOSIT,
            reference: referenceCode,
            externalRef,
            description: `Nạp tiền qua SePay: ${content || ''}`.trim(),
        });

        return res.status(200).send({
            status: 'Success',
            message: 'Đã ghi nhận nạp tiền',
            data: { txId: tx._id, userId, balance: wallet.balance },
        });
    } catch (err) {
        console.error('SePay webhook error:', err);
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
