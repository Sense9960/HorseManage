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

// Max mỗi limiter đọc từ env (override cho local/seed/test); default = giá trị
// production an toàn. Vd đặt AUTH_RATE_MAX=1000 trong .env local để chạy script
// tạo nhiều account mà không bị chặn.
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

// Toàn API: rộng tay, chỉ chặn abuse thô. Default 300 / 15 phút / IP.
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: num(process.env.API_RATE_MAX, 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Quá nhiều request, vui lòng thử lại sau ít phút.'),
});

// Login/register: chống brute-force. Default 10 / 15 phút / IP.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: num(process.env.AUTH_RATE_MAX, 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Quá nhiều lần thử đăng nhập/đăng ký. Thử lại sau 15 phút.'),
});

// Endpoint AI (gọi LLM trả phí DeepSeek): siết chặt. Default 15 / phút / IP.
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: num(process.env.AI_RATE_MAX, 15),
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Bạn đang hỏi AI quá nhanh. Chờ một chút rồi thử lại.'),
});
