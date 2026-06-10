import mongoose from 'mongoose';
import Horse from '../models/Horse.js';
import Race from '../models/Race.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import {
    JOCKEY_RESPONSE_DEADLINE_DAYS,
    isPastJockeyDeclineDeadline,
} from '../services/rideOfferDeadline.js';

const EDITABLE_FIELDS = [
    'fullName', 'phone', 'avatar', 'dateOfBirth', 'gender', 'address',
    'experienceYears', 'weightKg', 'heightCm', 'pricePerRace',
];

export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) user[f] = req.body[f];
        }
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Cập nhật hồ sơ thành công',
            data: user,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyHorses = async (req, res) => {
    try {
        const horses = await Horse.find({ currentJockey: req.user._id }).sort({ createdAt: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngựa bạn đang cưỡi',
            data: horses,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Chi tiết 1 con ngựa jockey đang cưỡi. Trả về thông tin ngựa, chủ ngựa,
 * race sắp tới mà jockey có đăng ký với con ngựa này, và lịch sử race đã
 * kết thúc kèm thứ hạng. Chặn jockey khác xem ngựa không thuộc về mình.
 */
export const getMyHorseDetail = async (req, res) => {
    try {
        const { horseId } = req.params;
        if (!mongoose.isValidObjectId(horseId)) {
            return res.status(400).send({ status: 'Error', message: 'horseId không hợp lệ' });
        }

        const horse = await Horse.findById(horseId)
            .populate('owner', 'fullName stableName phone email avatar');
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.currentJockey) !== String(req.user._id)) {
            return res.status(403).send({
                status: 'Error',
                message: 'Bạn không phải jockey hiện tại của ngựa này',
            });
        }

        const races = await Race.find({
            registrations: {
                $elemMatch: { horse: horse._id, jockey: req.user._id },
            },
        })
            .sort({ raceDate: -1 })
            .select('name raceDate location distanceM status prizeMoney registrations.$');

        const upcoming = [];
        const history = [];
        let wins = 0;
        let podiums = 0;
        let totalRankedRaces = 0;
        let rankSum = 0;

        for (const race of races) {
            const reg = race.registrations[0];
            if (!reg) continue;
            const item = {
                raceId: race._id,
                raceName: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                approvalStatus: reg.approvalStatus,
                jockeyResponse: reg.jockeyResponse?.status,
                hireFee: reg.hireFee,
                finalRank: reg.finalRank,
            };
            if (race.status === 'Finished') {
                history.push(item);
                if (reg.finalRank) {
                    totalRankedRaces += 1;
                    rankSum += reg.finalRank;
                    if (reg.finalRank === 1) wins += 1;
                    if (reg.finalRank <= 3) podiums += 1;
                }
            } else {
                upcoming.push(item);
            }
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết ngựa bạn đang cưỡi',
            data: {
                horse,
                stats: {
                    totalRaces: history.length,
                    rankedRaces: totalRankedRaces,
                    wins,
                    podiums,
                    averageRank: totalRankedRaces
                        ? Number((rankSum / totalRankedRaces).toFixed(2))
                        : null,
                },
                upcomingRaces: upcoming,
                raceHistory: history,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * List all ride offers (registrations where I'm the jockey) that are still
 * awaiting my decision. We filter by jockeyResponse.status='Pending' AND
 * race.status not Finished/Cancelled so jockeys aren't shown stale offers.
 */
export const listRideOffers = async (req, res) => {
    try {
        const races = await Race.find({
            'registrations.jockey': req.user._id,
            status: { $in: ['Draft', 'Open', 'Locked'] },
        })
            .populate('registrations.horse', 'name registrationNumber')
            .populate('registrations.owner', 'fullName stableName');
        // Flatten into individual offers for the jockey's UX
        const offers = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                if (String(reg.jockey) !== String(req.user._id)) continue;
                if (reg.jockeyResponse?.status !== 'Pending') continue;
                offers.push({
                    raceId: race._id,
                    raceName: race.name,
                    raceDate: race.raceDate,
                    registrationId: reg._id,
                    horse: reg.horse,
                    owner: reg.owner,
                    hireFee: reg.hireFee,
                });
            }
        }
        return res.status(200).send({
            status: 'Success',
            message: 'Lời mời cưỡi đang chờ phản hồi',
            data: offers,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Jockey accepts or rejects a single ride offer (one registration on a race).
 * Refuses if (a) it's not addressed to me, or (b) I already responded — no
 * flip-flopping after a decision.
 */
export const respondToRideOffer = async (req, res) => {
    try {
        const { raceId, regId } = req.params;
        const { action, reason } = req.body;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(regId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'accept' hoặc 'decline'" });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (race.status === 'Finished' || race.status === 'Cancelled') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc/huỷ' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });
        if (String(reg.jockey) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Lời mời không gửi cho bạn' });
        }
        if (reg.jockeyResponse.status !== 'Pending') {
            return res.status(400).send({
                status: 'Error',
                message: `Bạn đã ${reg.jockeyResponse.status === 'Accepted' ? 'đồng ý' : 'từ chối'} rồi`,
            });
        }

        // Quá hạn từ chối: race còn quá ít ngày — jockey không được decline nữa
        // để tránh việc owner trở tay không kịp tìm jockey thay thế.
        if (action === 'decline' && isPastJockeyDeclineDeadline(race)) {
            return res.status(400).send({
                status: 'Error',
                message: `Đã quá thời hạn từ chối (chỉ được từ chối trước race ít nhất ${JOCKEY_RESPONSE_DEADLINE_DAYS} ngày). Bạn buộc phải đua.`,
            });
        }

        reg.jockeyResponse.status = action === 'accept' ? 'Accepted' : 'Declined';
        reg.jockeyResponse.respondedAt = new Date();
        if (action === 'decline') reg.jockeyResponse.declineReason = reason || 'Không nêu lý do';
        await race.save();

        await notify(reg.owner, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: action === 'accept'
                ? `Jockey đồng ý cưỡi race "${race.name}"`
                : `Jockey từ chối race "${race.name}"`,
            body: action === 'accept'
                ? `${req.user.fullName} đã nhận lời.`
                : `${req.user.fullName} từ chối. Lý do: ${reg.jockeyResponse.declineReason}`,
            data: { raceId: race._id, registrationId: reg._id, action },
        });

        return res.status(200).send({
            status: 'Success',
            message: action === 'accept' ? 'Đã đồng ý cưỡi' : 'Đã từ chối',
            data: reg,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
