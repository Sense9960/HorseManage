import mongoose from 'mongoose';
import { User, Jockey, ROLES } from '../models/User.js';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Gift, GiftRedemption } from '../models/Gift.js';
import { settleRacePredictions } from '../services/predictionService.js';

const HORSE_STATUSES = ['Active', 'Resting', 'Injured', 'Retired', 'Banned'];

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
        // For owners, attach horse summary so admin can spot abuse at a glance.
        const extra = {};
        if (user.role === ROLES.OWNER_HORSE) {
            const [horseCount, recentHorses] = await Promise.all([
                Horse.countDocuments({ owner: user._id }),
                Horse.find({ owner: user._id })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .select('name status registrationNumber createdAt')
                    .lean(),
            ]);
            extra.horseCount = horseCount;
            extra.recentHorses = recentHorses;
        }
        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết người dùng',
            data: { user, ...extra },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Admin browse all horses with filters. Supports owner audit + abuse review.
export const adminListHorses = async (req, res) => {
    try {
        const { ownerId, status, search, limit = 100 } = req.query;
        const filter = {};
        if (ownerId) {
            if (!mongoose.isValidObjectId(ownerId)) {
                return res.status(400).send({ status: 'Error', message: 'Invalid ownerId' });
            }
            filter.owner = ownerId;
        }
        if (status) filter.status = status;
        if (search) filter.name = { $regex: search, $options: 'i' };

        const horses = await Horse.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit) || 100, 500))
            .populate('owner', 'fullName email stableName')
            .populate('currentJockey', 'fullName licenseNumber')
            .lean();
        return res.status(200).send({ status: 'Success', message: 'Horses', data: horses });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const adminUpdateHorseStatus = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid horse ID' });
        }
        const { status, reason } = req.body;
        if (!HORSE_STATUSES.includes(status)) {
            return res.status(400).send({
                status: 'Error',
                message: `status must be one of: ${HORSE_STATUSES.join(', ')}`,
            });
        }
        const horse = await Horse.findById(req.params.id);
        if (!horse) return res.status(404).send({ status: 'Error', message: 'Horse not found' });
        horse.status = status;
        if (reason) horse.notes = `[Admin ${new Date().toISOString()}] ${reason}\n${horse.notes || ''}`;
        await horse.save();
        return res.status(200).send({ status: 'Success', message: `Horse status updated to ${status}`, data: horse });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const adminDeleteHorse = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid horse ID' });
        }
        const horse = await Horse.findByIdAndDelete(req.params.id);
        if (!horse) return res.status(404).send({ status: 'Error', message: 'Horse not found' });
        return res.status(200).send({ status: 'Success', message: 'Horse deleted' });
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

// Odds frozen at placement time; we still block edits on Finished races
// to avoid surprising the admin (no observable effect).
export const setRaceOdds = async (req, res) => {
    try {
        const { id } = req.params;
        const { odds } = req.body;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid race ID' });
        }
        if (!Array.isArray(odds) || odds.length === 0) {
            return res.status(400).send({ status: 'Error', message: 'odds must be a non-empty array' });
        }
        const race = await Race.findById(id);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Race not found' });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race already finished, odds cannot be changed' });
        }

        for (const o of odds) {
            if (!mongoose.isValidObjectId(o.registrationId)) {
                return res.status(400).send({ status: 'Error', message: `Invalid registrationId: ${o.registrationId}` });
            }
            const reg = race.registrations.id(o.registrationId);
            if (!reg) {
                return res.status(404).send({ status: 'Error', message: `Registration not found: ${o.registrationId}` });
            }
            for (const k of ['oddTop1', 'oddTop2', 'oddTop3']) {
                if (o[k] !== undefined) {
                    if (typeof o[k] !== 'number' || o[k] < 0) {
                        return res.status(400).send({ status: 'Error', message: `${k} must be ≥ 0` });
                    }
                    reg[k] = o[k];
                }
            }
        }

        await race.save();
        return res.status(200).send({ status: 'Success', message: 'Odds updated successfully', data: race });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Recovery hook: re-run settlement for any predictions still Pending on a
// Finished race (used when submitResults partially failed).
export const resettleRacePredictions = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid race ID' });
        }
        const race = await Race.findById(req.params.id);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Race not found' });
        if (race.status !== 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race must be Finished to resettle' });
        }
        const failures = await settleRacePredictions(race);
        return res.status(200).send({
            status: 'Success',
            message: failures.length ? 'Resettled with failures' : 'Resettled successfully',
            data: { failures },
        });
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

export const createGift = async (req, res) => {
    try {
        const { name, description, pointsCost, quantity, imageUrl, active } = req.body;
        if (!name || !pointsCost || quantity === undefined) {
            return res.status(400).send({ status: 'Error', message: 'name, pointsCost, quantity là bắt buộc' });
        }
        if (pointsCost < 1 || quantity < 0) {
            return res.status(400).send({ status: 'Error', message: 'pointsCost ≥ 1, quantity ≥ 0' });
        }
        const gift = await Gift.create({
            name,
            description,
            pointsCost,
            quantity,
            imageUrl,
            active: active !== false,
            createdBy: req.user._id,
        });
        return res.status(201).send({ status: 'Success', message: 'Tạo quà thành công', data: gift });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listGifts = async (req, res) => {
    try {
        const gifts = await Gift.find().sort({ createdAt: -1 });
        return res.status(200).send({ status: 'Success', message: 'Danh sách quà', data: gifts });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const updateGift = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const allowed = ['name', 'description', 'pointsCost', 'quantity', 'imageUrl', 'active'];
        const update = {};
        for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
        const gift = await Gift.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!gift) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy quà' });
        return res.status(200).send({ status: 'Success', message: 'Cập nhật quà thành công', data: gift });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const deleteGift = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const gift = await Gift.findByIdAndDelete(req.params.id);
        if (!gift) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy quà' });
        return res.status(200).send({ status: 'Success', message: 'Đã xoá quà' });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listRedemptions = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status;
        const items = await GiftRedemption.find(filter)
            .sort({ createdAt: -1 })
            .populate('user', 'fullName email')
            .populate('gift', 'name pointsCost');
        return res.status(200).send({ status: 'Success', message: 'Danh sách lượt đổi quà', data: items });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const markRedemptionDelivered = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const item = await GiftRedemption.findById(req.params.id);
        if (!item) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy redemption' });
        if (item.status !== 'Pending') {
            return res.status(400).send({ status: 'Error', message: 'Chỉ có thể mark Delivered từ trạng thái Pending' });
        }
        item.status = 'Delivered';
        item.deliveredAt = new Date();
        await item.save();
        return res.status(200).send({ status: 'Success', message: 'Đã giao quà', data: item });
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
