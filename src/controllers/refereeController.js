import mongoose from 'mongoose';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Jockey, Referee } from '../models/User.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import { credit, transfer } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';

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

        await notify(reg.owner, {
            type: action === 'approve' ? NOTIFICATION_TYPES.REGISTRATION_APPROVED : NOTIFICATION_TYPES.REGISTRATION_REJECTED,
            title: action === 'approve' ? `Đã duyệt đăng ký race "${race.name}"` : `Bị từ chối đăng ký race "${race.name}"`,
            body: action === 'approve'
                ? `Ngựa của bạn đã được duyệt tham gia.`
                : `Lý do: ${reg.rejectReason}`,
            data: { raceId: race._id, registrationId: reg._id, action },
        });

        return res.status(200).send({
            status: 'Success',
            message: action === 'approve' ? 'Đã duyệt jockey' : 'Đã từ chối jockey',
            data: reg,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

const calcPrize = (race, rank) => {
    if (!race.prizeMoney) return 0;
    const slot = (race.prizeDistribution || []).find((p) => p.rank === rank);
    if (!slot) return 0;
    return Math.round((race.prizeMoney * slot.percent) / 100);
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

            const prize = calcPrize(race, reg.finalRank);
            if (prize > 0) {
                try {
                    await credit(reg.owner, prize, {
                        type: WALLET_TX_TYPES.PRIZE,
                        reference: String(race._id),
                        description: `Tiền thưởng race "${race.name}" - hạng ${reg.finalRank}`,
                    });
                    await notify(reg.owner, {
                        type: NOTIFICATION_TYPES.PRIZE_PAID,
                        title: `Nhận thưởng race "${race.name}"`,
                        body: `Bạn nhận được ${prize.toLocaleString('vi-VN')} VND (hạng ${reg.finalRank})`,
                        data: { raceId: race._id, registrationId: reg._id, amount: prize, rank: reg.finalRank },
                    });
                } catch (e) {
                    console.error('Prize payout failed:', e.message);
                }
            }

            if (reg.hireFee && reg.hireFee > 0 && !reg.payoutDone) {
                try {
                    await transfer(reg.owner, reg.jockey, reg.hireFee, {
                        type: WALLET_TX_TYPES.HIRE_FEE_OUT,
                        reference: String(race._id),
                        description: `Phí thuê jockey race "${race.name}"`,
                    });
                    reg.payoutDone = true;
                    await notify(reg.jockey, {
                        type: NOTIFICATION_TYPES.HIRE_FEE_PAID,
                        title: `Nhận phí cưỡi race "${race.name}"`,
                        body: `Bạn nhận được ${reg.hireFee.toLocaleString('vi-VN')} VND tiền thuê`,
                        data: { raceId: race._id, registrationId: reg._id, amount: reg.hireFee },
                    });
                } catch (e) {
                    console.error('Hire fee transfer failed:', e.message);
                }
            }

            await notify(reg.owner, {
                type: NOTIFICATION_TYPES.RACE_FINISHED,
                title: `Race "${race.name}" đã kết thúc`,
                body: `Ngựa của bạn về hạng ${reg.finalRank}`,
                data: { raceId: race._id, registrationId: reg._id, rank: reg.finalRank },
            });
            await notify(reg.jockey, {
                type: NOTIFICATION_TYPES.RACE_FINISHED,
                title: `Race "${race.name}" đã kết thúc`,
                body: `Bạn về hạng ${reg.finalRank}`,
                data: { raceId: race._id, registrationId: reg._id, rank: reg.finalRank },
            });
        }
        await race.save();

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
