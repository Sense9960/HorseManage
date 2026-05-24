import mongoose from 'mongoose';
import { User, ROLES } from '../models/User.js';
import { Gift, GiftRedemption } from '../models/Gift.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

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
