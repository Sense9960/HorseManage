/**
 * Pure helpers tính podium + leaderboard từ một Race lean object.
 * Caller phải populate trước: registrations.horse, registrations.jockey,
 * registrations.owner. prizeBreakdown được truyền vào (đã có hàm
 * calculatePrizeBreakdown trong services/prizeBreakdown.js).
 *
 * Cả hai hàm chỉ trả mảng rỗng khi race.status !== 'Finished'.
 */

export const buildPodium = (race) => {
    if (!race || race.status !== 'Finished') return [];
    return (race.registrations || [])
        .filter((r) => r.finalRank && r.finalRank <= 3)
        .sort((a, b) => a.finalRank - b.finalRank)
        .map((r) => ({
            rank: r.finalRank,
            horse: r.horse,
            jockey: r.jockey,
            owner: r.owner,
        }));
};

export const buildLeaderboard = (race, prizeBreakdown = []) => {
    if (!race || race.status !== 'Finished') return [];
    return (race.registrations || [])
        .filter((r) => r.finalRank)
        .sort((a, b) => a.finalRank - b.finalRank)
        .map((r) => ({
            rank: r.finalRank,
            horse: r.horse,
            jockey: r.jockey,
            owner: r.owner,
            prizeWon: prizeBreakdown.find((b) => b.rank === r.finalRank)?.amount || 0,
            finishTimeSec: r.finishTimeSec ?? null,
            penalties: r.penalties || [],
            totalPenaltySec: (r.penalties || []).reduce((s, p) => s + (p.timePenaltySec || 0), 0),
            hireFee: r.hireFee,
            jockeyBonusPercent: r.jockeyBonusPercent,
        }));
};
