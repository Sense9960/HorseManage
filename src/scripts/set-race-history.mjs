// (local test tool) Gán LỊCH SỬ THẮNG đa dạng cho ngựa + jockey của 1 race,
// mô phỏng "đã đua nhiều giải" mà không cần chờ chạy đua thật.
// Dùng: node --env-file=.env src/scripts/set-race-history.mjs <raceId>
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Jockey } from '../models/User.js';

const raceId = process.argv[2];
if (!raceId) { console.error('Thiếu raceId'); process.exit(1); }

await connectDB();
const race = await Race.findById(raceId).lean();
if (!race) { console.error('Không tìm thấy race'); process.exit(1); }

const approved = race.registrations.filter((r) => r.approvalStatus === 'Approved');
console.log(`Gán lịch sử cho ${approved.length} ngựa/jockey...\n`);

// Profile đa dạng: con giỏi (thắng nhiều) → con yếu (thua nhiều)
let i = 0;
for (const reg of approved) {
    const totalRaces = 20;
    const wins = Math.max(0, 12 - i);            // 12,11,...,3 wins
    const r2 = Math.min(totalRaces - wins, Math.max(0, 5 - Math.floor(i / 3)));
    const r3 = Math.min(totalRaces - wins - r2, 3);
    const others = totalRaces - wins - r2 - r3;
    const speed = 96 - i * 4;
    const stamina = 90 - ((i * 5) % 40);

    await Horse.updateOne({ _id: reg.horse }, {
        $set: {
            totalRaces, totalWins: wins,
            rankCounts: { rank1: wins, rank2: r2, rank3: r3, others },
            speedRating: speed, staminaRating: stamina,
        },
    });
    const jWins = Math.max(0, 10 - i);
    await Jockey.updateOne({ _id: reg.jockey }, {
        $set: { totalRaces: 18, totalWins: jWins, rating: Math.round((jWins / 18) * 1000) / 10 },
    });
    const h = await Horse.findById(reg.horse).select('name').lean();
    console.log(`  ${h?.name}: ${wins}🥇 ${r2}🥈 ${r3}🥉 /${totalRaces} | speed ${speed} stamina ${stamina} | jockey ${jWins}/18 thắng`);
    i += 1;
}

console.log('\n✓ Xong. Restart server (xoá cache dự đoán) rồi gọi lại ai-predict.');
await mongoose.connection.close();
process.exit(0);
