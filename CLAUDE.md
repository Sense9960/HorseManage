# CLAUDE.md — HorseManage

Tài liệu hướng dẫn cho Claude Code khi làm việc trên repo này.

## 1. Tổng quan dự án
- Backend Node.js + Express + Mongoose (MongoDB), ESM (`"type": "module"`).
- Thực thể chính: `User` (4 role: Admin / Jockey / OwnerHorse / EndUser), `Horse`.
- Auth bằng JWT, password hash bằng `bcryptjs`.
- Cấu trúc:
  - `src/models/` — schema Mongoose
  - `src/controllers/` — business logic
  - `src/routes/` — Express routes
  - `src/middleware/` — `authenticate`, `authorize`
  - `docs/ERD.md` — ERD (Mermaid)

## 2. Quy tắc đua ngựa (Business rules)

### 2.1 Tham gia thi đấu
- Một **Horse** chỉ thuộc về **một OwnerHorse** tại một thời điểm (`horse.owner`).
- Một **Jockey** chỉ được cưỡi **một Horse** trong cùng một race; `horse.currentJockey` phải được set trước khi đăng ký race.
- `Horse.status` phải là `Active` mới được đăng ký race. `Resting`, `Injured`, `Retired` bị từ chối.
- `Jockey` phải có `licenseNumber` hợp lệ (không null) và `status = Active`.

### 2.2 Cân nặng & tuổi
- Cân nặng Jockey: **45kg ≤ weightKg ≤ 65kg**. Vượt ngoài thì cấm thi đấu.
- Tuổi ngựa tham gia race: **3 ≤ tuổi ≤ 15** (tính từ `dateOfBirth`).
- Tuổi Jockey tối thiểu: **18 tuổi**.

### 2.3 Kết quả & thống kê
- Sau mỗi race, cập nhật `totalRaces` cho cả `Horse` và `Jockey`.
- Người thắng cộng `totalWins +1`; cập nhật `rating` Jockey theo công thức win-rate.
- Không cho phép sửa kết quả race đã đóng (immutable) trừ khi có Admin override (ghi audit log).

### 2.4 Quyền theo role
| Role | Được phép |
|------|-----------|
| Admin | Toàn quyền: duyệt license, ban user, override kết quả, xem audit log |
| OwnerHorse | CRUD ngựa của chính mình, gán Jockey, đăng ký race |
| Jockey | Xem race của mình, cập nhật profile (không sửa `licenseNumber`, `totalWins`) |
| EndUser | Xem public info, follow Jockey, không truy cập dữ liệu nội bộ |

## 3. Bảo mật — BẮT BUỘC kiểm tra trước khi ra sản phẩm

> ⚠️ **Tuyệt đối không deploy nếu chưa pass toàn bộ checklist này.**

### 3.1 Secrets & cấu hình
- [ ] `.env` **không** được commit (đã có `.gitignore` chặn — kiểm tra lại trước mỗi PR).
- [ ] `JWT_SECRET` production phải ≥ 32 ký tự random, **không dùng** default `horse_manage_secret_dev`.
- [ ] `MONGODB_URL` production dùng user riêng (không phải `root`), bật TLS, IP allowlist.
- [ ] Rotate JWT secret định kỳ, có cơ chế revoke token (blacklist hoặc short TTL + refresh token).

### 3.2 Mật khẩu & xác thực
- [ ] Password tối thiểu 8 ký tự + có chữ + số + ký tự đặc biệt (hiện đang min 6 — **cần nâng trước khi production**).
- [ ] `password` field luôn `select: false`, controller phải `.select('+password')` mới đọc được.
- [ ] Hash bcrypt cost ≥ 10 (đang dùng 10, OK).
- [ ] Rate-limit `/api/auth/login` và `/api/auth/register` (vd: 5 req/phút/IP) — **chưa làm**, cần thêm `express-rate-limit`.
- [ ] Đăng nhập sai N lần → khoá tạm thời (lockout).
- [ ] Email verification trước khi `isVerified = true`; tài khoản chưa verify không được làm Jockey/Owner.

### 3.3 Phân quyền (Authorization)
- [ ] Mọi route nhạy cảm bọc `authenticate` + `authorize(role)`.
- [ ] Kiểm tra **ownership**: OwnerHorse chỉ sửa ngựa có `owner == req.user._id`, không phải chỉ check role.
- [ ] Không trust `role` từ body khi update profile — chỉ Admin được đổi role của user khác.
- [ ] IDOR test: thử truy cập `/api/horses/:id` của user khác → phải 403.

### 3.4 Input validation
- [ ] Validate toàn bộ body bằng `joi` hoặc `zod` (hiện chỉ check field bắt buộc — **chưa đủ**).
- [ ] Sanitize input để chống NoSQL injection: chặn key bắt đầu bằng `$` hoặc chứa `.` (dùng `express-mongo-sanitize`).
- [ ] Chặn mass-assignment: whitelist field cho phép update, **không** `Object.assign(user, req.body)`.
- [ ] Validate `ObjectId` trước khi query (`mongoose.isValidObjectId`).

### 3.5 Transport & headers
- [ ] HTTPS bắt buộc ở production (terminate ở reverse proxy).
- [ ] Bật `helmet()` cho security headers — **chưa cài**.
- [ ] CORS cấu hình whitelist domain cụ thể, **không** dùng `*`.
- [ ] Cookie (nếu có) phải `httpOnly`, `secure`, `sameSite=strict`.

### 3.6 Logging & monitoring
- [ ] **Không** log password, JWT, PII (số CCCD, taxCode đầy đủ).
- [ ] Audit log mọi hành động Admin (ban, override race, đổi role).
- [ ] Cảnh báo khi đăng nhập từ IP/Country lạ.

### 3.7 Dependencies
- [ ] `npm audit` không còn lỗ hổng `high` / `critical`.
- [ ] Pin version trong `package.json`, dùng lockfile.
- [ ] Loại bỏ package không dùng.

### 3.8 Pre-release checklist
- [ ] Test register/login với cả 4 role.
- [ ] Test JWT hết hạn → 401.
- [ ] Test wrong role → 403.
- [ ] Test SQL/NoSQL injection trên các field `email`, `username`.
- [ ] Penetration test cơ bản (OWASP Top 10).
- [ ] Backup DB + DR plan.

## 4. Quy ước code
- ESM `import/export`, không CommonJS.
- Response chuẩn: `{ status: "Success"|"Error", message, data? }`.
- Mọi error trả về `{ status: "Error", message }`, **không** leak stack trace ra client.
- Đặt tên model PascalCase, file route/controller camelCase.

## 5. Lệnh thường dùng
```bash
npm start       # chạy production
npm run dev     # chạy watch mode
npm audit       # check vulnerability
```
