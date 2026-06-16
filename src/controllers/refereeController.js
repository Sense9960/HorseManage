/**
 * Referee actions on a race.
 *
 * The Referee role is the gatekeeper around a race:
 *   - Before the race: approve/reject each registration (jockey + horse pair).
 *     This is where we double-check licence & active status — owners can
 *     register anyone, the referee is the human filter.
 *   - After the race: submit the final ranking. This single call is what
 *     drives payouts, stats updates and notifications. There is no "undo"
 *     once the race is Finished.
 *
 * All endpoints in this module require role=Referee AND that the referee is
 * the one assigned to the race (referee field). Admin override happens
 * elsewhere (not implemented yet).
 */

import mongoose from 'mongoose';
import Race from '../models/Race.js';
import Horse from '../models/Horse.js';
import { Jockey, Referee } from '../models/User.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import { credit, transfer } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';
import { settleRacePredictions } from '../services/predictionService.js';
import { simulateRace } from '../services/raceSimulationService.js';
import { effectiveJockeyResponse } from '../services/rideOfferDeadline.js';

const formatVnd = (n) => `${n.toLocaleString('vi-VN')} VND`;

const isOwnRace = (race, refereeId) => String(race.referee) === String(refereeId);

/**
 * Liệt kê tất cả registration đang chờ duyệt (Pending) trên các race của
 * referee này. Trả về flat list để FE dashboard hiển thị "Cần duyệt" mà
 * không phải tự loop qua từng race. Tự sort: race gần nhất lên đầu.
 *
 * Lọc thêm: chỉ trả registration mà jockey đã Accepted (hoặc đã quá hạn
 * decline → coi như Accepted), vì registration chưa có jockey đồng ý thì
 * referee chưa nên duyệt.
 */
export const listPendingRegistrations = async (req, res) => {
    try {
        const races = await Race.find({
            referee: req.user._id,
            status: { $in: ['Draft', 'Open', 'Locked'] },
            'registrations.approvalStatus': 'Pending',
        })
            .sort({ raceDate: 1 })
            .populate('registrations.horse', 'name registrationNumber breed status weightKg')
            .populate('registrations.jockey', 'fullName licenseNumber weightKg status experienceYears rating')
            .populate('registrations.owner', 'fullName stableName phone')
            .lean();

        const items = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                if (reg.approvalStatus !== 'Pending') continue;
                const jockeyResp = reg.jockeyResponse?.status || 'Pending';
                items.push({
                    raceId: race._id,
                    raceName: race.name,
                    raceDate: race.raceDate,
                    raceStatus: race.status,
                    location: race.location,
                    distanceM: race.distanceM,
                    registrationId: reg._id,
                    horse: reg.horse,
                    jockey: reg.jockey,
                    owner: reg.owner,
                    hireFee: reg.hireFee,
                    jockeyBonusPercent: reg.jockeyBonusPercent,
                    entryFeePaid: reg.entryFeePaid,
                    jockeyResponse: reg.jockeyResponse,
                    readyToApprove: jockeyResp === 'Accepted',
                });
            }
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách đăng ký chờ duyệt',
            data: items,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

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

/**
 * Approve or reject ONE registration. We re-check the jockey & horse here
 * (not just trust what the owner submitted) because the owner's state may
 * have drifted (licence revoked, horse moved to Injured, etc.) between
 * registration and race day.
 */
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
            // Jockey must have accepted the hire offer first — referee can't
            // greenlight a registration the jockey hasn't agreed to ride.
            // Pending sau hạn decline (race quá gần) được coi như Accepted —
            // jockey im lặng quá deadline tự động bị khoá vào race.
            const effective = effectiveJockeyResponse(reg, race);
            if (effective !== 'Accepted') {
                return res.status(400).send({
                    status: 'Error',
                    message: `Jockey chưa đồng ý cưỡi (${reg.jockeyResponse?.status || 'Pending'})`,
                });
            }
            const jockey = await Jockey.findById(reg.jockey);
            if (!jockey || !jockey.licenseNumber) {
                return res.status(400).send({ status: 'Error', message: 'Jockey chưa có licenseNumber, không thể duyệt' });
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
            // Refund entry fee + roll back prize pool contribution.
            if (reg.entryFeePaid > 0) {
                try {
                    await credit(reg.owner, reg.entryFeePaid, {
                        type: WALLET_TX_TYPES.REFUND,
                        reference: String(race._id),
                        description: `Refund entry fee (rejected) for race "${race.name}"`,
                    });
                    if (race.addEntryFeeToPrize) {
                        race.prizeMoney = Math.max(0, (race.prizeMoney || 0) - reg.entryFeePaid);
                    }
                    reg.entryFeePaid = 0;
                } catch (e) {
                    // Don't block reject for refund failure — admin can reconcile.
                    console.error('Refund entry fee failed on reject:', e.message);
                }
            }
        }

        await race.save();

        await notify(reg.owner, {
            type: action === 'approve' ? NOTIFICATION_TYPES.REGISTRATION_APPROVED : NOTIFICATION_TYPES.REGISTRATION_REJECTED,
            title: action === 'approve' ? `Đã duyệt đăng ký race "${race.name}"` : `Bị từ chối đăng ký race "${race.name}"`,
            body: action === 'approve' ? 'Ngựa của bạn đã được duyệt tham gia.' : `Lý do: ${reg.rejectReason}`,
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

/** Compute prize for a given rank based on the race's prizeDistribution. */
const calcPrize = (race, rank) => {
    if (!race.prizeMoney) return 0;
    const slot = (race.prizeDistribution || []).find((p) => p.rank === rank);
    return slot ? Math.round((race.prizeMoney * slot.percent) / 100) : 0;
};

/**
 * Validate the incoming `results` body. Returns a string error message if
 * invalid, or null if OK. Done as a separate pass so we never partially
 * apply a bad payload (no rank gets written until everything checks out).
 */
const validateResults = (results, race) => {
    if (!Array.isArray(results) || results.length === 0) return 'results là mảng bắt buộc';
    const seenRanks = new Set();
    for (const r of results) {
        if (!mongoose.isValidObjectId(r.registrationId) || !Number.isInteger(r.rank) || r.rank < 1) {
            return 'Mỗi item cần registrationId + rank ≥ 1';
        }
        if (seenRanks.has(r.rank)) return `rank ${r.rank} bị trùng`;
        seenRanks.add(r.rank);
        const reg = race.registrations.id(r.registrationId);
        if (!reg) return `Không tìm thấy registration ${r.registrationId}`;
        if (reg.approvalStatus !== 'Approved') return 'Chỉ có thể xếp rank cho đăng ký đã Approved';
    }
    return null;
};

/** Update Horse + Jockey aggregate stats based on a finished registration. */
const updateRunnerStats = async (reg) => {
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
        // rating = win rate × 100, one decimal place
        jockey.rating = jockey.totalRaces > 0
            ? Math.round((jockey.totalWins / jockey.totalRaces) * 1000) / 10
            : 0;
        await jockey.save();
    }
};

/**
 * Run all money movements + notifications for one finished registration.
 * Returns a list of {kind, error} entries for any payout that failed so the
 * caller can surface them to the referee (and admin can reconcile later).
 *
 * Payouts are NOT rolled back on failure — credit/debit are independent
 * transactions and refunding them automatically would risk double-spends.
 */
const payoutRegistration = async (race, reg) => {
    const failures = [];

    const prize = calcPrize(race, reg.finalRank);
    if (prize > 0) {
        try {
            await credit(reg.owner, prize, {
                type: WALLET_TX_TYPES.PRIZE,
                reference: String(race._id),
                description: `Prize for race "${race.name}" - rank ${reg.finalRank}`,
            });
            await notify(reg.owner, {
                type: NOTIFICATION_TYPES.PRIZE_PAID,
                title: `Prize received: "${race.name}"`,
                body: `You received ${formatVnd(prize)} (rank ${reg.finalRank})`,
                data: { raceId: race._id, registrationId: reg._id, amount: prize, rank: reg.finalRank },
            });
        } catch (e) {
            failures.push({ kind: 'prize', registrationId: reg._id, error: e.message });
        }
    }

    // Bonus split: owner shares % of prize with jockey (on top of hireFee).
    if (prize > 0 && reg.jockeyBonusPercent > 0 && !reg.bonusPaid) {
        const bonus = Math.round((prize * reg.jockeyBonusPercent) / 100);
        if (bonus > 0) {
            try {
                await transfer(reg.owner, reg.jockey, bonus, {
                    type: WALLET_TX_TYPES.BONUS,
                    reference: String(race._id),
                    description: `Win bonus ${reg.jockeyBonusPercent}% of prize for race "${race.name}"`,
                });
                reg.bonusPaid = true;
                await notify(reg.jockey, {
                    type: NOTIFICATION_TYPES.HIRE_FEE_PAID,
                    title: `Win bonus from "${race.name}"`,
                    body: `You received ${formatVnd(bonus)} (${reg.jockeyBonusPercent}% of prize, rank ${reg.finalRank})`,
                    data: { raceId: race._id, registrationId: reg._id, amount: bonus, bonusPercent: reg.jockeyBonusPercent },
                });
            } catch (e) {
                failures.push({ kind: 'bonus', registrationId: reg._id, error: e.message });
            }
        }
    }

    if (reg.hireFee > 0 && !reg.payoutDone) {
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
                body: `Bạn nhận được ${formatVnd(reg.hireFee)} tiền thuê`,
                data: { raceId: race._id, registrationId: reg._id, amount: reg.hireFee },
            });
        } catch (e) {
            failures.push({ kind: 'hireFee', registrationId: reg._id, error: e.message });
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

    return failures;
};

// Shared finalize: assumes finalRank is already written on registrations.
// Runs payouts + settles predictions + marks Finished. Failures collected.
const finalizeRace = async (race, refereeId) => {
    const payoutFailures = [];
    for (const reg of race.registrations) {
        if (!reg.finalRank) continue;
        await updateRunnerStats(reg);
        payoutFailures.push(...(await payoutRegistration(race, reg)));
    }

    race.status = 'Finished';
    race.finalizedAt = new Date();
    await race.save();

    payoutFailures.push(...(await settleRacePredictions(race)));
    await Referee.updateOne({ _id: refereeId }, { $inc: { totalRacesOfficiated: 1 } });
    return payoutFailures;
};

const loadOwnRace = async (id, refereeId) => {
    if (!mongoose.isValidObjectId(id)) return { error: { status: 400, message: 'Invalid race ID' } };
    const race = await Race.findById(id);
    if (!race) return { error: { status: 404, message: 'Race not found' } };
    if (!isOwnRace(race, refereeId)) return { error: { status: 403, message: 'Not your race' } };
    return { race };
};

/**
 * Referee đánh phạt 1 registration trước/trong race (vd: jockey sai vạch
 * xuất phát, ngựa cản đường, doping). timePenaltySec sẽ cộng vào tổng phạt
 * và trừ score khi simulation chạy → ngựa bị phạt dễ tụt hạng.
 *
 * Body: { reason: string, timePenaltySec: number ≥ 0 }
 * Chỉ thêm được khi race chưa Finished.
 */
export const addPenalty = async (req, res) => {
    try {
        const { id, regId } = req.params;
        if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(regId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { reason, timePenaltySec } = req.body;
        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).send({ status: 'Error', message: 'reason là bắt buộc' });
        }
        if (typeof timePenaltySec !== 'number' || timePenaltySec < 0) {
            return res.status(400).send({ status: 'Error', message: 'timePenaltySec phải là số ≥ 0' });
        }

        const { race, error } = await loadOwnRace(id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể thêm phạt' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });

        reg.penalties.push({
            reason: reason.trim(),
            timePenaltySec,
            addedBy: req.user._id,
            addedAt: new Date(),
        });
        await race.save();

        const totalPenaltySec = reg.penalties.reduce((s, p) => s + p.timePenaltySec, 0);
        return res.status(200).send({
            status: 'Success',
            message: `Đã ghi phạt ${timePenaltySec}s — tổng phạt registration này: ${totalPenaltySec}s`,
            data: { penalties: reg.penalties, totalPenaltySec },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Referee xoá 1 penalty đã ghi (vd: ghi nhầm). Race đã Finished không xoá được.
 */
export const removePenalty = async (req, res) => {
    try {
        const { id, regId, penaltyId } = req.params;
        if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(regId) || !mongoose.isValidObjectId(penaltyId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }

        const { race, error } = await loadOwnRace(id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể xoá phạt' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });

        const penalty = reg.penalties.id(penaltyId);
        if (!penalty) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy phạt' });
        penalty.deleteOne();
        await race.save();

        return res.status(200).send({
            status: 'Success',
            message: 'Đã xoá phạt',
            data: { penalties: reg.penalties },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const submitResults = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race already finished' });
        }
        const validationError = validateResults(req.body.results, race);
        if (validationError) return res.status(400).send({ status: 'Error', message: validationError });

        for (const r of req.body.results) race.registrations.id(r.registrationId).finalRank = r.rank;
        const payoutFailures = await finalizeRace(race, req.user._id);

        return res.status(200).send({
            status: 'Success',
            message: payoutFailures.length ? 'Finished with payout failures' : 'Race finalized',
            data: { race, payoutFailures },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Dry-run: compute simulated results without persisting. Lets the referee
// preview and decide whether to auto-finalize or override manually.
export const previewSimulation = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        const results = await simulateRace(race);
        return res.status(200).send({ status: 'Success', message: 'Simulation preview', data: results });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Run simulation, persist its rank as final, and finalize the race.
export const autoFinalize = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race already finished' });
        }
        const results = await simulateRace(race);
        if (results.length === 0) {
            return res.status(400).send({ status: 'Error', message: 'No Approved registrations to simulate' });
        }
        for (const r of results) race.registrations.id(r.registrationId).finalRank = r.rank;
        const payoutFailures = await finalizeRace(race, req.user._id);

        return res.status(200).send({
            status: 'Success',
            message: payoutFailures.length ? 'Auto-finalized with payout failures' : 'Race auto-finalized',
            data: { race, simulation: results, payoutFailures },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
