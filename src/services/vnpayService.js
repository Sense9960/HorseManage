/**
 * VNPay sandbox integration — wrapped around the `vnpay` library.
 *
 * Flow:
 *   FE ──POST /api/wallet/deposit──> Backend (createPaymentUrl)
 *   FE redirect tới paymentUrl → user thanh toán trên trang VNPay
 *   VNPay redirect browser → /api/vnpay/return (chỉ hiển thị kết quả)
 *   VNPay gọi server-to-server → /api/vnpay/ipn (CREDIT ví, idempotent)
 *
 * Docs library: https://vnpay.js.org
 */

import {
    VNPay,
    ignoreLogger,
    ProductCode,
    VnpLocale,
    HashAlgorithm,
    VNPAY_GATEWAY_SANDBOX_HOST,
} from 'vnpay';

const VNP_TMN_CODE = process.env.VNPAY_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNPAY_HASH_SECRET;
const VNP_HOST = process.env.VNPAY_HOST || VNPAY_GATEWAY_SANDBOX_HOST;
const VNP_RETURN_URL = process.env.VNPAY_RETURN_URL || '';

if (!VNP_TMN_CODE || !VNP_HASH_SECRET) {
    console.warn('VNPay: VNPAY_TMN_CODE / VNPAY_HASH_SECRET chưa được set — endpoint deposit sẽ throw khi gọi.');
}

const vnpay = new VNPay({
    tmnCode: VNP_TMN_CODE,
    secureSecret: VNP_HASH_SECRET,
    vnpayHost: VNP_HOST,
    testMode: true,
    hashAlgorithm: HashAlgorithm.SHA512,
    enableLog: false,
    loggerFn: ignoreLogger,
});

/**
 * Tạo URL thanh toán VNPay cho 1 giao dịch nạp tiền.
 */
export const createVnpayPaymentUrl = ({ txnRef, amount, orderInfo, ipAddr, returnUrl, bankCode }) => {
    if (!VNP_TMN_CODE || !VNP_HASH_SECRET) {
        throw new Error('VNPAY_TMN_CODE và VNPAY_HASH_SECRET phải được set trong env');
    }
    return vnpay.buildPaymentUrl({
        vnp_Amount: amount,
        vnp_IpAddr: ipAddr || '127.0.0.1',
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: ProductCode.Other,
        vnp_ReturnUrl: returnUrl || VNP_RETURN_URL,
        vnp_Locale: VnpLocale.VN,
        ...(bankCode ? { vnp_BankCode: bankCode } : {}),
    });
};

/**
 * Verify chữ ký trên return URL (browser redirect sau khi user thanh toán).
 * Library trả về { isVerified, isSuccess, ...vnpayParams }.
 */
export const verifyVnpayReturnUrl = (query) => {
    const result = vnpay.verifyReturnUrl(query);
    return {
        isValid: result.isVerified,
        isSuccess: result.isSuccess,
        params: result,
    };
};

/**
 * Verify chữ ký trên IPN call (server-to-server). Library cũng trả về tương tự
 * verifyReturnUrl nhưng có thêm validate transactionStatus.
 */
export const verifyVnpayIpnCall = (query) => {
    const result = vnpay.verifyIpnCall(query);
    return {
        isValid: result.isVerified,
        isSuccess: result.isSuccess,
        params: result,
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

/**
 * Lấy danh sách ngân hàng VNPay hỗ trợ (online, từ API VNPay).
 * FE dùng cho dropdown chọn bank. Cache lại nếu cần — endpoint của VNPay
 * giới hạn rate.
 */
export const fetchVnpayBankList = () => vnpay.getBankList();
