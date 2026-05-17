# ERD - HorseManage

## Sơ đồ thực thể

```mermaid
erDiagram
    USER ||--o| ADMIN : "role = Admin"
    USER ||--o| JOCKEY : "role = Jockey"
    USER ||--o| OWNER_HORSE : "role = OwnerHorse"
    USER ||--o| END_USER : "role = EndUser"
    OWNER_HORSE ||--o{ HORSE : "owns"
    JOCKEY ||--o{ HORSE : "rides"
    END_USER }o--o{ JOCKEY : "favorites"

    USER {
        ObjectId _id PK
        string   username UK
        string   email UK
        string   password
        string   fullName
        string   phone
        string   avatar
        date     dateOfBirth
        string   gender
        string   address
        string   role "Admin|Jockey|OwnerHorse|EndUser"
        string   status "Active|Inactive|Banned"
        boolean  isVerified
        date     lastLoginAt
        date     createdAt
        date     updatedAt
    }

    ADMIN {
        ObjectId _id PK,FK
        string[] permissions
        string   department
    }

    JOCKEY {
        ObjectId _id PK,FK
        string   licenseNumber UK
        number   experienceYears
        number   weightKg
        number   heightCm
        number   totalRaces
        number   totalWins
        number   rating
    }

    OWNER_HORSE {
        ObjectId _id PK,FK
        string   companyName
        string   taxCode UK
        string   stableName
        string   stableAddress
        ObjectId[] horses FK
    }

    END_USER {
        ObjectId _id PK,FK
        ObjectId[] favoriteJockeys FK
        string   membershipLevel "Bronze|Silver|Gold|Platinum"
        number   points
    }

    HORSE {
        ObjectId _id PK
        string   name
        string   breed
        string   color
        string   gender "Stallion|Mare|Gelding"
        date     dateOfBirth
        number   weightKg
        number   heightCm
        string   registrationNumber UK
        ObjectId owner FK
        ObjectId currentJockey FK
        string   status "Active|Resting|Injured|Retired"
        number   totalRaces
        number   totalWins
        string   notes
        date     createdAt
        date     updatedAt
    }
```

## Phân quyền (Roles)

| Role | Mô tả | Cột riêng |
|------|-------|-----------|
| **Admin** | Quản trị hệ thống | `permissions`, `department` |
| **Jockey** | Nài ngựa (người cưỡi ngựa thi đấu) | `licenseNumber`, `experienceYears`, `weightKg`, `heightCm`, `totalRaces`, `totalWins`, `rating` |
| **OwnerHorse** | Chủ ngựa / chủ chuồng | `companyName`, `taxCode`, `stableName`, `stableAddress`, `horses[]` |
| **EndUser** | Người dùng cuối (fan, khán giả) | `favoriteJockeys[]`, `membershipLevel`, `points` |

## Endpoints

| Method | URL | Mô tả | Auth |
|--------|-----|-------|------|
| POST | `/api/auth/register` | Đăng ký (truyền `role`) | ❌ |
| POST | `/api/auth/login` | Đăng nhập | ❌ |
| GET  | `/api/auth/me` | Thông tin user hiện tại | ✅ Bearer |
| GET  | `/api/admin/ping` | Test phân quyền Admin | ✅ Admin |
| GET  | `/api/jockey/ping` | Test phân quyền Jockey | ✅ Jockey |
| GET  | `/api/owner/ping` | Test phân quyền OwnerHorse | ✅ OwnerHorse |

## Ví dụ request

### Register (Jockey)
```json
POST /api/auth/register
{
  "username": "jockey01",
  "email": "jockey01@example.com",
  "password": "123456",
  "fullName": "Nguyễn Văn A",
  "role": "Jockey",
  "licenseNumber": "JK-001",
  "experienceYears": 3,
  "weightKg": 55,
  "heightCm": 165
}
```

### Login
```json
POST /api/auth/login
{
  "emailOrUsername": "jockey01@example.com",
  "password": "123456"
}
```

## Biến môi trường (.env)
```
MONGODB_URL=mongodb://localhost:27017/horsemanage
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
PORT=3000
```
