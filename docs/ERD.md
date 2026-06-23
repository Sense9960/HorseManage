# ERD - HorseManage

Schema database MongoDB (Mongoose). User dùng discriminator pattern — 5 role chia sẻ 1 collection `users` qua field `role`.

## Sơ đồ tổng quan

```mermaid
erDiagram
    USER ||--o| ADMIN : "role=Admin"
    USER ||--o| JOCKEY : "role=Jockey"
    USER ||--o| OWNER_HORSE : "role=OwnerHorse"
    USER ||--o| REFEREE : "role=Referee"
    USER ||--o| END_USER : "role=EndUser"

    OWNER_HORSE ||--o{ HORSE : "owns"
    JOCKEY ||--o{ HORSE : "currentJockey (assigned)"
    END_USER }o--o{ JOCKEY : "favorites"

    REFEREE ||--o{ RACE : "officiates"
    RACE ||--o{ REGISTRATION : "embeds"
    REGISTRATION }o--|| HORSE : "horse"
    REGISTRATION }o--|| JOCKEY : "jockey"
    REGISTRATION }o--|| OWNER_HORSE : "owner"
    RACE }o--o{ OWNER_HORSE : "invitedOwners"

    USER ||--|| WALLET : "1 per user"
    WALLET ||--o{ WALLET_TX : "history"

    END_USER ||--o{ PREDICTION : "places"
    PREDICTION }o--|| RACE : "on"
    PREDICTION }o--|| REGISTRATION : "predicts"

    END_USER ||--o{ GIFT_REDEMPTION : "redeems"
    GIFT_REDEMPTION }o--|| GIFT : "of"

    USER ||--o{ NOTIFICATION : "inbox"
    USER ||--o{ ISSUE_REPORT : "files"
```

---

## User (base + 5 discriminators)

```mermaid
erDiagram
    USER {
        ObjectId _id PK
        string   username UK
        string   email UK
        string   password "select:false; required khi authProvider=local"
        string   fullName
        string   authProvider "local|google"
        string   googleId UK
        string   phone
        string   avatar
        Date     dateOfBirth
        string   gender "Male|Female|Other"
        string   address
        string   role "Admin|Jockey|OwnerHorse|Referee|EndUser"
        string   status "Active|Inactive|Banned"
        boolean  isVerified
        Date     lastLoginAt
        Date     createdAt
        Date     updatedAt
    }

    ADMIN {
        array  permissions
        string department
    }

    JOCKEY {
        string licenseNumber UK
        number experienceYears
        number weightKg
        number heightCm
        number totalRaces
        number totalWins
        number rating "= totalWins/totalRaces * 100"
        number pricePerRace
        object rankCounts "rank1, rank2, rank3, others"
        string licenseRejectReason
        Date   licenseRequestedAt "set khi jockey nộp yêu cầu cấp license"
        string licenseRequestNote
        array  licenseDocuments "URL[]"
    }

    OWNER_HORSE {
        string companyName
        string taxCode
        string stableName
        string stableAddress
        array  horses "ObjectId[] (denormalized)"
        array  silks "logo/colors"
    }

    REFEREE {
        string refereeCertNumber
        string specialization
        number totalRacesOfficiated
    }

    END_USER {
        array  favoriteJockeys "ObjectId[]"
        string membershipLevel "Bronze|Silver|Gold|Platinum"
        number points "vd. 500 khi đăng ký, +100 mỗi check-in"
        Date   lastCheckInAt
        number checkInStreak
        number totalCheckIns
    }
```

---

## Horse

```mermaid
erDiagram
    HORSE {
        ObjectId _id PK
        string   name
        string   breed "Thoroughbred|Arabian|Quarter Horse|Standardbred|Appaloosa|Mustang"
        string   color
        string   gender "Colt|Stallion|Gelding|Filly|Mare"
        Date     dateOfBirth
        number   weightKg
        number   heightCm
        string   registrationNumber UK
        ObjectId owner FK "→ User"
        ObjectId currentJockey FK "→ User; clear khi jockey decline"
        string   status "Active|Resting|Injured|Retired"
        number   totalRaces
        number   totalWins
        object   rankCounts "rank1, rank2, rank3, others"
        number   speedRating "0-100 (race sim)"
        number   staminaRating "0-100 (race sim)"
        number   preferredDistanceM
        string   notes
    }
```

---

## Race + Registration (embedded)

```mermaid
erDiagram
    RACE ||--o{ REGISTRATION : "embeds"
    REGISTRATION ||--o{ PENALTY : "embeds"

    RACE {
        ObjectId _id PK
        string   name
        Date     raceDate
        string   location
        number   distanceM
        string   status "Draft|Open|Locked|Finished|Cancelled"
        ObjectId referee FK
        number   prizeMoney
        number   entryFee
        boolean  addEntryFeeToPrize
        array    prizeDistribution "[{rank, percent}] default 60/30/10"
        array    invitedOwners "ObjectId[] — admin mời"
        Date     finalizedAt "set khi submitResults"
    }

    REGISTRATION {
        ObjectId _id PK
        ObjectId horse FK
        ObjectId jockey FK
        ObjectId owner FK
        string   approvalStatus "Pending|Approved|Rejected|Banned"
        string   rejectReason
        number   finalRank
        number   finishTimeSec "time về đích (giây)"
        number   hireFee "Owner trả jockey"
        number   jockeyBonusPercent "% prize chia thêm cho jockey"
        number   entryFeePaid "snapshot fee"
        boolean  payoutDone "hireFee đã trả?"
        boolean  bonusPaid "bonus % đã trả?"
        object   jockeyResponse "{status, respondedAt, declineReason}"
        number   oddTop1
        number   oddTop2
        number   oddTop3
    }

    PENALTY {
        ObjectId _id PK
        string   reason "lý do phạt"
        number   timePenaltySec "giây phạt — trừ score khi simulate"
        ObjectId addedBy FK "referee"
        Date     addedAt
    }
```

---

## Wallet + Transaction

```mermaid
erDiagram
    WALLET ||--o{ WALLET_TX : "history"

    WALLET {
        ObjectId _id PK
        ObjectId user FK
        number   balance
        string   currency "VND"
        Date     createdAt
        Date     updatedAt
    }

    WALLET_TX {
        ObjectId _id PK
        ObjectId wallet FK
        ObjectId user FK
        string   type "Deposit|Withdraw|Prize|HireFeeIn|HireFeeOut|Bonus|Refund|EntryFee|Adjustment"
        string   direction "Credit|Debit"
        number   amount
        number   balanceAfter
        string   status "Pending|Success|Failed"
        string   reference "txnRef VNPay hoặc raceId"
        string   externalRef UK "vnpay:HM...; dedupe IPN"
        string   description
        object   payoutInfo "bankName, accountNumber, accountName (cho withdraw)"
        ObjectId reviewedBy FK "admin (cho withdraw)"
        Date     reviewedAt
        string   reviewNote
    }
```

---

## Prediction (EndUser bet)

```mermaid
erDiagram
    PREDICTION {
        ObjectId _id PK
        ObjectId user FK "EndUser"
        ObjectId race FK
        ObjectId registration FK "ngựa được dự đoán"
        string   predictionType "Top1|Top2|Top3"
        number   stake "điểm cược"
        number   oddsAtPlacement "snapshot odd"
        number   potentialPayout
        string   status "Pending|Won|Lost"
        number   pointsWon
        Date     settledAt
    }
```

---

## Gift + Voucher Code

```mermaid
erDiagram
    GIFT ||--o{ GIFT_REDEMPTION : "issued"

    GIFT {
        ObjectId _id PK
        string   name
        string   description
        number   pointsCost
        number   quantity
        string   imageUrl
        boolean  active
        ObjectId createdBy FK
    }

    GIFT_REDEMPTION {
        ObjectId _id PK
        ObjectId user FK "EndUser"
        ObjectId gift FK
        string   giftNameSnapshot "denormalize"
        number   pointsPaid
        string   code UK "10 ký tự: 4 chữ + 6 số, vd BHUW194722"
        string   description "snapshot gift.description"
        string   status "Issued|Used|Cancelled"
        Date     usedAt
        Date     createdAt
    }
```

---

## Notification + Issue

```mermaid
erDiagram
    NOTIFICATION {
        ObjectId _id PK
        ObjectId user FK
        string   type "RegistrationApproved|RaceFinished|PrizePaid|WalletCredit|..."
        string   title
        string   body
        object   data "raceId, registrationId, amount, ..."
        boolean  read
        Date     readAt
        Date     createdAt
    }

    ISSUE_REPORT {
        ObjectId _id PK
        ObjectId reportedBy FK
        string   subject
        string   description
        string   category "Bug|Feature|Complaint"
        string   status "Open|InProgress|Resolved|Closed"
        ObjectId resolvedBy FK "admin"
        Date     resolvedAt
        string   resolution
    }
```

---

## Indexes quan trọng

| Collection | Index | Lý do |
|---|---|---|
| `users` | `username UK`, `email UK`, `googleId UK sparse` | Auth lookup |
| `horses` | `registrationNumber UK sparse`, `owner`, `currentJockey` | List + filter nhanh |
| `races` | `registrations.horse`, `registrations.jockey` | Tìm race của jockey/ngựa nhanh |
| `wallettransactions` | `wallet`, `user`, `externalRef` | History + dedupe IPN |
| `predictions` | `user`, `race` | EndUser xem dự đoán |
| `gifts` | (id), `active+quantity` | Atomic redeem |
| `giftredemptions` | `code UK sparse`, `user` | Tra code, lịch sử |
| `notifications` | `user` | Inbox |

---

## Cardinality summary

- 1 User → 0..1 Wallet
- 1 OwnerHorse → 0..N Horse
- 1 Horse → 0..1 currentJockey (Jockey)
- 1 Referee → 0..N Race
- 1 Race → 0..N Registration (embedded)
- 1 Registration → 0..N Penalty (embedded)
- 1 EndUser → 0..N Prediction
- 1 Gift → 0..N GiftRedemption
- 1 User → 0..N Notification
