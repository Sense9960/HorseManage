import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

export const listMine = async (req, res) => {
    try {
        const { unreadOnly, limit = 50 } = req.query;
        const filter = { user: req.user._id };
        if (unreadOnly === 'true') filter.read = false;
        const items = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit) || 50, 200));
        const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách thông báo',
            data: { items, unreadCount },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const markRead = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const noti = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { read: true },
            { new: true }
        );
        if (!noti) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy thông báo' });
        return res.status(200).send({ status: 'Success', message: 'Đã đánh dấu đã đọc', data: noti });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const markAllRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { user: req.user._id, read: false },
            { read: true }
        );
        return res.status(200).send({
            status: 'Success',
            message: 'Đã đánh dấu tất cả là đã đọc',
            data: { modified: result.modifiedCount },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
