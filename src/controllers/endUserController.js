import mongoose from 'mongoose';
import { User, ROLES } from '../models/User.js';
import { Gift, GiftRedemption } from '../models/Gift.js';
import Race from '../models/Race.js';
import Prediction, { PREDICTION_TYPES } from '../models/Prediction.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const ODD_FIELD = { Top1: 'oddTop1', Top2: 'oddTop2', Top3: 'oddTop3' };

const PUBLIC_JOCKEY_FIELDS = 'fullName avatar experienceYears totalRaces totalWins rating';

export const getProfile = async (req, res) => {
    return res.status(200).send({
        status: 'Success',
        message: 'Hồ sơ người dùng',
        data: req.user,
    });
};

export const listJockeys = async (req, res) => {
    try {
        const jockeys = await User.find({ role: ROLES.JOCKEY, status: 'Active' })
            .select(PUBLIC_JOCKEY_FIELDS)
            .sort({ rating: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách Jockey',
            data: jockeys,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const followJockey = async (req, res) => {
    try {
        const { jockeyId } = req.params;
        if (!mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'jockeyId không hợp lệ' });
        }
        const jockey = await User.findOne({ _id: jockeyId, role: ROLES.JOCKEY });
        if (!jockey) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Jockey' });
        }

        const user = req.user;
        if (user.favoriteJockeys.some((id) => String(id) === String(jockeyId))) {
            return res.status(409).send({ status: 'Error', message: 'Bạn đã follow Jockey này' });
        }
        user.favoriteJockeys.push(jockey._id);
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Đã follow Jockey',
            data: user.favoriteJockeys,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const unfollowJockey = async (req, res) => {
    try {
        const { jockeyId } = req.params;
        if (!mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'jockeyId không hợp lệ' });
        }
        const user = req.user;
        user.favoriteJockeys = user.favoriteJockeys.filter(
            (id) => String(id) !== String(jockeyId)
        );
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Đã bỏ follow Jockey',
            data: user.favoriteJockeys,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listAvailableGifts = async (req, res) => {
    try {
        const gifts = await Gift.find({ active: true, quantity: { $gt: 0 } })
            .sort({ pointsCost: 1 })
            .select('name description pointsCost quantity imageUrl');
        return res.status(200).send({ status: 'Success', message: 'Quà có thể đổi', data: gifts });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const redeemGift = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'giftId không hợp lệ' });
        }
        const gift = await Gift.findOneAndUpdate(
            { _id: req.params.id, active: true, quantity: { $gt: 0 } },
            { $inc: { quantity: -1 } },
            { new: true }
        );
        if (!gift) {
            return res.status(400).send({ status: 'Error', message: 'Quà đã hết hoặc không khả dụng' });
        }
        const user = await User.findById(req.user._id);
        if ((user.points || 0) < gift.pointsCost) {
            await Gift.updateOne({ _id: gift._id }, { $inc: { quantity: 1 } });
            return res.status(400).send({
                status: 'Error',
                message: `Không đủ điểm. Cần ${gift.pointsCost}, bạn có ${user.points || 0}`,
            });
        }
        user.points = (user.points || 0) - gift.pointsCost;
        await user.save();
        const redemption = await GiftRedemption.create({
            user: user._id,
            gift: gift._id,
            giftNameSnapshot: gift.name,
            pointsPaid: gift.pointsCost,
        });
        await notify(user._id, {
            type: NOTIFICATION_TYPES.PREDICTION_BONUS,
            title: `Đã đổi quà: ${gift.name}`,
            body: `Trừ ${gift.pointsCost} điểm. Còn lại ${user.points} điểm. Đang chờ giao quà.`,
            data: { redemptionId: redemption._id, giftId: gift._id, pointsPaid: gift.pointsCost },
        });
        return res.status(201).send({
            status: 'Success',
            message: 'Đổi quà thành công, chờ admin giao',
            data: { redemption, remainingPoints: user.points },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyRedemptions = async (req, res) => {
    try {
        const items = await GiftRedemption.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('gift', 'name imageUrl pointsCost');
        return res.status(200).send({ status: 'Success', message: 'Lịch sử đổi quà', data: items });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * List races EndUser can predict on. Only Open/Locked races with at least
 * one Approved registration are returned — Draft has no public field yet,
 * Finished has settled predictions.
 */
export const listPredictableRaces = async (req, res) => {
    try {
        const races = await Race.find({ status: { $in: ['Open', 'Locked'] } })
            .sort({ raceDate: 1 })
            .populate('registrations.horse', 'name')
            .populate('registrations.jockey', 'fullName');
        const data = races.map((r) => ({
            _id: r._id,
            name: r.name,
            raceDate: r.raceDate,
            location: r.location,
            status: r.status,
            registrations: r.registrations
                .filter((reg) => reg.approvalStatus === 'Approved')
                .map((reg) => ({
                    _id: reg._id,
                    horse: reg.horse,
                    jockey: reg.jockey,
                    oddTop1: reg.oddTop1,
                    oddTop2: reg.oddTop2,
                    oddTop3: reg.oddTop3,
                })),
        }));
        return res.status(200).send({ status: 'Success', message: 'Predictable races', data });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Place a prediction: deduct stake from user.points, snapshot odds.
 * Race must be Open (not Locked/Finished) and registration must be Approved.
 * One user can place multiple predictions on the same race (different
 * registrations or different types).
 */
export const placePrediction = async (req, res) => {
    try {
        const { raceId } = req.params;
        const { registrationId, predictionType, stake } = req.body;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(registrationId)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid ID' });
        }
        if (!PREDICTION_TYPES.includes(predictionType)) {
            return res.status(400).send({ status: 'Error', message: `predictionType must be one of: ${PREDICTION_TYPES.join('/')}` });
        }
        if (!Number.isFinite(stake) || stake < 1) {
            return res.status(400).send({ status: 'Error', message: 'stake must be ≥ 1 point' });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Race not found' });
        if (race.status !== 'Open') {
            return res.status(400).send({ status: 'Error', message: 'Race not accepting predictions (must be Open)' });
        }
        const reg = race.registrations.id(registrationId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Registration not found' });
        if (reg.approvalStatus !== 'Approved') {
            return res.status(400).send({ status: 'Error', message: 'Predictions only allowed on Approved registrations' });
        }
        const odds = reg[ODD_FIELD[predictionType]];
        if (!odds || odds < 1) {
            return res.status(400).send({ status: 'Error', message: 'Odds not set or locked' });
        }

        const user = await User.findById(req.user._id);
        if ((user.points || 0) < stake) {
            return res.status(400).send({
                status: 'Error',
                message: `Insufficient points. Need ${stake}, you have ${user.points || 0}`,
            });
        }

        user.points = (user.points || 0) - stake;
        await user.save();

        const potentialPayout = Math.round(stake * odds);
        const prediction = await Prediction.create({
            user: user._id,
            race: race._id,
            registration: reg._id,
            predictionType,
            stake,
            oddsAtPlacement: odds,
            potentialPayout,
        });

        await notify(user._id, {
            type: NOTIFICATION_TYPES.PREDICTION_BONUS,
            title: `Prediction placed: ${predictionType}`,
            body: `Stake ${stake} points × ${odds} = max payout ${potentialPayout} points. Remaining ${user.points} points.`,
            data: { predictionId: prediction._id, raceId: race._id, stake, potentialPayout },
        });

        return res.status(201).send({
            status: 'Success',
            message: 'Prediction placed successfully',
            data: { prediction, remainingPoints: user.points },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyPredictions = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = { user: req.user._id };
        if (status) filter.status = status;
        const items = await Prediction.find(filter)
            .sort({ createdAt: -1 })
            .populate('race', 'name raceDate status');
        return res.status(200).send({ status: 'Success', message: 'Prediction history', data: items });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listFollowing = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate({
            path: 'favoriteJockeys',
            select: PUBLIC_JOCKEY_FIELDS,
        });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách Jockey đang follow',
            data: user.favoriteJockeys,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
