/**
 * Rate limiters. Dùng in-memory store (đủ cho dự án nhỏ + local; trên Vercel
 * serverless mỗi instance có store riêng nên giới hạn là "mỗi instance" — vẫn
 * chặn được spam cơ bản). Muốn chính xác tuyệt đối cần Redis store.
 *
 * Response format khớp chuẩn repo: { status: 'Error', message }.
 */
import rateLimit from 'express-rate-limit';

const tooMany = (message) => ({
    status: 'Error',
    message,
});

// Toàn API: rộng tay, chỉ chặn abuse thô. 300 request / 15 phút / IP.
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Quá nhiều request, vui lòng thử lại sau ít phút.'),
});

// Login/register: chống brute-force. 10 lần / 15 phút / IP.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Quá nhiều lần thử đăng nhập/đăng ký. Thử lại sau 15 phút.'),
});

// Endpoint AI (gọi LLM trả phí DeepSeek): siết chặt. 15 request / phút / IP.
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Bạn đang hỏi AI quá nhanh. Chờ một chút rồi thử lại.'),
});
