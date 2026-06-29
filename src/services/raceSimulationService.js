import Horse from '../models/Horse.js';
import { Jockey } from '../models/User.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Score blends horse stats with race conditions, jockey rating, win history,
// plus small variance so identical inputs don't always tie.
const computeScore = ({ horse, jockey, race }) => {
    const distance = race.distanceM || 1600;
    // 0 = pure sprint, 1 = pure endurance
    const w = clamp(distance / 3000, 0, 1);
    const speed = horse.speedRating ?? 50;
    const stamina = horse.staminaRating ?? 50;
    const ability = speed * (1 - w) + stamina * w;

    const preferred = horse.preferredDistanceM;
    const fitBonus = preferred ? 25 * Math.max(0, 1 - Math.abs(preferred - distance) / 1500) : 0;

    const jockeyMod = ((jockey?.rating ?? 50) * 0.2);
    const winRate = horse.totalRaces > 0 ? horse.totalWins / horse.totalRaces : 0;
    const historyMod = winRate * 10;
    const variance = (Math.random() - 0.5) * 30;

    return {
        score: ability + fitBonus + jockeyMod + historyMod + variance,
        breakdown: { ability, fitBonus, jockeyMod, historyMod, variance },
    };
};

// Returns ranked results for every Approved registration. Does NOT mutate the
// race document — caller decides whether to persist as finalRank.
export const simulateRace = async (race) => {
    const approved = race.registrations.filter((r) => r.approvalStatus === 'Approved');
    if (approved.length === 0) return [];

    const horseIds = approved.map((r) => r.horse);
    const jockeyIds = approved.map((r) => r.jockey);
    const [horses, jockeys] = await Promise.all([
        Horse.find({ _id: { $in: horseIds } }),
        Jockey.find({ _id: { $in: jockeyIds } }),
    ]);
    const horseMap = new Map(horses.map((h) => [String(h._id), h]));
    const jockeyMap = new Map(jockeys.map((j) => [String(j._id), j]));

    const scored = approved.map((reg) => {
        const horse = horseMap.get(String(reg.horse));
        const jockey = jockeyMap.get(String(reg.jockey));
        const { score: rawScore, breakdown } = computeScore({ horse, jockey, race });

        // Trừ điểm theo penalty: 1 giây phạt ~ -2 điểm. Phạt nhiều cộng dồn.
        // Logic: phạt 5s = -10 điểm, đủ để 1 ngựa giỏi xuống vài hạng.
        // Penalty status=Cancelled (jockey kháng án thành công) bị loại khỏi tính toán.
        const totalPenaltySec = (reg.penalties || [])
            .filter((p) => p.status !== 'Cancelled')
            .reduce((sum, p) => sum + (p.timePenaltySec || 0), 0);
        const penaltyDeduction = totalPenaltySec * 2;
        const score = rawScore - penaltyDeduction;

        return {
            registrationId: reg._id,
            horseId: horse?._id,
            horseName: horse?.name,
            jockeyId: jockey?._id,
            jockeyName: jockey?.fullName,
            score: Math.round(score * 100) / 100,
            breakdown: { ...breakdown, penaltyDeduction, totalPenaltySec },
        };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s, i) => ({ ...s, rank: i + 1 }));
};
