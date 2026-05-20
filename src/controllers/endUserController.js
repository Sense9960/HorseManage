import mongoose from 'mongoose';
import { User, ROLES } from '../models/User.js';

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
