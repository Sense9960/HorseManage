const okResponse = (description) => ({
    description,
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/ApiResponse' },
        },
    },
});

const swaggerSpec = {
    openapi: '3.0.3',
    info: {
        title: 'HorseManage API',
        version: '1.2.0',
        description:
            'API quản lý đua ngựa. Auth dùng JWT Bearer. Routes tách theo role: Admin / Owner / Jockey / Referee / EndUser (≡ Spectator).',
    },
    servers: [{ url: '/', description: 'Current host' }],
    tags: [
        { name: 'Auth', description: 'Đăng ký / đăng nhập' },
        { name: 'Admin', description: 'Quản trị viên: user, race, gift, withdraw approval' },
        { name: 'Owner', description: 'OwnerHorse: quản lý ngựa, đăng ký race' },
        { name: 'Jockey', description: 'Jockey: profile + ngựa đang cưỡi' },
        { name: 'Referee', description: 'Race Referee: duyệt jockey + chốt kết quả race' },
        { name: 'EndUser', description: 'EndUser (Spectator): follow jockey + đổi quà' },
        { name: 'Notifications', description: 'Inbox thông báo cho user (mọi role)' },
        { name: 'Wallet', description: 'Ví tiền (Owner + Jockey) — đơn vị VND. Deposit qua VNPay sandbox (NCB test card), Withdraw cần admin duyệt.' },
        { name: 'VNPay', description: 'Callback từ VNPay (return URL cho browser + IPN server-to-server)' },
        { name: 'Predictions', description: 'EndUser betting: stake points on Top1/2/3 finishers' },
        { name: 'Issues', description: 'User-submitted issue/bug reports to admin' },
        { name: 'Weather', description: 'OpenWeatherMap proxy — search địa điểm, current + forecast cho race' },
        { name: 'Races', description: 'Endpoint chung mọi role: bảng xếp hạng race theo ID' },
        { name: 'AI Predictions', description: 'Chatbox AI (DeepSeek) dự đoán % thắng theo race — dựa trên số liệu lịch sử ngựa/jockey, không phải cá cược thật' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
            ApiResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', example: 'Success' },
                    message: { type: 'string' },
                    data: {},
                },
            },
            RegisterInput: {
                type: 'object',
                required: ['username', 'email', 'password', 'fullName'],
                properties: {
                    username: { type: 'string', example: 'jockey01' },
                    email: { type: 'string', example: 'jockey01@example.com' },
                    password: { type: 'string', example: 'secret123' },
                    fullName: { type: 'string', example: 'Nguyen Van A' },
                    role: {
                        type: 'string',
                        enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'],
                        example: 'EndUser',
                    },
                },
            },
            LoginInput: {
                type: 'object',
                required: ['emailOrUsername', 'password'],
                properties: {
                    emailOrUsername: { type: 'string', example: 'jockey01@example.com' },
                    password: { type: 'string', example: 'secret123' },
                },
            },
            HorseInput: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', example: 'Thunderbolt' },
                    breed: { type: 'string', example: 'Thoroughbred' },
                    color: { type: 'string', example: 'Bay' },
                    gender: { type: 'string', enum: ['Stallion', 'Mare', 'Gelding'] },
                    dateOfBirth: { type: 'string', format: 'date' },
                    weightKg: { type: 'number', example: 450 },
                    heightCm: { type: 'number', example: 160 },
                    registrationNumber: { type: 'string' },
                    status: { type: 'string', enum: ['Active', 'Resting', 'Injured', 'Retired'] },
                    notes: { type: 'string' },
                },
            },
        },
    },
    paths: {
        '/api/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Đăng ký tài khoản',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/RegisterInput' },
                        },
                    },
                },
                responses: { 201: okResponse('Đăng ký thành công'), 409: okResponse('Đã tồn tại') },
            },
        },
        '/api/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Đăng nhập',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/LoginInput' },
                        },
                    },
                },
                responses: { 200: okResponse('Đăng nhập thành công'), 401: okResponse('Sai thông tin') },
            },
        },
        '/api/auth/google': {
            post: {
                tags: ['Auth'],
                summary: 'Đăng nhập bằng Google ID token',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['idToken'],
                                properties: {
                                    idToken: { type: 'string' },
                                    role: { type: 'string', enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 401: okResponse('Token không hợp lệ') },
            },
        },
        '/api/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Thông tin tài khoản hiện tại',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK'), 401: okResponse('Chưa đăng nhập') },
            },
        },

        '/api/admin/users': {
            get: {
                tags: ['Admin'],
                summary: 'List users with filters (each item includes walletBalance if has wallet)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'role', in: 'query', schema: { type: 'string', enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'] } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Active', 'Inactive', 'Banned'] } },
                    { name: 'hasLicense', in: 'query', schema: { type: 'boolean' }, description: 'Jockey-only: true = licensed, false = pending' },
                    { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive in fullName/username/email' },
                ],
                responses: { 200: okResponse('OK'), 403: okResponse('Không có quyền') },
            },
            post: {
                tags: ['Admin'],
                summary: 'Create a new user with any role (password optional, auto-gen if missing)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['username', 'email', 'fullName', 'role'],
                                properties: {
                                    username: { type: 'string' },
                                    email: { type: 'string' },
                                    fullName: { type: 'string' },
                                    role: { type: 'string', enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'] },
                                    password: { type: 'string', minLength: 6, description: 'Optional — auto-generated if omitted' },
                                    phone: { type: 'string' },
                                    avatar: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 201: okResponse('Created — generatedPassword in response if not provided') },
            },
        },
        '/api/admin/users/{id}': {
            get: {
                tags: ['Admin'],
                summary: 'User detail (Owner kèm horseCount + walletBalance)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 404: okResponse('Không tìm thấy') },
            },
            put: {
                tags: ['Admin'],
                summary: 'Update user (whitelist: common + role-specific fields)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    avatar: { type: 'string' },
                                    address: { type: 'string' },
                                    dateOfBirth: { type: 'string', format: 'date' },
                                    gender: { type: 'string', enum: ['Male', 'Female', 'Other'] },
                                    isVerified: { type: 'boolean' },
                                    status: { type: 'string', enum: ['Active', 'Inactive', 'Banned'] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
            delete: {
                tags: ['Admin'],
                summary: 'Xóa người dùng',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Đã xóa'), 404: okResponse('Không tìm thấy') },
            },
        },
        '/api/admin/users/{id}/role': {
            patch: {
                tags: ['Admin'],
                summary: 'Change user role (unsets old role-specific fields)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['role'],
                                properties: {
                                    role: { type: 'string', enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 400: okResponse('Same role / cannot change self') },
            },
        },
        '/api/admin/users/{id}/reset-password': {
            post: {
                tags: ['Admin'],
                summary: 'Reset user password (returns new password in response)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    newPassword: { type: 'string', minLength: 6, description: 'Optional — auto-generated if omitted' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK — newPassword in response') },
            },
        },
        '/api/admin/users/{id}/predictions': {
            get: {
                tags: ['Admin', 'Predictions'],
                summary: 'Lịch sử đặt dự đoán kết quả (points-betting) của 1 user — có phân trang + summary',
                description: 'Xem các lượt user đặt điểm dự đoán Top1/2/3 (collection Prediction). KHÔNG liên quan AI predict.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Pending', 'Won', 'Lost', 'Refunded'] } },
                    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
                ],
                responses: {
                    200: okResponse('OK — { user, summary, pagination, items[] }'),
                    400: okResponse('ID không hợp lệ'),
                    404: okResponse('Không tìm thấy người dùng'),
                },
            },
        },
        '/api/admin/users/{id}/points': {
            patch: {
                tags: ['Admin'],
                summary: 'Cộng/trừ điểm thưởng của EndUser theo delta + lý do (gửi notification cho user)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['delta', 'reason'],
                                properties: {
                                    delta: { type: 'integer', description: 'Số điểm cộng (dương) hoặc trừ (âm), ≠ 0', example: 100 },
                                    reason: { type: 'string', example: 'Thưởng sự kiện' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — { userId, delta, reason, pointsBefore, points }'),
                    400: okResponse('delta/reason không hợp lệ, không phải EndUser, hoặc trừ quá số điểm'),
                    404: okResponse('Không tìm thấy người dùng'),
                },
            },
        },
        '/api/admin/users/{id}/status': {
            patch: {
                tags: ['Admin'],
                summary: 'Đổi trạng thái (ban/unban) người dùng',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['status'],
                                properties: {
                                    status: { type: 'string', enum: ['Active', 'Inactive', 'Banned'] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/jockeys/{id}/license': {
            patch: {
                tags: ['Admin'],
                summary: 'Approve or reject jockey license (license auto-generated on approve)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['action'],
                                properties: {
                                    action: { type: 'string', enum: ['approve', 'reject'] },
                                    licenseNumber: { type: 'string', description: 'Optional manual override on approve' },
                                    reason: { type: 'string', description: 'Required-ish for reject' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 400: okResponse('Already licensed when rejecting') },
            },
        },

        '/api/admin/races': {
            get: {
                tags: ['Admin'],
                summary: 'Danh sách race',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
            post: {
                tags: ['Admin'],
                summary: 'Tạo race mới (gán Referee)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'raceDate', 'refereeId'],
                                properties: {
                                    name: { type: 'string', example: 'Saigon Spring Derby 2026' },
                                    raceDate: { type: 'string', format: 'date-time' },
                                    location: { type: 'string' },
                                    distanceM: { type: 'integer', example: 1600 },
                                    refereeId: { type: 'string' },
                                    status: { type: 'string', enum: ['Draft', 'Open'], default: 'Open' },
                                    prizeMoney: { type: 'integer', minimum: 0, example: 10000000 },
                                    entryFee: { type: 'integer', minimum: 0, example: 500000, description: 'Owner pays this on register; 0 = free' },
                                    addEntryFeeToPrize: { type: 'boolean', default: false, description: 'If true, each paid entryFee grows prizeMoney' },
                                    registrationOpenAt: { type: 'string', format: 'date-time', description: 'Thời điểm mở đơn đăng ký (giờ:phút). Trước cái này Owner không đăng ký được.' },
                                    registrationCloseAt: { type: 'string', format: 'date-time', description: 'Thời điểm đóng đơn. Khi qua giờ này race tự Open → Locked. Phải ≤ raceDate.' },
                                    invitedOwners: { type: 'array', items: { type: 'string' }, description: 'Optional — mảng ownerId (OwnerHorse Active) được mời ngay khi tạo giải. Owner nhận notification + isInvited=true.' },
                                    prizeDistribution: {
                                        type: 'array',
                                        description: 'Default 60/30/10 for ranks 1/2/3 if omitted',
                                        items: {
                                            type: 'object',
                                            required: ['rank', 'percent'],
                                            properties: {
                                                rank: { type: 'integer', minimum: 1, example: 1 },
                                                percent: { type: 'number', minimum: 0, maximum: 100, example: 60 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { 201: okResponse('Đã tạo') },
            },
        },
        '/api/admin/horses': {
            get: {
                tags: ['Admin'],
                summary: 'List horses (filter by owner, status, name)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'ownerId', in: 'query', schema: { type: 'string' } },
                    { name: 'status', in: 'query', schema: { type: 'string' } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                ],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/horses/{id}/status': {
            patch: {
                tags: ['Admin'],
                summary: 'Change horse status (Active/Resting/Injured/Retired/Banned)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['status'],
                                properties: {
                                    status: { type: 'string', enum: ['Active', 'Resting', 'Injured', 'Retired', 'Banned'] },
                                    reason: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('Updated') },
            },
        },
        '/api/admin/horses/{id}': {
            delete: {
                tags: ['Admin'],
                summary: 'Delete a horse',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Deleted') },
            },
        },
        '/api/admin/races/{id}/odds': {
            patch: {
                tags: ['Admin', 'Predictions'],
                summary: 'Set prediction odds per registration on a race',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['odds'],
                                properties: {
                                    odds: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            required: ['registrationId'],
                                            properties: {
                                                registrationId: { type: 'string' },
                                                oddTop1: { type: 'number', minimum: 0, example: 4.5 },
                                                oddTop2: { type: 'number', minimum: 0, example: 2.2 },
                                                oddTop3: { type: 'number', minimum: 0, example: 1.4 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('Odds updated'), 400: okResponse('Race finished or invalid odds') },
            },
        },
        '/api/admin/races/{id}/resettle-predictions': {
            post: {
                tags: ['Admin', 'Predictions'],
                summary: 'Re-run settlement for Pending predictions on a Finished race',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 400: okResponse('Race not Finished') },
            },
        },
        '/api/admin/withdrawals': {
            get: {
                tags: ['Admin'],
                summary: 'Yêu cầu rút tiền chờ duyệt (FIFO)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/withdrawals/{txId}': {
            patch: {
                tags: ['Admin'],
                summary: 'Duyệt hoặc từ chối yêu cầu rút (từ chối tự refund)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'txId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['action'],
                                properties: {
                                    action: { type: 'string', enum: ['approve', 'reject'] },
                                    note: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },

        '/api/admin/gifts': {
            get: {
                tags: ['Admin'],
                summary: 'Danh sách quà',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
            post: {
                tags: ['Admin'],
                summary: 'Tạo quà mới (EndUser dùng điểm đổi)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'pointsCost', 'quantity'],
                                properties: {
                                    name: { type: 'string', example: 'Áo phông HorseManage' },
                                    description: { type: 'string' },
                                    pointsCost: { type: 'integer', minimum: 1, example: 300 },
                                    quantity: { type: 'integer', minimum: 0, example: 20 },
                                    imageUrl: { type: 'string' },
                                    active: { type: 'boolean', default: true },
                                },
                            },
                        },
                    },
                },
                responses: { 201: okResponse('Đã tạo') },
            },
        },
        '/api/admin/gifts/{id}': {
            patch: {
                tags: ['Admin'],
                summary: 'Cập nhật quà',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK') },
            },
            delete: {
                tags: ['Admin'],
                summary: 'Xoá quà',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Đã xoá') },
            },
        },
        '/api/admin/redemptions': {
            get: {
                tags: ['Admin'],
                summary: 'Danh sách lượt đổi mã voucher (code 10 ký tự)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['Issued', 'Used', 'Cancelled'] } }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/redemptions/{id}/deliver': {
            patch: {
                tags: ['Admin'],
                summary: 'Đánh dấu code đã được dùng hoặc huỷ',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    action: { type: 'string', enum: ['use', 'cancel'], default: 'use' },
                                    reason: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 400: okResponse('Code đã Used/Cancelled, không đổi nữa') },
            },
        },

        '/api/enduser/gifts': {
            get: {
                tags: ['EndUser'],
                summary: 'Quà có thể đổi (active + còn hàng)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/gifts/{id}/redeem': {
            post: {
                tags: ['EndUser'],
                summary: 'Đổi quà → nhận MÃ CODE 10 ký tự (4 chữ + 6 số) ngay lập tức',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    201: okResponse('OK — { redemption: { code, description, ... }, remainingPoints }'),
                    400: okResponse('Hết hàng / không đủ điểm'),
                },
            },
        },
        '/api/enduser/redemptions': {
            get: {
                tags: ['EndUser'],
                summary: 'Lịch sử đổi quà — gồm code, giftName, description, status',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK — [{ code, giftName, description, pointsPaid, status, redeemedAt }]') },
            },
        },

        '/api/owner/horses': {
            get: {
                tags: ['Owner'],
                summary: 'Danh sách ngựa của tôi',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
            post: {
                tags: ['Owner'],
                summary: 'Tạo ngựa mới',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/HorseInput' } },
                    },
                },
                responses: { 201: okResponse('Đã tạo') },
            },
        },
        '/api/owner/horses/{id}': {
            get: {
                tags: ['Owner'],
                summary: 'Chi tiết ngựa của tôi',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 403: okResponse('Không phải ngựa của bạn') },
            },
            put: {
                tags: ['Owner'],
                summary: 'Cập nhật ngựa',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/HorseInput' } },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
            delete: {
                tags: ['Owner'],
                summary: 'Xóa ngựa',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Đã xóa') },
            },
        },
        '/api/owner/races/{raceId}/register': {
            post: {
                tags: ['Owner'],
                summary: 'Đăng ký ngựa + jockey vào race (có thể kèm hireFee)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'raceId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['horseId'],
                                properties: {
                                    horseId: { type: 'string' },
                                    jockeyId: { type: 'string', description: 'Optional — defaults to horse.currentJockey if omitted' },
                                    hireFee: { type: 'integer', minimum: 0, example: 500000 },
                                    jockeyBonusPercent: { type: 'number', minimum: 0, maximum: 100, example: 10 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: okResponse('Đăng ký thành công, chờ referee duyệt'),
                    409: okResponse('Ngựa hoặc jockey đã đăng ký race này'),
                },
            },
        },
        '/api/owner/races': {
            get: {
                tags: ['Owner'],
                summary: 'List races Owner can browse (default: Draft + Open)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Draft', 'Open', 'Locked', 'Ranked', 'Finished', 'Cancelled', 'All'] } },
                ],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/owner/jockeys': {
            get: {
                tags: ['Owner'],
                summary: 'Browse hireable Jockeys (Active + licensed)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/owner/profile': {
            put: {
                tags: ['Owner'],
                summary: 'Update profile (locked: companyName, taxCode, role)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    avatar: { type: 'string', description: 'Image URL' },
                                    address: { type: 'string' },
                                    stableName: { type: 'string' },
                                    stableAddress: { type: 'string' },
                                    silks: {
                                        type: 'object',
                                        properties: {
                                            primaryColor: { type: 'string' },
                                            secondaryColor: { type: 'string' },
                                            pattern: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/owner/races/{raceId}/registrations/{regId}': {
            delete: {
                tags: ['Owner'],
                summary: 'Huỷ đăng ký race. Pending/Rejected: hoàn 100% entry fee. Approved: mất entry fee.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'raceId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    200: okResponse('OK — { refundedAmount, forfeitedFee, wasApproved }'),
                    400: okResponse('Race đã Locked/Finished/Cancelled — không huỷ được'),
                    403: okResponse('Không phải registration của bạn'),
                },
            },
        },
        '/api/owner/horses/{id}/jockey': {
            patch: {
                tags: ['Owner'],
                summary: 'Gán hoặc gỡ Jockey khỏi ngựa. Truyền { jockeyId } để gán, { clear: true } để gỡ.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    jockeyId: { type: 'string', description: 'ID Jockey để gán. Truyền null hoặc rỗng để gỡ.' },
                                    clear: { type: 'boolean', description: 'true để gỡ currentJockey, không cần jockeyId.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — gán hoặc gỡ thành công'),
                    400: okResponse('jockeyId không hợp lệ / Jockey không Active / không có license / không có jockey để gỡ'),
                },
            },
        },

        '/api/jockey/profile': {
            put: {
                tags: ['Jockey'],
                summary: 'Update profile (locked: licenseNumber, rating, totalRaces/Wins)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    avatar: { type: 'string' },
                                    address: { type: 'string' },
                                    experienceYears: { type: 'number' },
                                    weightKg: { type: 'number' },
                                    heightCm: { type: 'number' },
                                    pricePerRace: { type: 'number', minimum: 0, example: 500000 },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/horses': {
            get: {
                tags: ['Jockey'],
                summary: 'Danh sách ngựa tôi đang cưỡi',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/ride-offers': {
            get: {
                tags: ['Jockey'],
                summary: 'Lời mời cưỡi đang chờ phản hồi',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/ride-offers/{raceId}/{regId}': {
            patch: {
                tags: ['Jockey'],
                summary: 'Đồng ý hoặc từ chối lời mời (1 lần, không sửa lại được)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'raceId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['action'],
                                properties: {
                                    action: { type: 'string', enum: ['accept', 'decline'] },
                                    reason: { type: 'string', example: 'Trùng lịch race khác' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 400: okResponse('Đã phản hồi rồi') },
            },
        },

        '/api/wallet': {
            get: {
                tags: ['Wallet'],
                summary: 'Số dư ví của tôi (Owner / Jockey)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK'), 403: okResponse('Role không có ví') },
            },
        },
        '/api/wallet/transactions': {
            get: {
                tags: ['Wallet'],
                summary: 'Lịch sử giao dịch',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
                    { name: 'type', in: 'query', schema: { type: 'string', example: 'Prize' } },
                ],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/wallet/deposit': {
            post: {
                tags: ['Wallet'],
                summary: 'Tạo yêu cầu nạp tiền — trả về paymentUrl VNPay để FE redirect user',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount'],
                                properties: {
                                    amount: { type: 'integer', minimum: 10000, maximum: 500000000, example: 100000 },
                                },
                                description: 'Sandbox VNPay chỉ hỗ trợ NCB nên backend tự gắn cứng — FE không cần truyền bankCode.',
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — { paymentUrl, txnRef, txId, amount }. FE redirect user tới paymentUrl.'),
                    400: okResponse('amount < 10k hoặc > 500M'),
                },
            },
        },
        '/api/wallet/deposit/{txId}/status': {
            get: {
                tags: ['Wallet'],
                summary: 'Poll trạng thái 1 giao dịch nạp tiền (Pending → Success/Failed) — dùng sau khi user redirect về từ VNPay',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'txId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: okResponse('OK — { txId, amount, status, externalRef, createdAt, updatedAt }'),
                    404: okResponse('Không tìm thấy giao dịch của bạn'),
                },
            },
        },
        '/api/wallet/withdraw': {
            post: {
                tags: ['Wallet'],
                summary: 'Yêu cầu rút tiền (giữ ngay, chờ admin duyệt)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount', 'bankName', 'accountNumber', 'accountName'],
                                properties: {
                                    amount: { type: 'integer', minimum: 50000, example: 500000 },
                                    bankName: { type: 'string', example: 'Vietcombank' },
                                    accountNumber: { type: 'string', example: '0123456789' },
                                    accountName: { type: 'string', example: 'NGUYEN VAN A' },
                                },
                            },
                        },
                    },
                },
                responses: { 201: okResponse('Đã gửi yêu cầu'), 400: okResponse('Không đủ số dư') },
            },
        },
        '/api/vnpay/return': {
            get: {
                tags: ['VNPay'],
                summary: 'Return URL — VNPay redirect browser về sau khi user thanh toán xong (CHỈ hiển thị kết quả, KHÔNG credit ví)',
                parameters: [
                    { name: 'vnp_TxnRef', in: 'query', schema: { type: 'string' } },
                    { name: 'vnp_Amount', in: 'query', schema: { type: 'integer' } },
                    { name: 'vnp_ResponseCode', in: 'query', schema: { type: 'string' }, description: '00 = thành công' },
                    { name: 'vnp_SecureHash', in: 'query', schema: { type: 'string' } },
                ],
                responses: {
                    200: okResponse('OK — kết quả + isValid của hash. Nếu VNPAY_FRONTEND_RETURN_URL set thì redirect 302 sang FE.'),
                },
            },
        },
        '/api/vnpay/ipn': {
            get: {
                tags: ['VNPay'],
                summary: 'IPN URL — VNPay gọi server-to-server, đây là source of truth để credit ví (idempotent qua vnp_TxnRef)',
                parameters: [
                    { name: 'vnp_TxnRef', in: 'query', schema: { type: 'string' } },
                    { name: 'vnp_Amount', in: 'query', schema: { type: 'integer' } },
                    { name: 'vnp_ResponseCode', in: 'query', schema: { type: 'string' } },
                    { name: 'vnp_TransactionStatus', in: 'query', schema: { type: 'string' } },
                    { name: 'vnp_SecureHash', in: 'query', schema: { type: 'string' } },
                ],
                responses: {
                    200: okResponse('Response VNPay format: { RspCode, Message }. 00=OK, 01=Not Found, 02=Confirmed, 04=Invalid Amount, 97=Invalid Signature.'),
                },
            },
        },

        '/api/notifications': {
            get: {
                tags: ['Notifications'],
                summary: 'Inbox của tôi (kèm unreadCount)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
                ],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/notifications/{id}/read': {
            patch: {
                tags: ['Notifications'],
                summary: 'Đánh dấu 1 thông báo đã đọc',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 404: okResponse('Không tìm thấy') },
            },
        },
        '/api/notifications/mark-all-read': {
            post: {
                tags: ['Notifications'],
                summary: 'Đánh dấu tất cả là đã đọc',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },

        '/api/referee/races': {
            get: {
                tags: ['Referee'],
                summary: 'Danh sách race tôi được phân công',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/referee/races/{id}': {
            get: {
                tags: ['Referee'],
                summary: 'Chi tiết một race',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 403: okResponse('Không phải referee của race này') },
            },
        },
        '/api/referee/races/{id}/registrations/{regId}': {
            patch: {
                tags: ['Referee'],
                summary: 'Duyệt hoặc từ chối jockey cho race',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['action'],
                                properties: {
                                    action: { type: 'string', enum: ['approve', 'reject'] },
                                    reason: { type: 'string', example: 'Jockey vắng buổi cân' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK'), 400: okResponse('Race đã kết thúc / jockey không hợp lệ') },
            },
        },
        '/api/referee/races/{id}/simulate': {
            get: {
                tags: ['Referee'],
                summary: 'Preview simulated race result (no persistence)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Ranked simulation with score breakdown') },
            },
        },
        '/api/referee/races/{id}/auto-finalize': {
            post: {
                tags: ['Referee'],
                summary: 'Run simulation, persist ranks, and finalize the race',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Race auto-finalized'), 400: okResponse('No Approved registrations / already finished') },
            },
        },
        '/api/referee/races/{id}/confirm-results': {
            post: {
                tags: ['Referee'],
                summary: 'Xác nhận kết quả tạm → finalize: chia thưởng + status Finished (không sửa được nữa)',
                description: 'Chỉ gọi được khi race đang Ranked (đã chấm bằng submitResults). Finalize: payout + Finished. Sau bước này chỉ admin override được.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    resultProofImages: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Tùy chọn — mảng URL ảnh biên bản kết quả thực tế (PNG…). Không truyền / mảng rỗng = giữ nguyên, không xoá.',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — race Finished, đã payout'),
                    400: okResponse('Chưa có kết quả tạm / đã Finished'),
                },
            },
        },
        '/api/referee/races/{id}/results': {
            post: {
                tags: ['Referee'],
                summary: 'Chấm kết quả — race Locked → Ranked (bảng xếp hạng tạm); sửa được trong 3h, tự xác nhận sau 3h',
                description: 'Race chuyển sang Ranked (chưa payout). Chỉ gửi finishTimeSec (+ penalty nếu có) — BACKEND TỰ XẾP RANK theo effective time = finishTimeSec + tổng phạt Active; bị phạt chậm hơn con dưới thì tự tụt hạng. Phải chấm đủ mọi registration Approved. Gọi lại được để ghi đè trong cửa sổ 3h. Bấm /confirm-results để chốt sớm.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['results'],
                                properties: {
                                    results: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            required: ['registrationId', 'finishTimeSec'],
                                            properties: {
                                                registrationId: { type: 'string' },
                                                finishTimeSec: { type: 'number', minimum: 0.01, example: 92.45 },
                                                penalty: {
                                                    type: 'object',
                                                    description: 'Optional — ghi phạt khi chốt (vd: sai vạch xuất phát). reason BẮT BUỘC nếu có.',
                                                    required: ['reason', 'timePenaltySec'],
                                                    properties: {
                                                        reason: { type: 'string', example: 'Sai vạch xuất phát' },
                                                        timePenaltySec: { type: 'number', minimum: 0, example: 3 },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    resultProofImages: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Tùy chọn — mảng URL ảnh biên bản kết quả thực tế (PNG…). Không truyền / mảng rỗng = giữ nguyên, không xoá.',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK (có thể kèm payoutFailures nếu chuyển tiền lỗi)'),
                    400: okResponse('finishTimeSec thiếu / thiếu registration Approved / penalty.reason thiếu'),
                },
            },
            patch: {
                tags: ['Referee'],
                summary: 'Sửa kết quả khi race đang Ranked (trong cửa sổ 3h) — cùng schema body POST.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['results'],
                                properties: {
                                    results: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            required: ['registrationId', 'finishTimeSec'],
                                            properties: {
                                                registrationId: { type: 'string' },
                                                finishTimeSec: { type: 'number', minimum: 0.01 },
                                                penalty: {
                                                    type: 'object',
                                                    required: ['reason', 'timePenaltySec'],
                                                    properties: {
                                                        reason: { type: 'string' },
                                                        timePenaltySec: { type: 'number', minimum: 0 },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    resultProofImages: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Tùy chọn — mảng URL ảnh biên bản kết quả thực tế (PNG…). Không truyền / mảng rỗng = giữ nguyên, không xoá.',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — kết quả cập nhật, race vẫn Ranked'),
                    403: okResponse('Đã confirm/quá 3h — không sửa được, liên hệ admin'),
                },
            },
        },

        '/api/enduser/races': {
            get: {
                tags: ['EndUser', 'Predictions'],
                summary: 'List predictable races (Open/Locked with Approved registrations + odds)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/races/history': {
            get: {
                tags: ['EndUser', 'Predictions'],
                summary: 'My predicted-race history (Finished/Ranked races I bet on + full leaderboard + my payouts)',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: okResponse('Lịch sử giải đã dự đoán (summary + races[].leaderboard + myPredictions)'),
                    401: okResponse('Chưa đăng nhập'),
                },
            },
        },
        '/api/enduser/races/{raceId}/predict': {
            post: {
                tags: ['EndUser', 'Predictions'],
                summary: 'Place a prediction (deducts stake from points, snapshots odds)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'raceId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['registrationId', 'predictionType', 'stake'],
                                properties: {
                                    registrationId: { type: 'string' },
                                    predictionType: { type: 'string', enum: ['Top1', 'Top2', 'Top3'] },
                                    stake: { type: 'integer', minimum: 1, example: 100 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: okResponse('Prediction placed'),
                    400: okResponse('Insufficient points / race not Open / invalid odds'),
                },
            },
        },
        '/api/enduser/predictions': {
            get: {
                tags: ['EndUser', 'Predictions'],
                summary: 'My prediction history (filter by status)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['Pending', 'Won', 'Lost', 'Refunded'] } }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/profile': {
            put: {
                tags: ['EndUser'],
                summary: 'Update profile (locked: points, membershipLevel)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    fullName: { type: 'string' },
                                    phone: { type: 'string' },
                                    avatar: { type: 'string', description: 'Image URL' },
                                    address: { type: 'string' },
                                    dateOfBirth: { type: 'string', format: 'date' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/issues': {
            post: {
                tags: ['Issues'],
                summary: 'Submit an issue/bug report to admin (any role)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['title', 'content'],
                                properties: {
                                    title: { type: 'string', maxLength: 200 },
                                    content: { type: 'string' },
                                    imageUrl: { type: 'string', description: 'Optional screenshot URL' },
                                },
                            },
                        },
                    },
                },
                responses: { 201: okResponse('Submitted') },
            },
        },
        '/api/issues/mine': {
            get: {
                tags: ['Issues'],
                summary: 'My submitted issues',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/issues': {
            get: {
                tags: ['Admin', 'Issues'],
                summary: 'List all issues with filters + pagination',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Open', 'InProgress', 'Resolved', 'Closed'] } },
                    { name: 'fromDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'ISO date, inclusive' },
                    { name: 'toDate', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'ISO date, inclusive' },
                    { name: 'reporterRole', in: 'query', schema: { type: 'string', enum: ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'] } },
                    { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive in title+content' },
                    { name: 'sort', in: 'query', schema: { type: 'string', enum: ['-createdAt', 'createdAt', '-updatedAt', 'updatedAt'], default: '-createdAt' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
                    { name: 'skip', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
                ],
                responses: { 200: okResponse('OK — response includes pagination block') },
            },
        },
        '/api/admin/issues/{id}': {
            patch: {
                tags: ['Admin', 'Issues'],
                summary: 'Update issue status + reply',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    status: { type: 'string', enum: ['Open', 'InProgress', 'Resolved', 'Closed'] },
                                    adminReply: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/jockeys': {
            get: {
                tags: ['EndUser'],
                summary: 'Danh sách Jockey (public info)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/following': {
            get: {
                tags: ['EndUser'],
                summary: 'Danh sách Jockey đang follow',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/enduser/follow/{jockeyId}': {
            post: {
                tags: ['EndUser'],
                summary: 'Follow một Jockey',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'jockeyId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK') },
            },
            delete: {
                tags: ['EndUser'],
                summary: 'Bỏ follow một Jockey',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'jockeyId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/horses/{horseId}': {
            get: {
                tags: ['Jockey'],
                summary: 'Chi tiết 1 con ngựa jockey đang cưỡi (kèm lịch sử race + stats)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'horseId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: okResponse('OK — { horse, stats, upcomingRaces, raceHistory }'),
                    403: okResponse('Bạn không phải currentJockey của ngựa này'),
                    404: okResponse('Không tìm thấy ngựa'),
                },
            },
        },
        '/api/admin/races/{id}': {
            get: {
                tags: ['Admin'],
                summary: 'Chi tiết race (populate horse/jockey/owner + podium top 3 nếu Finished)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 404: okResponse('Không tìm thấy race') },
            },
            patch: {
                tags: ['Admin'],
                summary: 'Sửa race. Field nhạy cảm (prizeMoney/prizeDistribution/entryFee/referee) chỉ sửa được khi chưa có registration Approved.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    raceDate: { type: 'string', format: 'date-time' },
                                    location: { type: 'string' },
                                    distanceM: { type: 'integer' },
                                    status: { type: 'string', enum: ['Draft', 'Open', 'Locked', 'Cancelled'] },
                                    prizeMoney: { type: 'integer', minimum: 0 },
                                    prizeDistribution: {
                                        type: 'array',
                                        items: { type: 'object', properties: { rank: { type: 'integer' }, percent: { type: 'number' } } },
                                    },
                                    entryFee: { type: 'integer', minimum: 0 },
                                    addEntryFeeToPrize: { type: 'boolean' },
                                    refereeId: { type: 'string' },
                                    registrationOpenAt: { type: 'string', format: 'date-time', description: 'Sửa giờ mở đơn (bao gồm giờ:phút:giây)' },
                                    registrationCloseAt: { type: 'string', format: 'date-time', description: 'Sửa giờ đóng đơn. Phải > openAt và ≤ raceDate' },
                                    invitedOwners: { type: 'array', items: { type: 'string' }, description: 'Thay CẢ danh sách owner được mời. Owner mới thêm nhận notification.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — race + prizeBreakdown'),
                    400: okResponse('Race Finished hoặc sửa field nhạy cảm khi đã có Approved'),
                    404: okResponse('Không tìm thấy race / referee'),
                },
            },
            delete: {
                tags: ['Admin'],
                summary: 'Xoá race tạo nhầm. Chặn nếu race đã Finished hoặc có registration Approved. Auto refund entry fee cho owner Pending.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: okResponse('OK — { deletedRaceId, refunds[] }'),
                    400: okResponse('Race đã Finished hoặc có Approved registration'),
                    404: okResponse('Không tìm thấy race'),
                },
            },
        },
        '/api/owner/races/{raceId}': {
            get: {
                tags: ['Owner'],
                summary: 'Chi tiết race owner tham gia: participants + myRegistration + podium',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'raceId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 404: okResponse('Không tìm thấy race') },
            },
        },
        '/api/enduser/check-in': {
            get: {
                tags: ['EndUser'],
                summary: 'Trạng thái điểm danh (checkedInToday, streak, totalCheckIns, nextCheckInAt)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
            post: {
                tags: ['EndUser'],
                summary: 'Điểm danh hằng ngày — +100 điểm/ngày (1 lần/ngày)',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: okResponse('OK — { pointsEarned, points, checkInStreak, totalCheckIns }'),
                    400: okResponse('Hôm nay đã điểm danh rồi'),
                },
            },
        },
        '/api/referee/races': {
            get: {
                tags: ['Referee'],
                summary: 'Race của referee, nhóm sẵn theo upcoming/inProgress/finished/cancelled hoặc filter ?status=',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Draft', 'Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'] }, description: 'Bỏ trống để nhận response dạng bucket (có bucket ranked riêng)' },
                ],
                responses: { 200: okResponse('OK — buckets hoặc array tuỳ status param') },
            },
        },
        '/api/referee/races/{id}/registrations/{regId}/penalty': {
            post: {
                tags: ['Referee'],
                summary: 'Thêm phạt cho 1 registration (cộng thời gian khi simulate → tụt hạng)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['reason', 'timePenaltySec'],
                                properties: {
                                    reason: { type: 'string', example: 'Jockey sai vạch xuất phát' },
                                    timePenaltySec: { type: 'number', minimum: 0, example: 5 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — { penalties[], totalPenaltySec }'),
                    400: okResponse('Race đã Finished hoặc input không hợp lệ'),
                },
            },
        },
        '/api/referee/races/{id}/registrations/{regId}/penalty/{penaltyId}': {
            delete: {
                tags: ['Referee'],
                summary: 'Gỡ án phạt (soft cancel — giữ record + cancelReason cho audit)',
                description: 'Penalty status đổi Active → Cancelled. Simulation + finalRank tính lại bỏ qua penalty này. Nếu có appeal Pending → tự động Accept.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'penaltyId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['cancelReason'],
                                properties: {
                                    cancelReason: { type: 'string', example: 'Ghi nhầm jockey / Jockey kháng án thành công' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — penalty.status=Cancelled'),
                    400: okResponse('Race Finished hoặc penalty đã Cancelled'),
                    404: okResponse('Không tìm thấy phạt'),
                },
            },
        },
        '/api/referee/races/{id}/registrations/{regId}/penalty/{penaltyId}/appeal/{appealId}/reject': {
            patch: {
                tags: ['Referee'],
                summary: 'Từ chối kháng án của jockey (penalty vẫn còn hiệu lực)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'penaltyId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'appealId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['decisionNote'],
                                properties: {
                                    decisionNote: { type: 'string', example: 'Bằng chứng video xác nhận jockey sai luật' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — appeal.status=Rejected'),
                    400: okResponse('Appeal đã Accepted/Rejected'),
                },
            },
        },
        '/api/referee/pending-appeals': {
            get: {
                tags: ['Referee'],
                summary: 'List tất cả kháng án Pending trên các race của referee, sort FIFO',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: okResponse('OK — array { raceId, horse, jockey, penaltyReason, penaltyTimeSec, appealReason, appealSubmittedAt }'),
                },
            },
        },
        '/api/jockey/penalties': {
            get: {
                tags: ['Jockey'],
                summary: 'List tất cả án phạt + kháng án của chính jockey, sort mới nhất lên đầu',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: okResponse('OK — array { raceId, raceName, penaltyId, reason, timePenaltySec, status (Active|Cancelled), appeals[] }'),
                },
            },
        },
        '/api/jockey/races/{raceId}/registrations/{regId}/penalty/{penaltyId}/appeal': {
            post: {
                tags: ['Jockey'],
                summary: 'Jockey gửi kháng án xin gỡ án phạt — referee sẽ nhận notification',
                description: 'Block double-pending: phải đợi referee xử lý appeal trước đó nếu có. Cho resubmit sau khi bị Rejected.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'raceId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'penaltyId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['reason'],
                                properties: {
                                    reason: { type: 'string', example: 'Tôi không lấn vạch, video chứng minh điều đó' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: okResponse('OK — appeal pushed vào penalty.appeals[]'),
                    400: okResponse('Race Finished, penalty đã Cancelled, hoặc đã có appeal Pending'),
                    403: okResponse('Không phải jockey của đăng ký này'),
                },
            },
        },
        '/api/referee/pending-registrations': {
            get: {
                tags: ['Referee'],
                summary: 'Flat list các đăng ký Pending trên các race của referee (sort theo raceDate)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK — { items[] với readyToApprove flag }') },
            },
        },
        '/api/admin/jockeys/pending-licenses': {
            get: {
                tags: ['Admin'],
                summary: 'Danh sách Jockey ĐÃ NỘP YÊU CẦU cấp license và chưa được cấp, kèm daysWaiting',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/license': {
            get: {
                tags: ['Jockey'],
                summary: 'Trạng thái license: NotRequested / Pending / Approved / Rejected',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK — { state, licenseNumber, licenseRequestedAt, licenseRequestNote, licenseDocuments, licenseRejectReason }') },
            },
        },
        '/api/owner/race-history': {
            get: {
                tags: ['Owner'],
                summary: 'Lịch sử tất cả race owner đã tham gia, kèm winner + payout cho từng race',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: okResponse('OK — { raceId, raceName, myEntry, winner, payout: { myPrize, myNetProfit, isMyWin } }'),
                },
            },
        },
        '/api/admin/referees': {
            get: {
                tags: ['Admin'],
                summary: 'Danh sách trọng tài kèm activeRaceCount + totalRacesOfficiated',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Active', 'Inactive', 'Banned'] } },
                    { name: 'available', in: 'query', schema: { type: 'boolean' }, description: 'true = alias status=Active, dùng cho dropdown chọn referee khi tạo race' },
                    { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search theo fullName/username/email' },
                ],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/jockey/license/request': {
            post: {
                tags: ['Jockey'],
                summary: 'Jockey nộp/resubmit yêu cầu cấp license — vào hàng đợi admin',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    note: { type: 'string', description: 'Lý do/ghi chú gửi admin (tuỳ chọn)' },
                                    documents: {
                                        type: 'array',
                                        items: { type: 'string', description: 'URL ảnh/PDF giấy tờ' },
                                        description: 'Danh sách link giấy tờ chứng minh (tuỳ chọn)',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — đã ghi nhận yêu cầu, chờ admin xét'),
                    400: okResponse('Đã có license, hoặc đang chờ duyệt'),
                },
            },
        },
        '/api/races': {
            get: {
                tags: ['Races'],
                summary: 'Danh sách giải đấu cho MỌI role — filter theo phase (đang mở đơn / sắp / đang diễn ra / đã chấm / hoàn thành)',
                description: 'Draft không public. Response gồm counts theo phase + list races (status hiệu lực, phase, prizeBreakdown, participantCount).',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'phase', in: 'query', schema: { type: 'string', enum: ['registration-open', 'upcoming', 'ongoing', 'ranked', 'finished', 'cancelled'] }, description: 'registration-open=đang mở đơn, upcoming=chốt đơn chờ đua, ongoing=đang diễn ra, ranked=đã chấm chờ xác nhận, finished=hoàn thành' },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'] }, description: 'Filter theo status gốc nếu muốn chính xác trạng thái DB' },
                ],
                responses: { 200: okResponse('OK — { counts: {phase: n}, races: [...] }'), 400: okResponse('phase/status không hợp lệ') },
            },
        },
        '/api/races/{id}/leaderboard': {
            get: {
                tags: ['Races'],
                summary: 'Bảng xếp hạng race — dùng được cho mọi role đã login (Admin/Owner/Jockey/Referee/EndUser)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: okResponse('OK — { race, podium, leaderboard, participantCount }'),
                    400: okResponse('raceId không hợp lệ'),
                    404: okResponse('Không tìm thấy race'),
                },
            },
        },
        '/api/races/{id}/ai-predict': {
            get: {
                tags: ['AI Predictions'],
                summary: 'Dự đoán % thắng cho từng ngựa trong race (DeepSeek) — dùng được cho mọi role đã login',
                description:
                    'Tính điểm deterministic (tỷ lệ thắng lịch sử ngựa 50% + jockey 30% + phong độ/thể trạng 20%, Laplace-smoothed) trên các registration Approved, chuẩn hoá thành % dự đoán, rồi nhờ DeepSeek viết phân tích tiếng Việt dựa đúng trên bảng số đó (model không tự bịa số). Kết quả cache 3 phút/race.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'raceId' }],
                responses: {
                    200: okResponse('OK — { race, predictions: [{ horse, jockey, predictedWinPercent, ... }], aiAnalysis, disclaimer }'),
                    400: okResponse('raceId không hợp lệ, hoặc race chưa đủ 2 ngựa Approved để dự đoán'),
                    404: okResponse('Không tìm thấy race'),
                    502: okResponse('DeepSeek không phản hồi được (timeout / lỗi upstream)'),
                },
            },
        },
        '/api/races/{id}/ai-chat': {
            post: {
                tags: ['AI Predictions'],
                summary: 'Chatbox hỏi-đáp với AI về 1 race cụ thể — dùng được cho mọi role đã login',
                description:
                    'Câu trả lời luôn được neo vào đúng bảng dự đoán deterministic của race này (qua system prompt), tránh AI trả lời chung chung hoặc bịa số liệu. Stateless — client tự giữ lịch sử hội thoại và gửi lại qua `history` nếu muốn hỏi tiếp theo ngữ cảnh.',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'raceId' }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['message'],
                                properties: {
                                    message: { type: 'string', example: 'Con ngựa nào có khả năng về nhất?' },
                                    history: {
                                        type: 'array',
                                        description: 'Tối đa 10 lượt gần nhất, để hỏi tiếp theo ngữ cảnh',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                role: { type: 'string', enum: ['user', 'assistant'] },
                                                content: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: okResponse('OK — { race, reply, disclaimer }'),
                    400: okResponse('raceId không hợp lệ, hoặc message trống'),
                    404: okResponse('Không tìm thấy race'),
                    502: okResponse('DeepSeek không phản hồi được (timeout / lỗi upstream)'),
                },
            },
        },
        '/api/weather/places': {
            get: {
                tags: ['Weather'],
                summary: 'Search địa điểm theo tên — trả về tối đa 5 ứng viên kèm lat/lng',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'Saigon' },
                ],
                responses: { 200: okResponse('OK — [{ name, country, state, lat, lng }]') },
            },
        },
        '/api/weather/current': {
            get: {
                tags: ['Weather'],
                summary: 'Thời tiết hiện tại tại 1 toạ độ',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'lat', in: 'query', required: true, schema: { type: 'number' }, example: 10.7626 },
                    { name: 'lng', in: 'query', required: true, schema: { type: 'number' }, example: 106.6602 },
                ],
                responses: { 200: okResponse('OK — { tempC, humidity, windSpeedMs, description, iconUrl, ... }') },
            },
        },
        '/api/weather/forecast': {
            get: {
                tags: ['Weather'],
                summary: 'Forecast 5 ngày (mỗi 3 giờ) tại 1 toạ độ',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
                    { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
                ],
                responses: { 200: okResponse('OK — { city, slots[] }') },
            },
        },
        '/api/weather/forecast-for-date': {
            get: {
                tags: ['Weather'],
                summary: 'Forecast cho 1 raceDate — chọn slot 3-giờ gần nhất. Trả null nếu raceDate > 5 ngày.',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
                    { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
                    { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
                ],
                responses: { 200: okResponse('OK — { city, forecast, note }') },
            },
        },
    },
};

export default swaggerSpec;
