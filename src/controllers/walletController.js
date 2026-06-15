/**
 * Wallet endpoints (user-facing + VNPay payment callbacks + admin withdrawal review).
 *
 * Money flows:
 *   - DEPOSIT (in): user calls POST /api/wallet/deposit → backend tạo Pending
 *     WalletTransaction + sinh URL thanh toán VNPay → FE redirect user. VNPay
 *     gọi IPN (GET /api/vnpay/ipn) khi giao dịch thành công → backend verify
 *     hash + credit ví. Idempotent qua externalRef = "vnpay:<txnRef>".
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
import {
    createVnpayPaymentUrl,
    verifyVnpayReturnUrl,
    verifyVnpayIpnCall,
    VNPAY_RESPONSE_CODES,
    fetchVnpayBankList,
} from '../services/vnpayService.js';

const FRONTEND_RETURN_URL =
    process.env.VNPAY_FRONTEND_RETURN_URL || process.env.FRONTEND_URL || '';

// Giới hạn 1 lần nạp. Min 10k để khớp tối thiểu của hầu hết ngân hàng,
// max 500M để chặn typo (10 chữ số thừa) hoặc lạm dụng nạp số lớn không
// hợp lý — admin có thể nâng nếu cần.
const MIN_DEPOSIT_VND = 10_000;
const MAX_DEPOSIT_VND = 500_000_000;

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
 * Tạo giao dịch nạp tiền qua VNPay.
 *
 * 1. Sinh `txnRef` unique (mã giao dịch VNPay yêu cầu)
 * 2. Lưu 1 WalletTransaction trạng thái Pending — kèm externalRef = vnpay:<txnRef>
 *    để khi IPN trả về biết user nào, idempotent.
 * 3. Build URL VNPay đã ký HMAC-SHA512 → trả về FE để redirect user.
 *
 * KHÔNG credit ví ở đây — chờ IPN callback từ VNPay sau khi user thanh toán xong.
 */
export const createDeposit = async (req, res) => {
    try {
        const { amount, bankCode } = req.body;
        if (!Number.isFinite(Number(amount))) {
            return res.status(400).send({ status: 'Error', message: 'amount phải là số hợp lệ' });
        }
        if (!amount || amount < MIN_DEPOSIT_VND) {
            return res.status(400).send({
                status: 'Error',
                message: `amount tối thiểu ${MIN_DEPOSIT_VND.toLocaleString('vi-VN')} VND`,
            });
        }
        if (amount > MAX_DEPOSIT_VND) {
            return res.status(400).send({
                status: 'Error',
                message: `amount tối đa ${MAX_DEPOSIT_VND.toLocaleString('vi-VN')} VND/lần`,
            });
        }

        const wallet = await getOrCreateWallet(req.user._id);

        // VNPay yêu cầu vnp_TxnRef unique + max 100 ký tự. Dùng timestamp + random
        // để chắc chắn không trùng, đồng thời ngắn gọn để dễ tra log.
        const txnRef = `HM${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const orderInfo = `Nap tien vi HorseManage user ${req.user._id}`;

        // Tạo Pending transaction. balanceAfter = balance hiện tại (chưa cộng), khi
        // IPN xác nhận thành công mới cộng + update balanceAfter mới qua credit().
        const tx = await WalletTransaction.create({
            wallet: wallet._id,
            user: req.user._id,
            type: WALLET_TX_TYPES.DEPOSIT,
            direction: 'Credit',
            amount: Number(amount),
            balanceAfter: wallet.balance,
            status: 'Pending',
            externalRef: `vnpay:${txnRef}`,
            reference: txnRef,
            description: `Tạo yêu cầu nạp tiền qua VNPay`,
        });

        const ipAddr =
            req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
            req.socket?.remoteAddress ||
            req.ip ||
            '127.0.0.1';

        const paymentUrl = createVnpayPaymentUrl({
            txnRef,
            amount: Number(amount),
            orderInfo,
            ipAddr,
            bankCode: bankCode || undefined,
        });

        return res.status(200).send({
            status: 'Success',
            message: 'Đã tạo yêu cầu nạp tiền. Redirect user tới paymentUrl để thanh toán.',
            data: {
                paymentUrl,
                txnRef,
                txId: tx._id,
                amount: Number(amount),
                currency: 'VND',
            },
        });
    } catch (err) {
        console.error('createDeposit error:', err);
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Trạng thái 1 giao dịch nạp tiền — FE poll endpoint này nếu user đã quay lại
 * app nhưng chưa biết VNPay đã credit chưa (vd: vừa redirect về FE).
 *
 * Trả status: 'Pending' | 'Success' | 'Failed'. FE poll tới khi không phải
 * Pending hoặc timeout (vd 5 phút).
 */
export const getDepositStatus = async (req, res) => {
    try {
        const { txId } = req.params;
        if (!mongoose.isValidObjectId(txId)) {
            return res.status(400).send({ status: 'Error', message: 'txId không hợp lệ' });
        }
        const tx = await WalletTransaction.findOne({
            _id: txId,
            user: req.user._id,
            type: WALLET_TX_TYPES.DEPOSIT,
        });
        if (!tx) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy giao dịch' });
        }
        return res.status(200).send({
            status: 'Success',
            message: 'Trạng thái giao dịch nạp tiền',
            data: {
                txId: tx._id,
                amount: tx.amount,
                status: tx.status,
                externalRef: tx.externalRef,
                description: tx.description,
                createdAt: tx.createdAt,
                updatedAt: tx.updatedAt,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const createWithdraw = async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName } = req.body;
        if (!Number.isFinite(Number(amount))) {
            return res.status(400).send({ status: 'Error', message: 'amount phải là số hợp lệ' });
        }
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
 * VNPay redirect user về URL này sau khi user xong thanh toán trên trang VNPay.
 *
 * CHỈ DÙNG ĐỂ HIỂN THỊ kết quả cho user — KHÔNG tin hash này để credit ví,
 * vì user có thể đóng tab giữa chừng hoặc giả mạo URL. Việc credit ví thật
 * sự dùng IPN handler bên dưới.
 *
 * Nếu có FRONTEND_RETURN_URL trong env → redirect tới FE với query params.
 * Nếu không → trả JSON trực tiếp (dev mode).
 */
export const vnpayReturn = async (req, res) => {
    try {
        const { isValid, isSuccess, params } = verifyVnpayReturnUrl(req.query);
        const responseCode = params.vnp_ResponseCode;
        const txnRef = params.vnp_TxnRef;
        // vnpay library đã trả vnp_Amount chia 100, không cần xử lý lại
        const amount = Number(params.vnp_Amount || 0);
        const message = VNPAY_RESPONSE_CODES[responseCode] || 'Không xác định';

        const result = {
            isValid,
            success: isValid && isSuccess,
            responseCode,
            message,
            txnRef,
            amount,
        };

        if (FRONTEND_RETURN_URL) {
            const qs = new URLSearchParams({
                success: String(result.success),
                txnRef: txnRef || '',
                amount: String(amount),
                code: responseCode || '',
                message,
            }).toString();
            return res.redirect(`${FRONTEND_RETURN_URL}?${qs}`);
        }

        return res.status(200).send({
            status: result.success ? 'Success' : 'Error',
            message: result.success ? 'Thanh toán thành công' : `Thanh toán thất bại: ${message}`,
            data: result,
        });
    } catch (err) {
        console.error('vnpayReturn error:', err);
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * VNPay IPN (Instant Payment Notification) — server-to-server callback.
 * Đây là NGUỒN TIN CẬY duy nhất để credit ví, vì user có thể đóng tab trước
 * khi return URL chạy. VNPay sẽ retry nếu IPN không trả đúng format.
 *
 * Response format VNPay yêu cầu: { RspCode, Message } — KHÔNG dùng format chung
 * { status, message } của các endpoint khác.
 *
 * Bảng mã trả về VNPay (RspCode):
 *   00 = Confirm Success (đã credit hoặc đã xử lý trước đó)
 *   01 = Order not Found
 *   02 = Order already confirmed
 *   04 = Invalid amount
 *   97 = Invalid signature
 *   99 = Unknown error
 */
export const vnpayIpn = async (req, res) => {
    try {
        const { isValid, isSuccess, params } = verifyVnpayIpnCall(req.query);

        if (!isValid) {
            return res.status(200).send({ RspCode: '97', Message: 'Invalid signature' });
        }

        const txnRef = params.vnp_TxnRef;
        const responseCode = params.vnp_ResponseCode;
        // vnpay library đã chia 100 sẵn cho amount
        const amount = Number(params.vnp_Amount || 0);

        const externalRef = `vnpay:${txnRef}`;
        // Atomic claim: chỉ tìm tx Pending để xử lý. Nếu 2 IPN đến cùng lúc, chỉ
        // 1 cái match được (race tiếp theo sẽ thấy status đã đổi), tránh credit
        // 2 lần. Không dùng findOneAndUpdate vì cần nhánh Already/Invalid amount.
        const pendingTx = await WalletTransaction.findOne({ externalRef });

        if (!pendingTx) {
            return res.status(200).send({ RspCode: '01', Message: 'Order not Found' });
        }
        if (pendingTx.status !== 'Pending') {
            return res.status(200).send({ RspCode: '02', Message: 'Order already confirmed' });
        }
        if (Number(pendingTx.amount) !== amount) {
            return res.status(200).send({ RspCode: '04', Message: 'Invalid amount' });
        }

        // vnpay library đã kiểm tra responseCode='00' + transactionStatus='00'
        if (isSuccess) {
            // Credit thật sự vào ví user + đánh dấu tx này thành Success.
            // Vì credit() tự tạo 1 transaction mới, ta xoá Pending cũ để khỏi
            // duplicate; externalRef của tx mới giữ vnpay:<txnRef> để dedupe.
            await WalletTransaction.deleteOne({ _id: pendingTx._id });
            await credit(pendingTx.user, amount, {
                type: WALLET_TX_TYPES.DEPOSIT,
                reference: txnRef,
                externalRef,
                description: `Nạp tiền qua VNPay (txnRef ${txnRef})`,
            });
            return res.status(200).send({ RspCode: '00', Message: 'Confirm Success' });
        }

        // Giao dịch thất bại → mark Failed để FE lịch sử thấy
        pendingTx.status = 'Failed';
        pendingTx.description = `VNPay từ chối: ${VNPAY_RESPONSE_CODES[responseCode] || responseCode}`;
        await pendingTx.save();
        return res.status(200).send({ RspCode: '00', Message: 'Confirm Success' });
    } catch (err) {
        console.error('vnpayIpn error:', err, 'query:', req.query);
        return res.status(200).send({ RspCode: '99', Message: 'Unknown error' });
    }
};

/**
 * Bảng map ngân hàng phổ biến hỗ trợ VNPay — để FE render dropdown chọn bank
 * nếu muốn fix sẵn bankCode trước khi vào trang VNPay. Bỏ qua đoạn này nếu
 * để user tự chọn trên trang VNPay (FE không truyền bankCode).
 */
/**
 * Danh sách ngân hàng VNPay hỗ trợ. Lấy live từ VNPay (qua vnpay lib) để
 * không bị stale khi VNPay thêm/bỏ ngân hàng. Fallback sang VNPAY_BANK_CODES
 * tĩnh nếu VNPay API down.
 */
// Cache 10 phút để không gọi live API VNPay mỗi request — bank list ít đổi.
let bankListCache = null;
let bankListCachedAt = 0;
const BANK_LIST_TTL_MS = 10 * 60 * 1000;

export const listVnpayBankCodes = async (req, res) => {
    try {
        const now = Date.now();
        if (bankListCache && now - bankListCachedAt < BANK_LIST_TTL_MS) {
            return res.status(200).send({
                status: 'Success',
                message: 'Danh sách ngân hàng VNPay (cached)',
                data: bankListCache,
            });
        }
        const banks = await fetchVnpayBankList();
        bankListCache = banks;
        bankListCachedAt = now;
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngân hàng VNPay (live)',
            data: banks,
        });
    } catch (err) {
        console.error('fetchVnpayBankList failed, falling back to static map:', err.message);
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngân hàng VNPay (fallback)',
            data: Object.entries(VNPAY_BANK_CODES).map(([code, name]) => ({ code, name })),
        });
    }
};

export const VNPAY_BANK_CODES = {
    NCB: 'Ngân hàng NCB (dùng cho test sandbox)',
    VIETCOMBANK: 'Vietcombank',
    BIDV: 'BIDV',
    AGRIBANK: 'Agribank',
    SACOMBANK: 'Sacombank',
    TPBANK: 'TPBank',
    VPBANK: 'VPBank',
    VISA: 'Thẻ quốc tế (Visa/MasterCard/JCB)',
};
