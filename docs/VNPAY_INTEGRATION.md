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
