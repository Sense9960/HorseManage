import mongoose from 'mongoose';
import { User, Jockey, ROLES } from '../models/User.js';
import Race from '../models/Race.js';

const STATUSES = ['Active', 'Inactive', 'Banned'];

export const listUsers = async (req, res) => {
    try {
        const { role, status } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (status) filter.status = status;

        const users = await User.find(filter).sort({ createdAt: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách người dùng',
            data: users,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const getUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy người dùng' });
        }
        return res.status(200).send({ status: 'Success', message: 'Chi tiết người dùng', data: user });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { status } = req.body;
        if (!STATUSES.includes(status)) {
            return res.status(400).send({
                status: 'Error',
                message: `status phải là một trong: ${STATUSES.join(', ')}`,
            });
        }
        if (String(req.params.id) === String(req.user._id)) {
            return res.status(400).send({ status: 'Error', message: 'Không thể tự đổi trạng thái chính mình' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy người dùng' });
        }
        user.status = status;
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: `Đã cập nhật trạng thái thành ${status}`,
            data: user,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const approveJockeyLicense = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { licenseNumber } = req.body;
        if (!licenseNumber) {
            return res.status(400).send({ status: 'Error', message: 'licenseNumber là bắt buộc' });
        }

        const jockey = await Jockey.findOne({ _id: req.params.id, role: ROLES.JOCKEY });
        if (!jockey) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Jockey' });
        }
        jockey.licenseNumber = licenseNumber;
        await jockey.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Đã duyệt license cho Jockey',
            data: jockey,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const createRace = async (req, res) => {
    try {
        const { name, raceDate, location, distanceM, refereeId, status } = req.body;
        if (!name || !raceDate || !refereeId) {
            return res.status(400).send({ status: 'Error', message: 'name, raceDate, refereeId là bắt buộc' });
        }
        if (!mongoose.isValidObjectId(refereeId)) {
            return res.status(400).send({ status: 'Error', message: 'refereeId không hợp lệ' });
        }
        const referee = await User.findOne({ _id: refereeId, role: ROLES.REFEREE });
        if (!referee) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Referee' });
        if (referee.status !== 'Active') {
            return res.status(400).send({ status: 'Error', message: 'Referee không ở trạng thái Active' });
        }

        const race = await Race.create({
            name,
            raceDate,
            location,
            distanceM,
            referee: refereeId,
            status: status || 'Open',
        });
        return res.status(201).send({ status: 'Success', message: 'Tạo race thành công', data: race });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listRaces = async (req, res) => {
    try {
        const races = await Race.find()
            .sort({ raceDate: -1 })
            .populate('referee', 'fullName email');
        return res.status(200).send({ status: 'Success', message: 'Danh sách race', data: races });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        if (String(req.params.id) === String(req.user._id)) {
            return res.status(400).send({ status: 'Error', message: 'Không thể tự xóa chính mình' });
        }
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy người dùng' });
        }
        return res.status(200).send({ status: 'Success', message: 'Đã xóa người dùng' });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
