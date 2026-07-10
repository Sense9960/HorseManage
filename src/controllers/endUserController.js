import mongoose from 'mongoose';
import crypto from 'crypto';
import { User, ROLES } from '../models/User.js';
import { Gift, GiftRedemption } from '../models/Gift.js';
import Race from '../models/Race.js';
import Prediction, { PREDICTION_TYPES } from '../models/Prediction.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const ODD_FIELD = { Top1: 'oddTop1', Top2: 'oddTop2', Top3: 'oddTop3' };

const PUBLIC_JOCKEY_FIELDS = 'fullName avatar experienceYears totalRaces totalWins rating';

const ENDUSER_EDITABLE = ['fullName', 'phone', 'avatar', 'address', 'dateOfBirth'];

const DAILY_CHECKIN_POINTS = Number(process.env.DAILY_CHECKIN_POINTS) || 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Trả về midnight (00:00) của ngày chứa thời điểm `date` theo timezone server.
 * So sánh "ngày" thay vì "24 tiếng" để tránh trường hợp user check-in 23:59
 * rồi không thể check-in 00:01 ngày hôm sau.
 */
const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * Điểm danh hằng ngày: cộng DAILY_CHECKIN_POINTS điểm. Không cho điểm danh
 * 2 lần trong cùng 1 ngày. Streak +1 nếu hôm qua đã điểm danh, ngược lại
 * reset về 1.
 */
export const dailyCheckIn = async (req, res) => {
    try {
        const user = req.user;
        const now = new Date();
        const today = startOfDay(now);

        if (user.lastCheckInAt) {
            const lastDay = startOfDay(user.lastCheckInAt);
            if (lastDay.getTime() === today.getTime()) {
                return res.status(400).send({
                    status: 'Error',
                    message: 'Hôm nay bạn đã điểm danh rồi. Quay lại vào ngày mai!',
                    data: {
                        points: user.points,
                        checkInStreak: user.checkInStreak,
                        nextCheckInAt: new Date(today.getTime() + MS_PER_DAY),
                    },
                });
            }
            const yesterday = today.getTime() - MS_PER_DAY;
            user.checkInStreak = lastDay.getTime() === yesterday
                ? (user.checkInStreak || 0) + 1
                : 1;
        } else {
            user.checkInStreak = 1;
        }

        user.points = (user.points || 0) + DAILY_CHECKIN_POINTS;
        user.lastCheckInAt = now;
        user.totalCheckIns = (user.totalCheckIns || 0) + 1;
        await user.save();

        return res.status(200).send({
            status: 'Success',
            message: `Điểm danh thành công! +${DAILY_CHECKIN_POINTS} điểm`,
            data: {
                pointsEarned: DAILY_CHECKIN_POINTS,
                points: user.points,
                checkInStreak: user.checkInStreak,
                totalCheckIns: user.totalCheckIns,
                lastCheckInAt: user.lastCheckInAt,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Trạng thái check-in: đã điểm danh hôm nay chưa, streak hiện tại, lần check-in
 * tiếp theo có thể thực hiện. Dùng cho FE hiển thị nút "Điểm danh" / "Đã điểm danh".
 */
export const getCheckInStatus = async (req, res) => {
    try {
        const user = req.user;
        const today = startOfDay(new Date());
        const lastDay = user.lastCheckInAt ? startOfDay(user.lastCheckInAt) : null;
        const checkedInToday = lastDay && lastDay.getTime() === today.getTime();
        return res.status(200).send({
            status: 'Success',
            message: 'Trạng thái điểm danh',
            data: {
                points: user.points || 0,
                checkInStreak: user.checkInStreak || 0,
                totalCheckIns: user.totalCheckIns || 0,
                checkedInToday: Boolean(checkedInToday),
                lastCheckInAt: user.lastCheckInAt || null,
                nextCheckInAt: checkedInToday
                    ? new Date(today.getTime() + MS_PER_DAY)
                    : new Date(),
                dailyReward: DAILY_CHECKIN_POINTS,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        for (const f of ENDUSER_EDITABLE) {
            if (req.body[f] !== undefined) user[f] = req.body[f];
        }
        await user.save();
        return res.status(200).send({ status: 'Success', message: 'Profile updated', data: user });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
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

/**
 * Sinh mã voucher 10 ký tự: 4 chữ cái viết hoa + 6 số.
 * Vd: "AXKZ481923". Đủ entropy (26^4 * 10^6 ≈ 4.5e11) để tránh trùng cho dự án nhỏ.
 * Có retry vì DB index unique sẽ chặn nếu collide.
 */
// Đơn giản: 16 ký tự hex uppercase từ crypto random. Entropy 64-bit,
// đảm bảo không trùng cho dự án nhỏ. Không cần logic 4 chữ + 6 số nữa.
const generateRedemptionCode = () => crypto.randomBytes(8).toString('hex').toUpperCase();

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
            return res.status(400).send({ status: 'Error', message: 'Gift sold out or unavailable' });
        }
        // Atomic deduct; if points are short, rollback the gift quantity.
        const updated = await User.findOneAndUpdate(
            { _id: req.user._id, points: { $gte: gift.pointsCost } },
            { $inc: { points: -gift.pointsCost } },
            { new: true }
        );
        if (!updated) {
            await Gift.updateOne({ _id: gift._id }, { $inc: { quantity: 1 } });
            return res.status(400).send({ status: 'Error', message: `Insufficient points (need ${gift.pointsCost})` });
        }

        // Sinh code 10 ký tự, retry tối đa 5 lần nếu trùng (cực hiếm).
        let redemption = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                redemption = await GiftRedemption.create({
                    user: updated._id,
                    gift: gift._id,
                    giftNameSnapshot: gift.name,
                    pointsPaid: gift.pointsCost,
                    description: gift.description || '',
                    code: generateRedemptionCode(),
                });
                break;
            } catch (err) {
                if (err.code !== 11000) throw err;   // 11000 = duplicate key
            }
        }
        if (!redemption) {
            // Cực hiếm: rollback gift + points để không mất data.
            await Gift.updateOne({ _id: gift._id }, { $inc: { quantity: 1 } });
            await User.updateOne({ _id: updated._id }, { $inc: { points: gift.pointsCost } });
            return res.status(500).send({ status: 'Error', message: 'Không sinh được mã code, thử lại' });
        }

        await notify(updated._id, {
            type: NOTIFICATION_TYPES.PREDICTION_BONUS,
            title: `Đổi quà thành công: ${gift.name}`,
            body: `Mã code của bạn: ${redemption.code}. ${gift.description || ''}`.trim(),
            data: {
                redemptionId: redemption._id,
                giftId: gift._id,
                code: redemption.code,
                pointsPaid: gift.pointsCost,
            },
        });
        return res.status(201).send({
            status: 'Success',
            message: `Đổi quà thành công — mã code: ${redemption.code}`,
            data: { redemption, remainingPoints: updated.points },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyRedemptions = async (req, res) => {
    try {
        const items = await GiftRedemption.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('gift', 'name imageUrl pointsCost description')
            .lean();
        // Phẳng lại response để FE hiện rõ code + description ngay ở top level,
        // không phải FE phải tự đào vào nested gift.description.
        const data = items.map((r) => ({
            _id: r._id,
            code: r.code,
            giftName: r.giftNameSnapshot,
            description: r.description || r.gift?.description || '',
            pointsPaid: r.pointsPaid,
            status: r.status,
            usedAt: r.usedAt,
            redeemedAt: r.createdAt,
            gift: r.gift,
        }));
        return res.status(200).send({ status: 'Success', message: 'Lịch sử đổi quà', data });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listPredictableRaces = async (req, res) => {
    try {
        const races = await Race.find({ status: 'Open' })
            .sort({ raceDate: 1 })
            .populate('registrations.horse', 'name')
            .populate('registrations.jockey', 'fullName')
            .lean();
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

        // Atomic deduct: prevents two concurrent bets exceeding the user's balance.
        const updated = await User.findOneAndUpdate(
            { _id: req.user._id, points: { $gte: stake } },
            { $inc: { points: -stake } },
            { new: true }
        );
        if (!updated) {
            return res.status(400).send({ status: 'Error', message: 'Insufficient points' });
        }

        const potentialPayout = Math.round(stake * odds);
        let prediction;
        try {
            prediction = await Prediction.create({
                user: updated._id,
                race: race._id,
                registration: reg._id,
                predictionType,
                stake,
                oddsAtPlacement: odds,
                potentialPayout,
            });
        } catch (e) {
            await User.updateOne({ _id: updated._id }, { $inc: { points: stake } });
            throw e;
        }

        await notify(updated._id, {
            type: NOTIFICATION_TYPES.PREDICTION_BONUS,
            title: `Prediction placed: ${predictionType}`,
            body: `Stake ${stake} × ${odds} = max payout ${potentialPayout}. Remaining ${updated.points}.`,
            data: { predictionId: prediction._id, raceId: race._id, stake, potentialPayout },
        });

        return res.status(201).send({
            status: 'Success',
            message: 'Prediction placed successfully',
            data: { prediction, remainingPoints: updated.points },
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
