// Seed CỘNG THÊM (không xoá dữ liệu cũ): 5 giải đấu ngày 16/07/2026, 10h→17h.
// 7 owner + 7 jockey CỐ ĐỊNH dùng lại xuyên suốt 5 giải; NGỰA thì KHÔNG lặp lại
// giữa các giải — mỗi giải có 7 con hoàn toàn mới (35 ngựa tổng).
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Jockey, OwnerHorse, Referee, ROLES } from '../models/User.js';
import Horse, { HORSE_BREEDS, HORSE_GENDERS } from '../models/Horse.js';
import Race from '../models/Race.js';
import { credit } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD;
const RACE_COUNT = 5;
const SLOTS = 7; // owner/jockey cố định, và cũng là số ngựa mỗi giải

// 16/07/2026, giờ Việt Nam (UTC+7): 10:00, 11:45, 13:30, 15:15, 17:00.
const RACE_TIMES_UTC = [
    '2026-07-16T03:00:00Z',
    '2026-07-16T04:45:00Z',
    '2026-07-16T06:30:00Z',
    '2026-07-16T08:15:00Z',
    '2026-07-16T10:00:00Z',
];

const COLORS = ['Bay', 'Black', 'Chestnut', 'Grey', 'Brown'];

const run = async () => {
    if (!SEED_PASSWORD || SEED_PASSWORD.length < 6) {
        throw new Error('SEED_PASSWORD (>= 6 ký tự) là bắt buộc trong .env — dùng chung với npm run seed.');
    }
    await connectDB();

    const stamp = Date.now().toString(36);

    console.log(`Tạo ${SLOTS} Owner + ${SLOTS} Jockey (dùng lại xuyên suốt 5 giải)...`);
    const owners = [];
    const jockeys = [];
    for (let i = 0; i < SLOTS; i += 1) {
        const owner = await OwnerHorse.create({
            username: `race5_owner${i + 1}_${stamp}`,
            email: `race5-owner${i + 1}-${stamp}@horse.test`,
            password: SEED_PASSWORD,
            fullName: `Chủ Ngựa ${i + 1}`,
            role: ROLES.OWNER_HORSE,
            isVerified: true,
            stableName: `Chuồng Ngựa Số ${i + 1}`,
            stableAddress: `${10 + i} Đường Đua, TP.HCM`,
        });
        owners.push(owner);

        const jockey = await Jockey.create({
            username: `race5_jockey${i + 1}_${stamp}`,
            email: `race5-jockey${i + 1}-${stamp}@horse.test`,
            password: SEED_PASSWORD,
            fullName: `Nài Ngựa ${i + 1}`,
            role: ROLES.JOCKEY,
            isVerified: true,
            licenseNumber: `JKY-5R-${i + 1}-${stamp}`,
            experienceYears: 2 + i,
            weightKg: 48 + i * 2,
            heightCm: 160 + i,
            totalRaces: 6 + i * 3,
            totalWins: 1 + i,
            rating: 20 + i * 2,
            pricePerRace: 300_000 + i * 50_000,
        });
        jockeys.push(jockey);

        // Nạp sẵn ví owner đủ trả hireFee cho cả 5 giải khi race Finished.
        await credit(owner._id, 20_000_000, {
            type: WALLET_TX_TYPES.DEPOSIT,
            description: 'Seed 5 giải 16/07 — nạp sẵn để trả hireFee',
            notifyUser: false,
        });
    }

    const referee = await Referee.create({
        username: `race5_referee_${stamp}`,
        email: `race5-referee-${stamp}@horse.test`,
        password: SEED_PASSWORD,
        fullName: 'Trọng Tài Giải 16/07',
        role: ROLES.REFEREE,
        isVerified: true,
        refereeCertNumber: `REF-5R-${stamp}`,
        specialization: 'Flat racing',
    });

    console.log('Tạo 5 giải — mỗi giải 7 ngựa MỚI (không dùng lại ngựa giữa các giải)...');
    const raceIds = [];

    for (let r = 0; r < RACE_COUNT; r += 1) {
        const registrations = [];
        for (let s = 0; s < SLOTS; s += 1) {
            const globalIdx = r * SLOTS + s; // 0..34 — mỗi ngựa duy nhất xuyên suốt 5 giải
            const speed = 55 + ((globalIdx * 7) % 40); // trải 55..94
            const stamina = 55 + ((globalIdx * 11) % 40);

            const horse = await Horse.create({
                name: `Tia Chớp ${globalIdx + 1}`,
                breed: HORSE_BREEDS[globalIdx % HORSE_BREEDS.length],
                color: COLORS[globalIdx % COLORS.length],
                gender: HORSE_GENDERS[globalIdx % HORSE_GENDERS.length],
                dateOfBirth: new Date(2018 + (globalIdx % 6), globalIdx % 12, 10),
                weightKg: 440 + (globalIdx % 8) * 8,
                heightCm: 158 + (globalIdx % 10),
                registrationNumber: `REG-5R-${globalIdx + 1}-${stamp}`,
                owner: owners[s]._id,
                currentJockey: jockeys[s]._id,
                status: 'Active',
                totalRaces: globalIdx % 12,
                totalWins: globalIdx % 4,
                speedRating: speed,
                staminaRating: stamina,
                preferredDistanceM: 1200 + (globalIdx % 4) * 400,
            });

            const oddTop1 = Math.round((2 + s * 0.7) * 10) / 10;
            registrations.push({
                horse: horse._id,
                jockey: jockeys[s]._id,
                owner: owners[s]._id,
                approvalStatus: 'Approved',
                hireFee: 200_000 + s * 30_000,
                jockeyBonusPercent: 10,
                entryFeePaid: 0,
                jockeyResponse: { status: 'Accepted', respondedAt: new Date() },
                oddTop1,
                oddTop2: Math.round(oddTop1 * 0.55 * 10) / 10,
                oddTop3: Math.round(oddTop1 * 0.35 * 10) / 10,
            });
        }

        const race = await Race.create({
            name: `Giải Đua Ngày 16/07 — Chặng ${r + 1}`,
            raceDate: new Date(RACE_TIMES_UTC[r]),
            location: `Trường Đua Phú Thọ — Chặng ${r + 1}`,
            distanceM: 1200 + r * 200,
            status: 'Open',
            referee: referee._id,
            prizeMoney: 10_000_000 + r * 2_000_000,
            entryFee: 0,
            registrations,
        });
        raceIds.push(race._id);
        const vnTime = new Date(RACE_TIMES_UTC[r]).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        console.log(`   ✓ ${race.name} (${race._id}) — ${SLOTS} ngựa Approved, khởi hành ${vnTime}`);
    }

    console.log('\n========================================');
    console.log('Hoàn tất seed 5 giải ngày 16/07/2026.');
    console.log(`Owner  : ${SLOTS} (dùng lại xuyên suốt 5 giải)`);
    console.log(`Jockey : ${SLOTS} (dùng lại xuyên suốt 5 giải)`);
    console.log(`Referee: 1`);
    console.log(`Ngựa   : ${RACE_COUNT * SLOTS} (mỗi giải 7 con MỚI, không lặp lại)`);
    console.log(`Race   : ${RACE_COUNT}, ngày 16/07/2026, 10h → 17h, status Open`);
    console.log('Mật khẩu tất cả tài khoản vừa tạo: dùng chung SEED_PASSWORD trong .env');
    console.log('========================================\n');

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error('Seed 5 races failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
