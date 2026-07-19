// Seed CỘNG THÊM: 1 giải đấu MỞ LỜI MỜI cho TẤT CẢ owner đang có trong DB.
// Giải giới hạn 8 người — chạy theo cơ chế "đồng ý trước được vào": owner nào
// bấm Accept (POST /api/owner/invites/:raceId/respond) trước thì chiếm slot, đủ
// 8 người thì owner đến sau bị từ chối (409).
//
// Không xoá dữ liệu cũ. Cần đã có sẵn owner (vd chạy npm run seed / seed:5races
// trước) và ít nhất 1 referee Active.
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User, Referee, ROLES } from '../models/User.js';
import Race from '../models/Race.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD;
const MAX_PARTICIPANTS = 8;

const run = async () => {
    await connectDB();

    const owners = await User.find({ role: ROLES.OWNER_HORSE, status: 'Active' }).select('_id fullName email');
    if (owners.length === 0) {
        console.log('Không có OwnerHorse Active nào trong DB. Chạy `npm run seed` hoặc `npm run seed:5races` trước đã.');
        await mongoose.disconnect();
        return;
    }

    // Referee: dùng lại cái sẵn có; nếu chưa có thì tạo mới (cần SEED_PASSWORD).
    let referee = await Referee.findOne({ status: 'Active' });
    if (!referee) {
        if (!SEED_PASSWORD || SEED_PASSWORD.length < 6) {
            throw new Error('Chưa có Referee nào và SEED_PASSWORD (>=6) không set để tạo mới. Thêm SEED_PASSWORD vào .env.');
        }
        const stamp = Date.now().toString(36);
        referee = await Referee.create({
            username: `openinvite_ref_${stamp}`,
            email: `openinvite-ref-${stamp}@horse.test`,
            password: SEED_PASSWORD,
            fullName: 'Trọng Tài Giải Mở',
            role: ROLES.REFEREE,
            isVerified: true,
            refereeCertNumber: `REF-OPEN-${stamp}`,
            specialization: 'Flat racing',
        });
        console.log(`Đã tạo referee mới: ${referee.email}`);
    }

    const race = await Race.create({
        name: `Giải Mở — Mời Toàn Bộ Owner (tối đa ${MAX_PARTICIPANTS})`,
        raceDate: new Date('2026-08-15T03:00:00Z'), // 10:00 giờ VN, 15/08/2026
        location: 'Trường Đua Phú Thọ',
        distanceM: 1600,
        status: 'Open',
        referee: referee._id,
        prizeMoney: 20_000_000,
        entryFee: 0,
        maxParticipants: MAX_PARTICIPANTS,
        invitedOwners: owners.map((o) => ({ owner: o._id })), // tất cả Pending
    });

    // Gửi notification lời mời cho từng owner (giống luồng admin mời).
    for (const o of owners) {
        await notify(o._id, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Lời mời tham gia giải "${race.name}"`,
            body: `Giải giới hạn ${MAX_PARTICIPANTS} người — đồng ý sớm để giữ chỗ. Vào mục Lời mời để phản hồi.`,
            data: { raceId: race._id, raceName: race.name, raceDate: race.raceDate, invited: true },
        });
    }

    console.log('\n========================================');
    console.log('Đã tạo giải mở lời mời toàn bộ owner.');
    console.log(`Race     : ${race.name}`);
    console.log(`RaceId   : ${race._id}`);
    console.log(`Ngày đua : ${new Date(race.raceDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
    console.log(`Sức chứa : ${MAX_PARTICIPANTS} owner (đồng ý trước được vào)`);
    console.log(`Đã mời   : ${owners.length} owner (tất cả trạng thái Pending)`);
    console.log(`Referee  : ${referee.fullName} (${referee.email})`);
    console.log('----------------------------------------');
    console.log('Owner được mời:');
    owners.forEach((o, i) => console.log(`   ${i + 1}. ${o.fullName} — ${o.email}`));
    console.log('----------------------------------------');
    console.log('Owner phản hồi qua:');
    console.log(`   GET  /api/owner/invites`);
    console.log(`   POST /api/owner/invites/${race._id}/respond   body: { "action": "accept" }`);
    console.log(`Sau khi đủ ${MAX_PARTICIPANTS} người Accepted, người bấm accept tiếp theo sẽ nhận 409.`);
    console.log('========================================\n');

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error('Seed open-invite race failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
