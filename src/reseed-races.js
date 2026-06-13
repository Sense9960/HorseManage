/**
 * One-off script: xoá toàn bộ Race cũ + tạo lại 3 race mới minh hoạ
 * các feature mới nhất (entryFee, prizeBreakdown 60/30/10, jockey response
 * deadline, status mix Open/Locked/Finished).
 *
 * Chạy: `node src/reseed-races.js`
 *
 * KHÔNG đụng vào User/Horse/Wallet — chỉ wipe Race + Prediction (vì
 * prediction reference race) + reset payoutDone/bonusPaid flags trên các
 * registration cũ nếu race vẫn còn.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Race from './models/Race.js';
import Prediction from './models/Prediction.js';
import Horse from './models/Horse.js';
import { Jockey, OwnerHorse, Referee } from './models/User.js';

const DAY = 24 * 60 * 60 * 1000;

const main = async () => {
    await connectDB();

    console.log('Wiping old Race + Prediction collections...');
    await Race.deleteMany({});
    await Prediction.deleteMany({});

    console.log('Looking up actors (jockey/owner/referee/horse)...');
    const [jockey1, jockey2] = await Jockey.find().limit(2);
    const [owner1, owner2] = await OwnerHorse.find().limit(2);
    const [referee1] = await Referee.find().limit(1);
    const horses = await Horse.find().limit(4);

    if (!jockey1 || !owner1 || !referee1 || horses.length < 2) {
        console.error('Thiếu dữ liệu nền (jockey/owner/referee/horse). Chạy `npm run seed` trước.');
        process.exit(1);
    }

    const now = Date.now();

    console.log('Creating 3 new races...');

    // Race #1: Open, 30 ngày nữa — jockey còn nhiều thời gian để accept/decline
    const race1 = await Race.create({
        name: 'Giải Đua Mùa Xuân 2026',
        raceDate: new Date(now + 30 * DAY),
        location: 'Trường đua Phú Thọ, TP.HCM',
        distanceM: 1600,
        status: 'Open',
        referee: referee1._id,
        prizeMoney: 15_000_000,
        entryFee: 300_000,
        addEntryFeeToPrize: true,
        prizeDistribution: [
            { rank: 1, percent: 60 },
            { rank: 2, percent: 30 },
            { rank: 3, percent: 10 },
        ],
        registrations: [
            {
                horse: horses[0]._id,
                jockey: jockey1._id,
                owner: owner1._id,
                approvalStatus: 'Pending',
                hireFee: 500_000,
                jockeyBonusPercent: 10,
                entryFeePaid: 300_000,
                jockeyResponse: { status: 'Pending' },
            },
        ],
    });

    // Race #2: Locked, 5 ngày nữa — quá deadline 7 ngày, jockey không decline được
    const race2 = await Race.create({
        name: 'Cúp Mùa Hè BIDV 2026',
        raceDate: new Date(now + 5 * DAY),
        location: 'Trường đua Đại Nam, Bình Dương',
        distanceM: 2000,
        status: 'Locked',
        referee: referee1._id,
        prizeMoney: 25_000_000,
        entryFee: 500_000,
        addEntryFeeToPrize: false,
        prizeDistribution: [
            { rank: 1, percent: 60 },
            { rank: 2, percent: 30 },
            { rank: 3, percent: 10 },
        ],
        registrations: jockey2 && horses[1] && owner2
            ? [
                {
                    horse: horses[0]._id,
                    jockey: jockey1._id,
                    owner: owner1._id,
                    approvalStatus: 'Approved',
                    hireFee: 600_000,
                    jockeyBonusPercent: 15,
                    entryFeePaid: 500_000,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 7 * DAY) },
                },
                {
                    horse: horses[1]._id,
                    jockey: jockey2._id,
                    owner: owner2._id,
                    approvalStatus: 'Approved',
                    hireFee: 700_000,
                    jockeyBonusPercent: 12,
                    entryFeePaid: 500_000,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 5 * DAY) },
                },
            ]
            : [
                {
                    horse: horses[0]._id,
                    jockey: jockey1._id,
                    owner: owner1._id,
                    approvalStatus: 'Approved',
                    hireFee: 600_000,
                    jockeyBonusPercent: 15,
                    entryFeePaid: 500_000,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 7 * DAY) },
                },
            ],
    });

    // Race #3: Finished — minh hoạ podium + payout đã chạy
    const race3 = await Race.create({
        name: 'Giải Khai Mạc Năm 2025 (đã kết thúc)',
        raceDate: new Date(now - 14 * DAY),
        location: 'Trường đua Phú Thọ, TP.HCM',
        distanceM: 1200,
        status: 'Finished',
        finalizedAt: new Date(now - 13 * DAY),
        referee: referee1._id,
        prizeMoney: 10_000_000,
        entryFee: 200_000,
        addEntryFeeToPrize: true,
        prizeDistribution: [
            { rank: 1, percent: 60 },
            { rank: 2, percent: 30 },
            { rank: 3, percent: 10 },
        ],
        registrations: jockey2 && horses[1] && owner2
            ? [
                {
                    horse: horses[0]._id,
                    jockey: jockey1._id,
                    owner: owner1._id,
                    approvalStatus: 'Approved',
                    hireFee: 500_000,
                    jockeyBonusPercent: 10,
                    entryFeePaid: 200_000,
                    finalRank: 1,
                    payoutDone: true,
                    bonusPaid: true,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 21 * DAY) },
                },
                {
                    horse: horses[1]._id,
                    jockey: jockey2._id,
                    owner: owner2._id,
                    approvalStatus: 'Approved',
                    hireFee: 400_000,
                    jockeyBonusPercent: 8,
                    entryFeePaid: 200_000,
                    finalRank: 2,
                    payoutDone: true,
                    bonusPaid: true,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 20 * DAY) },
                },
            ]
            : [
                {
                    horse: horses[0]._id,
                    jockey: jockey1._id,
                    owner: owner1._id,
                    approvalStatus: 'Approved',
                    hireFee: 500_000,
                    jockeyBonusPercent: 10,
                    entryFeePaid: 200_000,
                    finalRank: 1,
                    payoutDone: true,
                    bonusPaid: true,
                    jockeyResponse: { status: 'Accepted', respondedAt: new Date(now - 21 * DAY) },
                },
            ],
    });

    console.log('\n========================================');
    console.log('Reseed races completed.');
    console.log('========================================');
    console.log(`Race 1: ${race1.name}  [Open]    raceDate +30d  entryFee 300k  prize 15M`);
    console.log(`Race 2: ${race2.name}  [Locked]  raceDate +5d   entryFee 500k  prize 25M`);
    console.log(`Race 3: ${race3.name}  [Finished] -14d  prize 10M  payouts done`);
    console.log('========================================\n');

    await mongoose.connection.close();
    process.exit(0);
};

main().catch((err) => {
    console.error('Reseed failed:', err);
    process.exit(1);
});
