import mongoose from 'mongoose';
import Race from '../models/Race.js';
import { ROLES } from '../models/User.js';
import { calculatePrizeBreakdown } from '../services/prizeBreakdown.js';
import { buildPodium, buildLeaderboard } from '../utils/raceLeaderboard.js';

const STATUSES = ['Draft', 'Open', 'Locked', 'Finished'];
const PRIVILEGED = new Set([ROLES.ADMIN, ROLES.REFEREE]);
const canSeeDraft = (user) => !!user && PRIVILEGED.has(user.role);

export const listPublicRaces = async (req, res) => {
    try {
        const { status, from, to } = req.query;
        const filter = {};

        if (status) {
            if (!STATUSES.includes(status)) {
                return res.status(400).send({
                    status: 'Error',
                    message: `status không hợp lệ. Hợp lệ: ${STATUSES.join(', ')}`,
                });
            }
            if (status === 'Draft' && !canSeeDraft(req.user)) {
                return res.status(403).send({
                    status: 'Error',
                    message: 'Chỉ Admin/Referee được xem race Draft',
                });
            }
            filter.status = status;
        } else if (!canSeeDraft(req.user)) {
            filter.status = { $ne: 'Draft' };
        }

        if (from || to) {
            filter.raceDate = {};
            if (from) filter.raceDate.$gte = new Date(from);
            if (to) filter.raceDate.$lte = new Date(to);
        }

        const races = await Race.find(filter)
            .populate('registrations.horse', 'name')
            .populate('registrations.jockey', 'fullName')
            .populate('registrations.owner', 'fullName stableName')
            .sort({ raceDate: -1 })
            .lean();

        const data = races.map((r) => ({
            _id: r._id,
            name: r.name,
            raceDate: r.raceDate,
            location: r.location,
            distanceM: r.distanceM,
            status: r.status,
            prizeMoney: r.prizeMoney,
            finalizedAt: r.finalizedAt,
            participantCount: (r.registrations || []).length,
            podium: buildPodium(r),
        }));

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách race',
            data,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const getPublicRaceDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }

        const race = await Race.findById(id)
            .populate('referee', 'fullName')
            .populate('registrations.horse', 'name registrationNumber breed color gender')
            .populate('registrations.jockey', 'fullName experienceYears totalWins')
            .populate('registrations.owner', 'fullName stableName')
            .lean();

        if (!race) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        }
        if (race.status === 'Draft' && !canSeeDraft(req.user)) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        }

        if (race.status === 'Finished') {
            race.registrations.sort((a, b) => {
                if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank;
                if (a.finalRank) return -1;
                if (b.finalRank) return 1;
                return 0;
            });
        }

        const prizeBreakdown = calculatePrizeBreakdown(race);
        const podium = buildPodium(race);

        // Public leaderboard: ẩn hireFee, jockeyBonusPercent (điều khoản
        // thương mại riêng giữa owner và jockey, không lộ cho spectator).
        const leaderboard = buildLeaderboard(race, prizeBreakdown).map(
            ({ hireFee, jockeyBonusPercent, ...rest }) => rest
        );

        // Participants public-safe: với race chưa Finished chỉ hiện
        // registration đã được referee Approved. Race Finished hiện tất cả
        // ai có finalRank.
        const participants = (race.registrations || [])
            .filter((r) =>
                race.status === 'Finished' ? !!r.finalRank : r.approvalStatus === 'Approved'
            )
            .map((r) => ({
                horse: r.horse,
                jockey: r.jockey,
                owner: r.owner,
                approvalStatus: r.approvalStatus,
                finalRank: r.finalRank,
            }));

        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết race (public)',
            data: {
                _id: race._id,
                name: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                prizeMoney: race.prizeMoney,
                prizeDistribution: race.prizeDistribution,
                prizeBreakdown,
                referee: race.referee,
                finalizedAt: race.finalizedAt,
                participantCount: participants.length,
                participants,
                podium,
                leaderboard,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
