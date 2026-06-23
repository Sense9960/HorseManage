# HorseManage — Sequence Diagrams cho các flow chính

Tài liệu vẽ bằng [Mermaid](https://mermaid.live) — GitHub render trực tiếp.

---

## 1. VNPay deposit flow

User nạp tiền qua trang VNPay sandbox. IPN là nguồn tin cậy duy nhất để credit ví.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant DB as MongoDB
    participant VNPay as VNPay Sandbox

    User->>FE: Bấm "Nạp 100k"
    FE->>BE: POST /api/wallet/deposit { amount: 100000 }
    BE->>DB: Tạo WalletTransaction (status=Pending)<br/>externalRef=vnpay:<txnRef>
    BE->>BE: Sinh paymentUrl (HMAC-SHA512)
    BE-->>FE: { paymentUrl, txId, txnRef }
    FE->>User: window.location.href = paymentUrl

    User->>VNPay: Nhập thẻ NCB + OTP 123456
    VNPay->>VNPay: Xử lý thanh toán

    par Browser redirect
        VNPay->>User: 302 → /api/vnpay/return?vnp_*
        User->>BE: GET /api/vnpay/return?vnp_*
        BE->>BE: verifyVnpayReturnUrl()
        BE-->>User: Trang kết quả (hiển thị only)
    and Server-to-server IPN
        VNPay->>BE: GET /api/vnpay/ipn?vnp_*
        BE->>BE: verifyVnpayIpnCall() (HMAC SHA512)
        BE->>DB: Find tx by externalRef
        alt Tx Pending + signature OK
            BE->>DB: wallet.balance += amount
            BE->>DB: tx.status = Success
            BE->>BE: notify user "+100.000 VND"
            BE-->>VNPay: RspCode 00 Confirm Success
        else Tx not Pending
            BE-->>VNPay: RspCode 02 Already confirmed (idempotent)
        end
    end

    loop Poll mỗi 3s
        FE->>BE: GET /api/wallet/deposit/:txId/status
        BE-->>FE: { status: "Pending" | "Success" }
    end
    FE->>User: "Nạp thành công, số dư mới ..."
```

**Key design points:**
- Backend KHÔNG credit ví ngay khi user gọi `/deposit` → tránh ai cũng có thể "tạo tiền"
- IPN có signature HMAC-SHA512 → an toàn server-to-server
- Idempotent qua `externalRef` → VNPay retry không double-credit
- Tx Pending → Success update IN-PLACE (không tạo tx mới) để FE poll bằng `txId` cũ vẫn thấy

---

## 2. Race lifecycle (Owner → Jockey → Referee → Payout)

Từ lúc Owner đăng ký race đến khi nhận tiền thưởng.

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    actor Jockey
    actor Referee
    participant BE as Backend
    participant DB as MongoDB

    Note over Owner,BE: Phase 1: Đăng ký race
    Owner->>BE: POST /api/owner/races/:raceId/register<br/>{ horseId, jockeyId, hireFee }
    BE->>DB: Trừ entryFee từ ví Owner
    BE->>DB: Thêm registration { approvalStatus: Pending,<br/>jockeyResponse: Pending }
    BE->>Jockey: notify "Có lời mời cưỡi race XYZ"

    Note over Jockey,BE: Phase 2: Jockey response
    alt Jockey accept (trong 7 ngày trước race)
        Jockey->>BE: PATCH /api/jockey/ride-offers/:raceId/:regId<br/>{ action: "accept" }
        BE->>DB: jockeyResponse.status = Accepted
        BE->>Owner: notify "Jockey đồng ý"
    else Jockey decline
        Jockey->>BE: PATCH /...<br/>{ action: "decline", reason: "Bận lịch" }
        BE->>DB: Hoàn entryFee → ví Owner (REFUND tx)
        BE->>DB: Xoá registration
        BE->>DB: Clear horse.currentJockey nếu match
        BE->>Owner: notify "Jockey từ chối + hoàn 300k VND"
    end

    Note over Referee,BE: Phase 3: Referee approve
    Referee->>BE: GET /api/referee/pending-registrations
    BE-->>Referee: List Pending có jockeyResponse=Accepted
    Referee->>BE: PATCH /api/referee/races/:id/registrations/:regId<br/>{ action: "approve" }
    BE->>DB: Validate jockey.licenseNumber, horse.status=Active
    BE->>DB: approvalStatus = Approved
    BE->>Owner: notify "Đăng ký đã được duyệt"

    Note over Referee,BE: Phase 4 (optional): Penalty trước race
    Referee->>BE: POST /api/referee/races/:id/registrations/:regId/penalty<br/>{ reason, timePenaltySec }
    BE->>DB: registration.penalties.push(...)

    Note over Referee,BE: Phase 5: Chốt kết quả (race day)
    Referee->>BE: POST /api/referee/races/:id/results<br/>{ results: [{ regId, rank, finishTimeSec }] }
    BE->>DB: Update registration.finalRank + finishTimeSec
    BE->>DB: Horse.rankCounts.rank1++ (etc)
    BE->>DB: Jockey.rankCounts.rank1++, rating recalc
    BE->>DB: race.status = Finished

    par Prize payout
        BE->>DB: credit prize → Owner
        BE->>Owner: notify "+9.000.000 VND tiền thưởng"
    and Hire fee + bonus
        BE->>DB: transfer hireFee Owner→Jockey
        BE->>Jockey: notify "+500.000 VND tiền cưỡi"
        BE->>DB: transfer bonus%×prize Owner→Jockey (nếu winner)
        BE->>Jockey: notify "+900.000 VND bonus"
    end

    Note over Referee,BE: Phase 6: Sửa kết quả nếu sai (180 phút)
    Referee->>BE: PATCH /api/referee/races/:id/results<br/>{ results }
    alt Trong 180 phút
        BE->>DB: Update finalRank
    else Sau 180 phút
        BE-->>Referee: 403 — chỉ admin sửa được
    end
```

**Key design points:**
- Owner trả entryFee NGAY khi đăng ký → cam kết
- Jockey decline trong deadline → tự refund + remove → owner dễ đăng ký lại
- 1 jockey không cưỡi 2 ngựa cùng race (physical constraint)
- Referee approve cần jockey.licenseNumber + horse.status=Active
- Payout (prize/hireFee/bonus) atomic qua walletService với `payoutDone`/`bonusPaid` flags
- Edit window 180 phút cân bằng giữa "fix typo" và "data integrity"

---

## 3. Gift redemption với voucher code

EndUser đổi điểm lấy code 10 ký tự thay vì vật phẩm vật chất.

```mermaid
sequenceDiagram
    autonumber
    actor User as EndUser
    participant BE as Backend
    participant DB as MongoDB

    User->>BE: GET /api/enduser/gifts
    BE-->>User: List gifts (active, còn quantity > 0)

    User->>BE: POST /api/enduser/gifts/:id/redeem
    BE->>DB: findOneAndUpdate({ active: true, quantity > 0 },<br/>{ $inc: { quantity: -1 } })
    alt Gift hết / disabled
        BE-->>User: 400 "Gift sold out or unavailable"
    end

    BE->>DB: findOneAndUpdate({ points >= pointsCost },<br/>{ $inc: { points: -pointsCost } })
    alt Không đủ điểm
        BE->>DB: Rollback gift.quantity (++)
        BE-->>User: 400 "Insufficient points"
    end

    loop Retry max 5 lần nếu code collision
        BE->>BE: code = [A-Z]{4} + [0-9]{6}<br/>vd "BHUW194722"
        BE->>DB: GiftRedemption.create({ code, giftNameSnapshot,<br/>description, pointsPaid, status: "Issued" })
        alt Duplicate key (cực hiếm)
            BE->>BE: Sinh lại code khác
        else OK
            Note over BE: thoát loop
        end
    end

    BE->>User: notify "Đổi quà thành công — mã code: BHUW194722"
    BE-->>User: { code, description, pointsPaid, remainingPoints }

    Note over User,BE: Khi user dùng code
    User->>BE: Mang code BHUW194722 đến điểm áp dụng
    actor Admin
    Admin->>BE: PATCH /api/admin/redemptions/:id/deliver<br/>{ action: "use" }
    BE->>DB: status = Used, usedAt = now

    Note over Admin,BE: Hoặc invalidate code nếu lộ
    Admin->>BE: PATCH /api/admin/redemptions/:id/deliver<br/>{ action: "cancel" }
    BE->>DB: status = Cancelled
```

**Key design points:**
- Atomic decrement gift.quantity → race condition safe
- Rollback points nếu code generation fail (cực hiếm)
- Description snapshot từ gift → user xem lại trong lịch sử dù gift bị admin sửa
- Status enum: `Issued` (vừa cấp) → `Used` (đã dùng) hoặc `Cancelled` (admin huỷ)

---

## 4. Race simulation (Konami-style)

Trọng tài có thể chạy mô phỏng để test trước khi chốt thật.

```mermaid
sequenceDiagram
    autonumber
    actor Referee
    participant BE as Backend
    participant Sim as Simulation Engine
    participant DB as MongoDB

    Note over Referee,BE: Test mode (KHÔNG persist)
    Referee->>BE: POST /api/referee/races/:id/auto-finalize<br/>{ testMode: true }
    BE->>Sim: simulateRace(race)
    Sim->>DB: Load horses + jockeys
    loop For each approved registration
        Sim->>Sim: score = ability + fitBonus + jockeyRating×0.2 + winRate×10<br/>+ random(-15..+15) - totalPenaltySec × 2
    end
    Sim-->>BE: scored[] (sorted desc)
    BE-->>Referee: { isTest: true, simulation: results }
    Note over Referee,BE: ⚠️ KHÔNG ghi DB, không payout

    Note over Referee,BE: Chạy thật (commit)
    Referee->>BE: POST /api/referee/races/:id/auto-finalize
    BE->>Sim: simulateRace(race) (lần này persist)
    Sim-->>BE: scored[]
    BE->>DB: Set finalRank + finishTimeSec cho mỗi reg
    BE->>BE: finalizeRace(race) — chạy toàn bộ payout
    BE-->>Referee: { isTest: false, race, payoutFailures: [] }
```

**Key design points:**
- `testMode=true` chạy hoàn toàn an toàn, response có cờ `isTest` để FE hiển thị watermark
- Sau khi test ưng ý, gọi cùng endpoint không có testMode để commit thật
- Random variance đảm bảo cùng input → output khác nhau (realism)
- Penalty từ referee TRỪ score → ngựa vi phạm dễ rớt hạng

---

## 5. Jockey license request

Jockey phải chủ động yêu cầu license, không tự động vào hàng đợi admin.

```mermaid
sequenceDiagram
    autonumber
    actor Jockey
    actor Admin
    participant BE as Backend
    participant DB as MongoDB

    Note over Jockey,BE: Đăng ký account (mới)
    Jockey->>BE: POST /api/auth/register { role: "Jockey", ... }
    BE->>DB: Tạo Jockey doc (licenseNumber=null, licenseRequestedAt=null)
    Note over BE: KHÔNG vào hàng đợi admin

    Note over Jockey,BE: Submit yêu cầu license
    Jockey->>BE: POST /api/jockey/license/request<br/>{ note, documents: [url1, url2] }
    BE->>DB: licenseRequestedAt = now,<br/>licenseRequestNote, licenseDocuments

    Note over Admin,BE: Admin xem queue
    Admin->>BE: GET /api/admin/jockeys/pending-licenses
    BE->>DB: Jockey.find({ licenseRequestedAt: { $ne: null },<br/>licenseNumber: null })
    BE-->>Admin: List sort theo licenseRequestedAt ASC<br/>+ daysWaiting

    alt Approve
        Admin->>BE: PATCH /api/admin/jockeys/:id/license<br/>{ action: "approve" }
        BE->>BE: license = "JKY-2026-A1B2C3" (auto-gen)
        BE->>DB: licenseNumber = "JKY-...",<br/>licenseRequestedAt = null (rời queue)
        BE->>Jockey: notify "License approved: JKY-2026-A1B2C3"
    else Reject
        Admin->>BE: PATCH /api/admin/jockeys/:id/license<br/>{ action: "reject", reason: "Thiếu giấy tờ" }
        BE->>DB: licenseRejectReason = "...",<br/>giữ licenseRequestedAt
        BE->>Jockey: notify "Bị từ chối: ..."

        Note over Jockey,BE: Resubmit sau khi fix
        Jockey->>BE: POST /api/jockey/license/request<br/>{ note: "Đã bổ sung", documents: [...] }
        BE->>DB: Clear licenseRejectReason,<br/>cập nhật licenseRequestedAt = now
    end

    Note over Jockey,BE: Check status (FE poll)
    Jockey->>BE: GET /api/jockey/license
    BE-->>Jockey: { state: NotRequested | Pending | Approved | Rejected }
```

**Key design points:**
- 2-step opt-in (signup → request) → tránh spam dashboard admin
- Resubmit dùng cùng endpoint, tự clear rejectReason
- License number tự gen format `JKY-YYYY-XXXXXX`
- FE state machine 4 states để render đúng nút (Yêu cầu / Đang chờ / Active / Nộp lại)

---

## Reference

| Flow | Endpoint chính |
|---|---|
| 1. VNPay deposit | `POST /api/wallet/deposit` → `GET /api/vnpay/ipn` |
| 2. Race lifecycle | `POST /api/owner/races/:id/register` → `POST /api/referee/races/:id/results` |
| 3. Gift redemption | `POST /api/enduser/gifts/:id/redeem` |
| 4. Race simulation | `POST /api/referee/races/:id/auto-finalize` |
| 5. License request | `POST /api/jockey/license/request` → `PATCH /api/admin/jockeys/:id/license` |
