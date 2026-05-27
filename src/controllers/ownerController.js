import mongoose from 'mongoose';
import Horse from '../models/Horse.js';
import Race from '../models/Race.js';
import { User, Jockey, ROLES } from '../models/User.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const JOCKEY_PUBLIC_FIELDS = 'fullName avatar licenseNumber experienceYears weightKg heightCm totalRaces totalWins rating pricePerRace status';

const HORSE_FIELDS = [
    'name', 'breed', 'color', 'gender', 'dateOfBirth',
    'weightKg', 'heightCm', 'registrationNumber', 'status', 'notes',
];

const pick = (body, fields) => {
    const out = {};
    for (const f of fields) {
        if (body[f] !== undefined) out[f] = body[f];
    }
    return out;
};

export const createHorse = async (req, res) => {
    try {
        const data = pick(req.body, HORSE_FIELDS);
        if (!data.name) {
            return res.status(400).send({ status: 'Error', message: 'name là bắt buộc' });
        }
        const horse = await Horse.create({ ...data, owner: req.user._id });
        return res.status(201).send({
            status: 'Success',
            message: 'Tạo ngựa thành công',
            data: horse,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyHorses = async (req, res) => {
    try {
        const horses = await Horse.find({ owner: req.user._id }).sort({ createdAt: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngựa của bạn',
            data: horses,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const getMyHorse = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const horse = await Horse.findById(req.params.id);
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }
        return res.status(200).send({ status: 'Success', message: 'Chi tiết ngựa', data: horse });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const updateHorse = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const horse = await Horse.findById(req.params.id);
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }
        Object.assign(horse, pick(req.body, HORSE_FIELDS));
        await horse.save();
        return res.status(200).send({ status: 'Success', message: 'Cập nhật ngựa thành công', data: horse });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const deleteHorse = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const horse = await Horse.findById(req.params.id);
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }
        await horse.deleteOne();
        return res.status(200).send({ status: 'Success', message: 'Đã xóa ngựa' });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const assignJockey = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'ID ngựa không hợp lệ' });
        }
        const { jockeyId } = req.body;
        if (!mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'jockeyId không hợp lệ' });
        }

        const horse = await Horse.findById(req.params.id);
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }

        const jockey = await User.findOne({ _id: jockeyId, role: ROLES.JOCKEY });
        if (!jockey) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Jockey' });
        }
        if (jockey.status !== 'Active') {
            return res.status(400).send({ status: 'Error', message: 'Jockey không ở trạng thái Active' });
        }
        if (!jockey.licenseNumber) {
            return res.status(400).send({ status: 'Error', message: 'Jockey chưa có licenseNumber hợp lệ' });
        }

        horse.currentJockey = jockey._id;
        await horse.save();

        await notify(jockey._id, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Bạn được thuê cưỡi ngựa "${horse.name}"`,
            body: `Owner ${req.user.fullName} vừa gán bạn làm jockey.`,
            data: { horseId: horse._id, ownerId: req.user._id },
        });

        return res.status(200).send({
            status: 'Success',
            message: 'Đã gán Jockey cho ngựa',
            data: horse,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Browse pool of hireable Jockeys — Active + licensed only.
export const listHireableJockeys = async (req, res) => {
    try {
        const jockeys = await Jockey.find({
            role: ROLES.JOCKEY,
            status: 'Active',
            licenseNumber: { $exists: true, $ne: null },
        })
            .select(JOCKEY_PUBLIC_FIELDS)
            .sort({ rating: -1, pricePerRace: 1 })
            .lean();
        return res.status(200).send({ status: 'Success', message: 'Hireable jockeys', data: jockeys });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Every race registration this owner has sent — across all races.
export const listMyRaceOffers = async (req, res) => {
    try {
        const races = await Race.find({ 'registrations.owner': req.user._id })
            .sort({ raceDate: -1 })
            .populate('registrations.horse', 'name')
            .populate('registrations.jockey', 'fullName licenseNumber pricePerRace')
            .lean();
        const offers = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                if (String(reg.owner) !== String(req.user._id)) continue;
                offers.push({
                    raceId: race._id,
                    raceName: race.name,
                    raceDate: race.raceDate,
                    raceStatus: race.status,
                    registrationId: reg._id,
                    horse: reg.horse,
                    jockey: reg.jockey,
                    hireFee: reg.hireFee,
                    approvalStatus: reg.approvalStatus,
                    jockeyResponse: reg.jockeyResponse,
                });
            }
        }
        return res.status(200).send({ status: 'Success', message: 'My race offers', data: offers });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Withdraw a registration. Only safe to remove before referee approves and
// before race locks; if jockey already accepted we still allow it (owner's
// prerogative) but never after Approved or Locked/Finished.
export const cancelRaceOffer = async (req, res) => {
    try {
        const { raceId, regId } = req.params;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(regId)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid ID' });
        }
        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Race not found' });
        if (!['Draft', 'Open'].includes(race.status)) {
            return res.status(400).send({ status: 'Error', message: 'Race no longer accepting changes' });
        }
        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Registration not found' });
        if (String(reg.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Not your registration' });
        }
        if (reg.approvalStatus === 'Approved') {
            return res.status(400).send({ status: 'Error', message: 'Already approved by referee — cannot cancel' });
        }

        const jockeyId = reg.jockey;
        const horseName = (await Horse.findById(reg.horse).select('name').lean())?.name;
        reg.deleteOne();
        await race.save();

        await notify(jockeyId, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Offer withdrawn for race "${race.name}"`,
            body: `Owner cancelled the offer${horseName ? ` (horse: ${horseName})` : ''}.`,
            data: { raceId: race._id, registrationId: regId, cancelled: true },
        });

        return res.status(200).send({ status: 'Success', message: 'Offer cancelled' });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const registerForRace = async (req, res) => {
    try {
        const { raceId } = req.params;
        const { horseId, jockeyId, hireFee = 0 } = req.body;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(horseId) || !mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (!['Draft', 'Open'].includes(race.status)) {
            return res.status(400).send({ status: 'Error', message: 'Race không còn nhận đăng ký' });
        }

        const horse = await Horse.findById(horseId);
        if (!horse) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }
        if (horse.status !== 'Active') {
            return res.status(400).send({ status: 'Error', message: 'Ngựa không ở trạng thái Active' });
        }

        const jockey = await User.findOne({ _id: jockeyId, role: ROLES.JOCKEY });
        if (!jockey) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Jockey' });

        if (race.registrations.some((r) => String(r.horse) === String(horseId))) {
            return res.status(409).send({ status: 'Error', message: 'Ngựa đã đăng ký race này' });
        }
        if (race.registrations.some((r) => String(r.jockey) === String(jockeyId))) {
            return res.status(409).send({ status: 'Error', message: 'Jockey đã đăng ký race này' });
        }

        race.registrations.push({
            horse: horse._id,
            jockey: jockey._id,
            owner: req.user._id,
            approvalStatus: 'Pending',
            hireFee: Math.max(0, Number(hireFee) || 0),
        });
        await race.save();

        if (hireFee > 0) {
            await notify(jockey._id, {
                type: NOTIFICATION_TYPES.JOCKEY_HIRED,
                title: `Đề nghị cưỡi race "${race.name}"`,
                body: `Phí: ${Number(hireFee).toLocaleString('vi-VN')} VND. Sẽ chi trả sau khi race kết thúc.`,
                data: { raceId: race._id, ownerId: req.user._id, hireFee: Number(hireFee) },
            });
        }

        return res.status(201).send({
            status: 'Success',
            message: 'Đăng ký race thành công, chờ referee duyệt',
            data: race.registrations[race.registrations.length - 1],
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
