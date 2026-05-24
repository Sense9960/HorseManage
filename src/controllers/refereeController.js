import mongoose from 'mongoose';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Jockey, Referee } from '../models/User.js';

const isOwnRace = (race, refereeId) => String(race.referee) === String(refereeId);

export const listMyRaces = async (req, res) => {
    try {
        const races = await Race.find({ referee: req.user._id })
            .sort({ raceDate: -1 })
            .populate('registrations.horse', 'name registrationNumber')
            .populate('registrations.jockey', 'fullName licenseNumber')
            .populate('registrations.owner', 'fullName');
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách race được phân công',
            data: races,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const getRace = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'Race ID không hợp lệ' });
        }
        const race = await Race.findById(req.params.id)
            .populate('registrations.horse', 'name registrationNumber breed status')
            .populate('registrations.jockey', 'fullName licenseNumber weightKg status')
            .populate('registrations.owner', 'fullName stableName');
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (!isOwnRace(race, req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Bạn không phải referee của race này' });
        }
        return res.status(200).send({ status: 'Success', message: 'Chi tiết race', data: race });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const decideRegistration = async (req, res) => {
    try {
        const { id, regId } = req.params;
        const { action, reason } = req.body;
        if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(regId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'approve' hoặc 'reject'" });
        }

        const race = await Race.findById(id);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (!isOwnRace(race, req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Bạn không phải referee của race này' });
        }
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể duyệt' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });

        if (action === 'approve') {
            const jockey = await Jockey.findById(reg.jockey);
            if (!jockey || !jockey.licenseNumber) {
                return res.status(400).send({
                    status: 'Error',
                    message: 'Jockey chưa có licenseNumber, không thể duyệt',
                });
            }
            if (jockey.status !== 'Active') {
                return res.status(400).send({ status: 'Error', message: 'Jockey không ở trạng thái Active' });
            }
            const horse = await Horse.findById(reg.horse);
            if (!horse || horse.status !== 'Active') {
                return res.status(400).send({ status: 'Error', message: 'Ngựa không ở trạng thái Active' });
            }
            reg.approvalStatus = 'Approved';
            reg.rejectReason = undefined;
        } else {
            reg.approvalStatus = 'Rejected';
            reg.rejectReason = reason || 'Không nêu lý do';
        }

        await race.save();
        return res.status(200).send({
            status: 'Success',
            message: action === 'approve' ? 'Đã duyệt jockey' : 'Đã từ chối jockey',
            data: reg,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const submitResults = async (req, res) => {
    try {
        const { id } = req.params;
        const { results } = req.body;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).send({ status: 'Error', message: 'Race ID không hợp lệ' });
        }
        if (!Array.isArray(results) || results.length === 0) {
            return res.status(400).send({ status: 'Error', message: 'results là mảng bắt buộc' });
        }

        const race = await Race.findById(id);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (!isOwnRace(race, req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Bạn không phải referee của race này' });
        }
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể nhập lại' });
        }

        const ranks = new Set();
        for (const r of results) {
            if (!mongoose.isValidObjectId(r.registrationId) || !Number.isInteger(r.rank) || r.rank < 1) {
                return res.status(400).send({ status: 'Error', message: 'Mỗi item cần registrationId + rank ≥ 1' });
            }
            if (ranks.has(r.rank)) {
                return res.status(400).send({ status: 'Error', message: `rank ${r.rank} bị trùng` });
            }
            ranks.add(r.rank);
        }

        for (const r of results) {
            const reg = race.registrations.id(r.registrationId);
            if (!reg) {
                return res.status(400).send({ status: 'Error', message: `Không tìm thấy registration ${r.registrationId}` });
            }
            if (reg.approvalStatus !== 'Approved') {
                return res.status(400).send({
                    status: 'Error',
                    message: 'Chỉ có thể xếp rank cho đăng ký đã Approved',
                });
            }
            reg.finalRank = r.rank;
        }

        race.status = 'Finished';
        race.finalizedAt = new Date();
        await race.save();

        for (const reg of race.registrations) {
            if (!reg.finalRank) continue;
            const horse = await Horse.findById(reg.horse);
            if (horse) {
                horse.totalRaces = (horse.totalRaces || 0) + 1;
                if (reg.finalRank === 1) horse.totalWins = (horse.totalWins || 0) + 1;
                await horse.save();
            }
            const jockey = await Jockey.findById(reg.jockey);
            if (jockey) {
                jockey.totalRaces = (jockey.totalRaces || 0) + 1;
                if (reg.finalRank === 1) jockey.totalWins = (jockey.totalWins || 0) + 1;
                jockey.rating = jockey.totalRaces > 0
                    ? Math.round((jockey.totalWins / jockey.totalRaces) * 1000) / 10
                    : 0;
                await jockey.save();
            }
        }

        await Referee.updateOne(
            { _id: req.user._id },
            { $inc: { totalRacesOfficiated: 1 } }
        );

        return res.status(200).send({
            status: 'Success',
            message: 'Đã chốt kết quả race',
            data: race,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
