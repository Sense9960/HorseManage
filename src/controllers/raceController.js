/**
 * Public race endpoints — accessible bởi tất cả role đã login.
 * Trả về thông tin race + bảng xếp hạng (leaderboard) đầy đủ. Không có
 * thông tin role-specific (vd: myRegistration của owner) — endpoint này
 * thuần read-only, ai cũng xem được.
 */

import mongoose from 'mongoose';
import Race from '../models/Race.js';
import { calculatePrizeBreakdown } from '../utils/prizeBreakdown.js';
import { buildLeaderboard } from '../utils/raceLeaderboard.js';
import { getEffectiveStatus } from '../utils/registrationWindow.js';

// Phase = trạng thái "dễ hiểu cho người xem", suy từ status + raceDate:
//   registration-open : đang mở đơn đăng ký (Open)
//   upcoming          : đã chốt đơn, chưa tới giờ đua (Locked, raceDate > now)
//   ongoing           : đang diễn ra (Locked, raceDate <= now)
//   ranked            : đã chấm xong, BXH tạm chờ xác nhận (Ranked)
//   finished          : đã hoàn thành + trả thưởng (Finished)
//   cancelled         : đã huỷ (Cancelled)
const computePhase = (status, raceDate, now = Date.now()) => {
    if (status === 'Cancelled') return 'cancelled';
    if (status === 'Finished') return 'finished';
    if (status === 'Ranked') return 'ranked';
    if (status === 'Open') return 'registration-open';
    if (status === 'Locked') {
        return new Date(raceDate).getTime() <= now ? 'ongoing' : 'upcoming';
    }
    return null; // Draft — không public
};

const PUBLIC_PHASES = ['registration-open', 'upcoming', 'ongoing', 'ranked', 'finished', 'cancelled'];
const PUBLIC_STATUSES = ['Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'];

/**
 * GET /api/races — danh sách giải đấu cho MỌI role đã login.
 * Filter:
 *   ?phase=registration-open|upcoming|ongoing|ranked|finished|cancelled
 *   ?status=Open|Locked|Ranked|Finished|Cancelled (filter theo status gốc)
 * Không truyền → trả tất cả (trừ Draft) + counts theo phase.
 * Draft không bao giờ public — giải chưa công bố chỉ admin thấy.
 */
export const listRaces = async (req, res) => {
    try {
        const { phase, status } = req.query;
        if (phase && !PUBLIC_PHASES.includes(phase)) {
            return res.status(400).send({
                status: 'Error',
                message: `phase phải thuộc: ${PUBLIC_PHASES.join(', ')}`,
            });
        }
        if (status && !PUBLIC_STATUSES.includes(status)) {
            return res.status(400).send({
                status: 'Error',
                message: `status phải thuộc: ${PUBLIC_STATUSES.join(', ')}`,
            });
        }

        // Query rộng (mọi status trừ Draft) rồi filter phase sau khi tính
        // effective status — vì phase phụ thuộc cả raceDate lẫn registration
        // window (Draft có openAt đã tới → hiện như Open).
        const races = await Race.find({})
            .sort({ raceDate: -1 })
            .populate('referee', 'fullName')
            .lean();

        const now = Date.now();
        const counts = Object.fromEntries(PUBLIC_PHASES.map((p) => [p, 0]));
        const data = [];
        for (const race of races) {
            const effectiveStatus = getEffectiveStatus(race, new Date(now));
            const racePhase = computePhase(effectiveStatus, race.raceDate, now);
            if (!racePhase) continue;                          // Draft → ẩn
            counts[racePhase] += 1;
            if (phase && racePhase !== phase) continue;
            if (status && effectiveStatus !== status) continue;
            data.push({
                _id: race._id,
                name: race.name,
                raceDate: race.raceDate,
                registrationOpenAt: race.registrationOpenAt || null,
                registrationCloseAt: race.registrationCloseAt || null,
                location: race.location,
                distanceM: race.distanceM,
                status: effectiveStatus,
                phase: racePhase,
                prizeMoney: race.prizeMoney,
                prizeBreakdown: calculatePrizeBreakdown(race),
                entryFee: race.entryFee || 0,
                referee: race.referee,
                participantCount: (race.registrations || []).length,
                approvedCount: (race.registrations || []).filter((r) => r.approvalStatus === 'Approved').length,
            });
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách giải đấu',
            data: { counts, races: data },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

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

        const { leaderboard, podium, participantCount, prizeBreakdown } = buildLeaderboard(race);

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
                    prizeBreakdown,
                    entryFee: race.entryFee,
                    referee: race.referee,
                },
                participantCount,
                podium,
                leaderboard,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
