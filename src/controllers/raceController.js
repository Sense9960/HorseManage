/**
 * Public race endpoints — accessible bởi tất cả role đã login.
 * Trả về thông tin race + bảng xếp hạng (leaderboard) đầy đủ. Không có
 * thông tin role-specific (vd: myRegistration của owner) — endpoint này
 * thuần read-only, ai cũng xem được.
 */

import mongoose from 'mongoose';
import Race from '../models/Race.js';
import { calculatePrizeBreakdown } from '../services/prizeBreakdown.js';

/**
 * GET /api/races/:id/leaderboard
 * Trả bảng xếp hạng race kèm horse/jockey/owner + prizeWon + penalties.
 * Hoạt động được cho race Finished (rank đầy đủ) và race chưa Finished
 * (leaderboard trống, chỉ trả participants list).
 */
export const getRaceLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).send({ status: 'Error', message: 'raceId không hợp lệ' });
        }

        const race = await Race.findById(id)
            .populate('referee', 'fullName')
            .populate('registrations.horse', 'name registrationNumber breed color gender weightKg heightCm speedRating staminaRating')
            .populate('registrations.jockey', 'fullName avatar experienceYears rating totalRaces totalWins')
            .populate('registrations.owner', 'fullName stableName avatar')
            .lean();

        if (!race) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        }

        const breakdown = calculatePrizeBreakdown(race);
        const isFinished = race.status === 'Finished';

        // Leaderboard: sort theo finalRank cho race Finished, ngược lại theo
        // approvalStatus (Approved lên đầu) để FE có thứ tự ổn định.
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
                ? breakdown.find((b) => b.rank === r.finalRank)?.amount || 0
                : 0,
            penalties: r.penalties || [],
            totalPenaltySec: (r.penalties || []).reduce((s, p) => s + (p.timePenaltySec || 0), 0),
            hireFee: r.hireFee,
            oddTop1: r.oddTop1,
            oddTop2: r.oddTop2,
            oddTop3: r.oddTop3,
        }));

        const podium = isFinished
            ? leaderboard.filter((r) => r.rank && r.rank <= 3)
            : [];

        return res.status(200).send({
            status: 'Success',
            message: 'Bảng xếp hạng race',
            data: {
                race: {
                    _id: race._id,
                    name: race.name,
                    raceDate: race.raceDate,
                    location: race.location,
                    distanceM: race.distanceM,
                    status: race.status,
                    finalizedAt: race.finalizedAt,
                    prizeMoney: race.prizeMoney,
                    prizeBreakdown: breakdown,
                    entryFee: race.entryFee,
                    referee: race.referee,
                },
                participantCount: leaderboard.length,
                podium,
                leaderboard,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
