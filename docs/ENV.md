# Environment Variables

Repo này **không dùng file `.env.example`** (mọi tên `.env*` bị `.gitignore` chặn tuyệt đối để tránh lỡ commit giá trị thật). Danh sách biến cần set trong `.env` local (và trên Vercel dashboard cho production):

## Bắt buộc

| Biến | Mô tả |
|---|---|
| `MONGODB_URL` | Connection string MongoDB Atlas / local |
| `JWT_SECRET` | Chuỗi ký JWT — production nên ≥ 32 ký tự random |
| `SEED_PASSWORD` | Mật khẩu dùng chung cho MỌI tài khoản khi chạy `npm run seed` (≥ 6 ký tự). Seed sẽ throw nếu thiếu. |

## Thanh toán VNPay (sandbox)

| Biến | Mô tả |
|---|---|
| `VNPAY_TMN_CODE` | Terminal ID / mã website VNPay |
| `VNPAY_HASH_SECRET` | Secret ký checksum HMAC-SHA512 |
| `VNPAY_RETURN_URL` | URL backend nhận redirect sau thanh toán (vd `https://<domain>/api/vnpay/return`) |
| `VNPAY_FRONTEND_RETURN_URL` | (optional) URL FE nhận redirect kèm query kết quả. Trống = trả JSON. |

## Tích hợp ngoài

| Biến | Mô tả |
|---|---|
| `OPENWEATHER_API_KEY` | Key OpenWeatherMap (thời tiết địa điểm race) |
| `DEEPSEEK_API_KEY` | Key DeepSeek cho chatbox AI dự đoán race. **Bắt buộc** nếu dùng `/api/races/:id/ai-predict` + `/ai-chat`; thiếu thì 2 endpoint đó throw. |
| `DEEPSEEK_MODEL` | (optional) Model DeepSeek, mặc định `deepseek-chat` |

## Cấu hình khác

| Biến | Mô tả |
|---|---|
| `CORS_ORIGINS` | Danh sách domain FE được phép, cách nhau dấu phẩy (vd `http://localhost:5173,https://horse-manage.vercel.app`). **Bỏ trống hoặc `*` = mở cho mọi origin.** |
| `JWT_EXPIRES_IN` | (optional) Thời hạn token, mặc định `7d` |
| `GOOGLE_CLIENT_ID` | (optional) Cho login Google |
| `PORT` | (optional) Cổng server, mặc định 3000 |

## Rate limiting

Không cần env — cấu hình cứng trong `src/middlewares/rateLimit.js`:
- Toàn API: 300 req / 15 phút / IP
- Auth (login/register): 10 req / 15 phút / IP (chống brute-force)
- AI endpoints: 15 req / phút / IP (chống cháy quota DeepSeek)

> Trên Vercel serverless store là in-memory theo từng instance. Muốn giới hạn chính xác toàn cục cần Redis store.
