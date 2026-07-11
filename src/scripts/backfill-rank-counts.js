/**
 * One-off backfill: rebuild `rankCounts` cho mọi Horse + Jockey từ lịch sử
 * race đã Finished. Chạy 1 lần sau khi deploy commit thêm field rankCounts
 * vì các race cũ không tự populate stat này.
 *
 * Chạy: `npm run backfill:rank-counts`
 *
 * Idempotent — reset rankCounts về 0 trước khi đếm lại, gọi nhiều lần ra cùng kết quả.
 */
import connectDB from '../config/db.js';
import mongoose from 'mongoose';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Jockey } from '../models/User.js';

const EMPTY = () => ({ rank1: 0, rank2: 0, rank3: 0, others: 0 });

const bumpRank = (counts, finalRank) => {
    if (finalRank === 1) counts.rank1 += 1;
    else if (finalRank === 2) counts.rank2 += 1;
    else if (finalRank === 3) counts.rank3 += 1;
    else counts.others += 1;
};

const main = async () => {
    await connectDB();
    console.log('Resetting rankCounts on all Horses + Jockeys...');
    await Horse.updateMany({}, { $set: { rankCounts: EMPTY() } });
    await Jockey.updateMany({}, { $set: { rankCounts: EMPTY() } });

    console.log('Scanning Finished races...');
    const races = await Race.find({ status: 'Finished' }).lean();

    const horseCounts = new Map();
    const jockeyCounts = new Map();

    let totalFinalized = 0;
    for (const race of races) {
        for (const reg of race.registrations) {
            if (!reg.finalRank) continue;
            totalFinalized += 1;
            const hk = String(reg.horse);
            const jk = String(reg.jockey);
            if (!horseCounts.has(hk)) horseCounts.set(hk, EMPTY());
            if (!jockeyCounts.has(jk)) jockeyCounts.set(jk, EMPTY());
            bumpRank(horseCounts.get(hk), reg.finalRank);
            bumpRank(jockeyCounts.get(jk), reg.finalRank);
        }
    }

    console.log(`Applying counts to ${horseCounts.size} horses and ${jockeyCounts.size} jockeys...`);
    for (const [horseId, counts] of horseCounts) {
        await Horse.updateOne({ _id: horseId }, { $set: { rankCounts: counts } });
    }
    for (const [jockeyId, counts] of jockeyCounts) {
        await Jockey.updateOne({ _id: jockeyId }, { $set: { rankCounts: counts } });
    }

    console.log('\n========================================');
    console.log(`Backfill complete.`);
    console.log(`Finished races scanned : ${races.length}`);
    console.log(`Finalized registrations: ${totalFinalized}`);
    console.log(`Horses updated         : ${horseCounts.size}`);
    console.log(`Jockeys updated        : ${jockeyCounts.size}`);
    console.log('========================================\n');

    await mongoose.connection.close();
    process.exit(0);
};

main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
