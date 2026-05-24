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
        version: '1.1.0',
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
