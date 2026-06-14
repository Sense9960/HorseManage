/**
 * VNPay sandbox integration.
 *
 * VNPay là payment gateway thật — có trang checkout riêng (khác SePay).
 *
 * Flow diagram:
 *
 *   FE ──POST /api/wallet/deposit──> Backend
 *                                       │
 *                                       │ tạo Pending tx + sign URL
 *                                       ▼
 *   FE <───── { paymentUrl } ────── Backend
 *    │
 *    │ window.location = paymentUrl
 *    ▼
 *   VNPay checkout page ─ user nhập thẻ + OTP ─> VNPay xử lý
 *                                                    │
 *                                                    ├─ Browser redirect ──> /api/vnpay/return
 *                                                    │    (chỉ hiển thị kết quả, KHÔNG credit)
 *                                                    │
 *                                                    └─ Server-to-server ──> /api/vnpay/ipn
 *                                                         (verify hash → credit ví)
 *
 * IPN là nguồn tin cậy duy nhất — return URL có thể bị user F5/đóng tab.
 * Docs: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 */

import crypto from 'crypto';

const VNP_TMN_CODE = process.env.VNPAY_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNPAY_HASH_SECRET;
const VNP_URL = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const VNP_RETURN_URL = process.env.VNPAY_RETURN_URL || '';
const VNP_VERSION = '2.1.0';
const VNP_COMMAND = 'pay';
const VNP_CURRENCY = 'VND';
const VNP_LOCALE = 'vn';

/**
 * Sort object keys ascending (theo bảng chữ cái) — VNPay yêu cầu sort khi build
 * chuỗi ký để client và server cùng ra một hash.
 */
const sortObject = (obj) => {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        if (obj[key] === '' || obj[key] === null || obj[key] === undefined) continue;
        sorted[key] = obj[key];
    }
    return sorted;
};

/**
 * Build chuỗi sign data theo định dạng URLSearchParams (RFC 3986).
 * Quan trọng: dùng cùng encoding ở cả tạo URL và verify, nếu lệch nhau
 * hash sẽ khác.
 */
const buildSignData = (params) => {
    const sorted = sortObject(params);
    return new URLSearchParams(sorted).toString();
};

const hmacSha512 = (data) =>
    crypto.createHmac('sha512', VNP_HASH_SECRET).update(Buffer.from(data, 'utf-8')).digest('hex');

/**
 * Format thời gian theo định dạng VNPay yêu cầu: yyyyMMddHHmmss (giờ Việt Nam).
 */
const formatVnpayDate = (date = new Date()) => {
    // VNPay sandbox dùng giờ Việt Nam (UTC+7). Convert vì server có thể chạy ở UTC.
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return (
        vn.getUTCFullYear().toString() +
        pad(vn.getUTCMonth() + 1) +
        pad(vn.getUTCDate()) +
        pad(vn.getUTCHours()) +
        pad(vn.getUTCMinutes()) +
        pad(vn.getUTCSeconds())
    );
};

/**
 * Tạo URL thanh toán VNPay cho 1 giao dịch nạp tiền.
 *
 * @param {Object} opts
 * @param {string} opts.txnRef        - Mã giao dịch unique (vnp_TxnRef)
 * @param {number} opts.amount        - Số tiền VND (sẽ × 100 theo VNPay)
 * @param {string} opts.orderInfo     - Mô tả giao dịch
 * @param {string} opts.ipAddr        - IP của user (vnp_IpAddr)
 * @param {string} [opts.returnUrl]   - Override return URL nếu cần
 * @param {string} [opts.bankCode]    - Optional: chỉ định ngân hàng (vd 'NCB' cho thẻ test)
 * @returns {string} URL đầy đủ kèm chữ ký
 */
export const createVnpayPaymentUrl = ({ txnRef, amount, orderInfo, ipAddr, returnUrl, bankCode }) => {
    if (!VNP_TMN_CODE || !VNP_HASH_SECRET) {
        throw new Error('VNPAY_TMN_CODE và VNPAY_HASH_SECRET phải được set trong env');
    }

    const params = {
        vnp_Version: VNP_VERSION,
        vnp_Command: VNP_COMMAND,
        vnp_TmnCode: VNP_TMN_CODE,
        vnp_Locale: VNP_LOCALE,
        vnp_CurrCode: VNP_CURRENCY,
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(amount * 100),
        vnp_ReturnUrl: returnUrl || VNP_RETURN_URL,
        vnp_IpAddr: ipAddr || '127.0.0.1',
        vnp_CreateDate: formatVnpayDate(),
    };
    if (bankCode) params.vnp_BankCode = bankCode;

    const signData = buildSignData(params);
    const secureHash = hmacSha512(signData);
    return `${VNP_URL}?${signData}&vnp_SecureHash=${secureHash}`;
};

/**
 * Verify chữ ký HMAC trên response từ VNPay (cả return URL và IPN dùng chung).
 * Trả về { isValid, params } để caller xử lý tiếp.
 */
export const verifyVnpayResponse = (query) => {
    const secureHash = query.vnp_SecureHash;
    const cleaned = { ...query };
    delete cleaned.vnp_SecureHash;
    delete cleaned.vnp_SecureHashType;

    const signData = buildSignData(cleaned);
    const expected = hmacSha512(signData);
    return {
        isValid: expected === secureHash,
        params: cleaned,
    };
};

/**
 * Map VNPay response code → mô tả tiếng Việt cho FE hiển thị.
 * Docs: https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/
 */
export const VNPAY_RESPONSE_CODES = {
    '00': 'Giao dịch thành công',
    '07': 'Trừ tiền thành công nhưng nghi ngờ gian lận',
    '09': 'Thẻ/Tài khoản chưa đăng ký Internet Banking',
    '10': 'Xác thực thông tin không đúng quá 3 lần',
    '11': 'Đã hết hạn chờ thanh toán',
    '12': 'Thẻ/Tài khoản bị khóa',
    '13': 'Nhập sai OTP',
    '24': 'Khách hàng huỷ giao dịch',
    '51': 'Tài khoản không đủ số dư',
    '65': 'Tài khoản vượt quá hạn mức giao dịch trong ngày',
    '75': 'Ngân hàng đang bảo trì',
    '79': 'Nhập sai mật khẩu thanh toán quá số lần',
    '99': 'Lỗi khác (không xác định)',
    '15': 'Giao dịch bị nghi ngờ là gian lận',
    '21': 'Số dư tài khoản tạm thời không đủ để thanh toán',
    '22': 'Thông tin tài khoản không đúng',
    '23': 'Tài khoản đã bị khoá',
    '25': 'Phiên giao dịch hết hạn',
};
