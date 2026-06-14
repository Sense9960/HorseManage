# VNPay Sandbox Integration

> Tài liệu cho FE + backend team về luồng nạp tiền qua VNPay sandbox.

## 1. Tổng quan

VNPay là payment gateway thật — có trang checkout riêng để user nhập thông tin thẻ.

Khác hẳn SePay (chỉ detect chuyển khoản ngân hàng), VNPay xử lý toàn bộ giao dịch và trả về kết quả qua 2 kênh:

- **Return URL** — VNPay redirect browser của user về sau khi user thanh toán xong. Dùng để hiện kết quả cho user. KHÔNG dùng để credit ví.
- **IPN URL** — VNPay gọi server-to-server (Instant Payment Notification). Đây là source of truth duy nhất để credit ví.

User có thể đóng tab giữa chừng → return URL không chạy. Nhưng IPN sẽ vẫn được gọi → ví được cộng tiền chính xác.

## 2. Thẻ test sandbox

Dùng thẻ NCB trong sandbox để giả lập 1 giao dịch thành công:

| Trường | Giá trị |
|---|---|
| Ngân hàng | NCB |
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | NGUYEN VAN A |
| Ngày phát hành | 07/15 |
| OTP | `123456` |

Khi vào trang VNPay sandbox, chọn ngân hàng **NCB**, dán thông tin trên, OTP `123456` → giao dịch thành công, VNPay sẽ trả `vnp_ResponseCode=00`.

## 3. Test backend (curl)

### 3.1 Login để lấy token

```bash
curl -X POST https://horse-manage-kt3o.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"owner1@horse.test","password":"owner123"}'
```

→ Copy `data.token`.

### 3.2 Tạo deposit URL

```bash
curl -X POST https://horse-manage-kt3o.vercel.app/api/wallet/deposit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"amount":100000,"bankCode":"NCB"}'
```

→ Response chứa `data.paymentUrl`. Copy URL này, paste vào browser → trang thanh toán VNPay sandbox.

### 3.3 Hoàn tất thanh toán

Trên trang VNPay:
1. Chọn ngân hàng **NCB**
2. Dán thông tin thẻ test ở mục 2
3. Nhập OTP `123456`
4. Bấm Xác nhận

VNPay sẽ redirect browser về `/api/vnpay/return` + gọi IPN tới `/api/vnpay/ipn`.

### 3.4 Verify ví đã cộng tiền

```bash
curl https://horse-manage-kt3o.vercel.app/api/wallet \
  -H "Authorization: Bearer <TOKEN>"
```

→ `data.balance` tăng đúng 100000.

## 4. Frontend Integration Flow

| Step | Trigger | Call | UI |
|---|---|---|---|
| 1 | User bấm "Nạp tiền" | — | Modal nhập số tiền |
| 2 | User confirm | `POST /api/wallet/deposit { amount }` | Loading |
| 3 | Nhận `paymentUrl` | — | `window.location.href = paymentUrl` |
| 4 | User thanh toán trên trang VNPay | (FE đứng yên trên VNPay) | — |
| 5 | VNPay redirect về `/api/vnpay/return` → tự redirect tiếp về FE `?success=true&txnRef=...` | — | Trang kết quả |
| 6 | FE đọc query params + gọi `GET /api/wallet` để confirm balance | `GET /api/wallet` | Show số dư mới |

### 4.1 Code FE ví dụ

```js
async function deposit(amount) {
  const r = await fetch('/api/wallet/deposit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  }).then(r => r.json());

  if (r.status === 'Error') return alert(r.message);
  // Redirect browser sang VNPay
  window.location.href = r.data.paymentUrl;
}
```

### 4.2 Sau khi VNPay redirect về

Set env `VNPAY_FRONTEND_RETURN_URL=https://your-fe.com/payment-result` → backend tự chuyển user về FE kèm query: `?success=true&txnRef=HM...&amount=100000&code=00&message=...`.

FE đọc query và gọi `/api/wallet` để show số dư mới.

## 5. API Contracts

### POST /api/wallet/deposit

**Auth:** Bearer JWT (Owner/Jockey).

**Request:**
```json
{ "amount": 100000, "bankCode": "NCB" }
```
`bankCode` tuỳ chọn. Bỏ trống → user tự chọn ngân hàng trên trang VNPay.

**Response 200:**
```json
{
  "status": "Success",
  "data": {
    "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_...",
    "txnRef": "HM17287654321500",
    "txId": "65abc...",
    "amount": 100000,
    "currency": "VND"
  }
}
```

### GET /api/vnpay/return

**Auth:** Không cần — verify bằng `vnp_SecureHash` query.

**Behavior:**
- Nếu env `VNPAY_FRONTEND_RETURN_URL` có set → redirect 302 sang FE
- Nếu không → trả JSON `{ isValid, success, responseCode, message, txnRef, amount }`

### GET /api/vnpay/ipn

**Auth:** Không cần — verify bằng `vnp_SecureHash`.

**Response format (VNPay yêu cầu):**
```json
{ "RspCode": "00", "Message": "Confirm Success" }
```

| RspCode | Ý nghĩa |
|---|---|
| `00` | OK — đã credit hoặc đã xử lý trước đó |
| `01` | Order not Found |
| `02` | Order already confirmed |
| `04` | Invalid amount |
| `97` | Invalid signature |
| `99` | Unknown error |
