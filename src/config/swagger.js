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
        { name: 'Wallet', description: 'Ví tiền (Owner + Jockey). Deposit qua SePay, Withdraw cần admin duyệt' },
        { name: 'SePay', description: 'Webhook nhận thông báo nạp tiền từ SePay' },
        { name: 'Predictions', description: 'EndUser betting: stake points on Top1/2/3 finishers' },
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
                summary: 'Danh sách người dùng',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'role', in: 'query', schema: { type: 'string' } },
                    { name: 'status', in: 'query', schema: { type: 'string' } },
                ],
                responses: { 200: okResponse('OK'), 403: okResponse('Không có quyền') },
            },
        },
        '/api/admin/users/{id}': {
            get: {
                tags: ['Admin'],
                summary: 'Chi tiết người dùng',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK'), 404: okResponse('Không tìm thấy') },
            },
            delete: {
                tags: ['Admin'],
                summary: 'Xóa người dùng',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('Đã xóa'), 404: okResponse('Không tìm thấy') },
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
                summary: 'Duyệt license cho Jockey',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['licenseNumber'],
                                properties: { licenseNumber: { type: 'string', example: 'LIC-2026-001' } },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
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
                summary: 'Danh sách lượt đổi quà',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['Pending', 'Delivered', 'Cancelled'] } }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/admin/redemptions/{id}/deliver': {
            patch: {
                tags: ['Admin'],
                summary: 'Đánh dấu đã giao quà',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: okResponse('OK') },
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
                summary: 'Đổi quà bằng điểm',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 201: okResponse('Đã đổi, chờ admin giao'), 400: okResponse('Hết hàng / không đủ điểm') },
            },
        },
        '/api/enduser/redemptions': {
            get: {
                tags: ['EndUser'],
                summary: 'Lịch sử đổi quà của tôi',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
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
                                required: ['horseId', 'jockeyId'],
                                properties: {
                                    horseId: { type: 'string' },
                                    jockeyId: { type: 'string' },
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
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['Draft', 'Open', 'Locked', 'Finished', 'All'] } },
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
        '/api/owner/race-offers': {
            get: {
                tags: ['Owner'],
                summary: 'Race offers I have sent (status + jockey response)',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
        },
        '/api/owner/races/{raceId}/registrations/{regId}': {
            delete: {
                tags: ['Owner'],
                summary: 'Cancel a sent race offer (only before referee approval)',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'raceId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'regId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                responses: { 200: okResponse('Cancelled'), 400: okResponse('Already approved or race locked') },
            },
        },
        '/api/owner/horses/{id}/jockey': {
            patch: {
                tags: ['Owner'],
                summary: 'Gán Jockey cho ngựa',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['jockeyId'],
                                properties: { jockeyId: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK') },
            },
        },

        '/api/jockey/profile': {
            get: {
                tags: ['Jockey'],
                summary: 'Xem hồ sơ của tôi',
                security: [{ bearerAuth: [] }],
                responses: { 200: okResponse('OK') },
            },
            put: {
                tags: ['Jockey'],
                summary: 'Cập nhật hồ sơ (không sửa được licenseNumber, totalWins)',
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
                summary: 'Tạo lệnh nạp — trả về memo (NAP <userId>) + bankTag để chuyển khoản qua SePay',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount'],
                                properties: { amount: { type: 'integer', minimum: 10000, example: 100000 } },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('Thông tin chuyển khoản') },
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
        '/api/sepay/webhook': {
            post: {
                tags: ['SePay'],
                summary: 'Webhook SePay gọi khi có giao dịch ngân hàng (yêu cầu header Authorization: Apikey <SEPAY_API_KEY>)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer' },
                                    transferType: { type: 'string', example: 'in' },
                                    transferAmount: { type: 'integer', example: 100000 },
                                    content: { type: 'string', example: 'NAP 6a12aaa0d6423ddf1a3bdbbd' },
                                    referenceCode: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('Ghi nhận / ignored'), 401: okResponse('Sai SePay API key') },
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
        '/api/referee/races/{id}/results': {
            post: {
                tags: ['Referee'],
                summary: 'Chốt kết quả race (chia thưởng + trả hireFee + đổi sang Finished)',
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
                                            required: ['registrationId', 'rank'],
                                            properties: {
                                                registrationId: { type: 'string' },
                                                rank: { type: 'integer', minimum: 1, example: 1 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { 200: okResponse('OK (có thể kèm payoutFailures nếu chuyển tiền lỗi)') },
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
            get: {
                tags: ['EndUser'],
                summary: 'Xem hồ sơ của tôi',
                security: [{ bearerAuth: [] }],
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
    },
};

export default swaggerSpec;
