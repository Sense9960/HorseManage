import { calculatePrizeBreakdown } from './prizeBreakdown.js';

/**
 * Build bảng xếp hạng cho 1 race đã .populate registrations.horse/jockey/owner.
 * Thuần transform — KHÔNG chạm DB. Tách ra từ getRaceLeaderboard để dùng chung
 * cho cả endpoint leaderboard công khai lẫn lịch sử dự đoán của enduser.
 *
 * Trả { leaderboard, podium, participantCount, prizeBreakdown }.
 */
export const buildLeaderboard = (race) => {
    const prizeBreakdown = calculatePrizeBreakdown(race);
    // Ranked = có finalRank tạm (chưa payout) — leaderboard vẫn hiển thị thứ hạng.
    const isFinished = race.status === 'Finished' || race.status === 'Ranked';

    // Sort theo finalRank cho race Finished/Ranked, ngược lại theo approvalStatus
    // (Approved lên đầu) để FE có thứ tự ổn định.
    const sorted = [...race.registrations].sort((a, b) => {
        if (isFinished) {
            if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank;
            if (a.finalRank) return -1;
            if (b.finalRank) return 1;
        }
        const approvalOrder = { Approved: 0, Pending: 1, Rejected: 2, Banned: 3 };
        return (approvalOrder[a.approvalStatus] ?? 9) - (approvalOrder[b.approvalStatus] ?? 9);
    });

    const leaderboard = sorted.map((r, idx) => ({
        position: isFinished && r.finalRank ? r.finalRank : idx + 1,
        rank: r.finalRank ?? null,
        horse: r.horse,
        jockey: r.jockey,
        owner: r.owner,
        approvalStatus: r.approvalStatus,
        finishTimeSec: r.finishTimeSec ?? null,
        prizeWon: r.finalRank
            ? prizeBreakdown.find((b) => b.rank === r.finalRank)?.amount || 0
            : 0,
        penalties: r.penalties || [],
        totalPenaltySec: (r.penalties || []).reduce((s, p) => s + (p.timePenaltySec || 0), 0),
        hireFee: r.hireFee,
        oddTop1: r.oddTop1,
        oddTop2: r.oddTop2,
        oddTop3: r.oddTop3,
    }));

    const podium = isFinished ? leaderboard.filter((r) => r.rank && r.rank <= 3) : [];

    return { leaderboard, podium, participantCount: leaderboard.length, prizeBreakdown };
};
