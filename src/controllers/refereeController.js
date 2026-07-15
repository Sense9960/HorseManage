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
import { effectiveJockeyResponse } from '../utils/rideOfferDeadline.js';

const formatVnd = (n) => `${n.toLocaleString('vi-VN')} VND`;

const isOwnRace = (race, refereeId) => String(race.referee) === String(refereeId);

// Chuẩn hoá ô ảnh biên bản (tùy chọn) referee đính khi chấm/chốt kết quả.
// Trả về mảng URL sạch, HOẶC undefined nếu input không phải mảng có ≥1 URL hợp
// lệ — controller sẽ bỏ qua (không gán) trong trường hợp undefined, nên KHÔNG
// truyền / truyền mảng rỗng = giữ nguyên ảnh cũ, không cho xoá qua field này.
const PROOF_IMG_MAX = 10;
const PROOF_URL_MAXLEN = 2000;
const sanitizeProofImages = (input) => {
    if (!Array.isArray(input)) return undefined;
    const urls = input
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && u.length <= PROOF_URL_MAXLEN)
        .slice(0, PROOF_IMG_MAX);
    return urls.length ? urls : undefined;
};

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

/**
 * Race của referee, có filter ?status= và nhóm sẵn theo timeline để FE
 * dashboard render trực tiếp 3 cột: "Sắp bắt / Đang bắt / Đã đua xong".
 *
 * Buckets:
 *   - upcoming:  raceDate >= now AND status in (Draft, Open, Locked)
 *   - inProgress: status in (Open, Locked) AND raceDate < now (đã tới giờ
 *                 nhưng referee chưa finalize)
 *   - finished:  status = Finished
 *   - cancelled: status = Cancelled
 */
export const listMyRaces = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = { referee: req.user._id };
        if (status) {
            const allowed = ['Draft', 'Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'];
            if (!allowed.includes(status)) {
                return res.status(400).send({
                    status: 'Error',
                    message: `status phải thuộc: ${allowed.join(', ')}`,
                });
            }
            filter.status = status;
        }

        // Lazy sweep: auto-confirm mọi race provisional đã quá 3h của referee này
        // trước khi build danh sách, để trạng thái luôn tươi mà không cần cron.
        const expiredCutoff = new Date(Date.now() - RESULTS_CONFIRM_WINDOW_MIN * 60000);
        const expired = await Race.find({
            referee: req.user._id,
            status: 'Ranked',
            resultsSubmittedAt: { $ne: null, $lte: expiredCutoff },
        });
        for (const r of expired) await autoConfirmIfExpired(r);

        const races = await Race.find(filter)
            .sort({ raceDate: -1 })
            .populate('registrations.horse', 'name registrationNumber breed')
            .populate('registrations.jockey', 'fullName licenseNumber')
            .populate('registrations.owner', 'fullName stableName')
            .lean();

        const now = Date.now();
        const buckets = { upcoming: [], inProgress: [], ranked: [], finished: [], cancelled: [] };
        const summary = (race) => ({
            _id: race._id,
            name: race.name,
            raceDate: race.raceDate,
            location: race.location,
            distanceM: race.distanceM,
            status: race.status,
            prizeMoney: race.prizeMoney,
            entryFee: race.entryFee,
            participantCount: race.registrations.length,
            approvedCount: race.registrations.filter((r) => r.approvalStatus === 'Approved').length,
            pendingApprovalCount: race.registrations.filter((r) => r.approvalStatus === 'Pending').length,
            registrations: race.registrations.map((r) => ({
                _id: r._id,
                horse: r.horse,
                jockey: r.jockey,
                owner: r.owner,
                approvalStatus: r.approvalStatus,
                jockeyResponse: r.jockeyResponse?.status,
                finalRank: r.finalRank,
                finishTimeSec: r.finishTimeSec ?? null,
                penalties: r.penalties || [],
            })),
        });

        for (const race of races) {
            const item = summary(race);
            const raceTime = new Date(race.raceDate).getTime();
            if (race.status === 'Cancelled') buckets.cancelled.push(item);
            else if (race.status === 'Finished') buckets.finished.push(item);
            else if (race.status === 'Ranked') buckets.ranked.push(item);
            else if (raceTime < now) buckets.inProgress.push(item);
            else buckets.upcoming.push(item);
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách race được phân công',
            data: status
                ? races.map(summary)
                : {
                    counts: {
                        upcoming: buckets.upcoming.length,
                        inProgress: buckets.inProgress.length,
                        ranked: buckets.ranked.length,
                        finished: buckets.finished.length,
                        cancelled: buckets.cancelled.length,
                    },
                    ...buckets,
                },
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
        // Lazy auto-confirm nếu kết quả tạm đã quá 3h.
        await autoConfirmIfExpired(race);
        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết race',
            data: {
                ...race.toObject(),
                resultsProvisional: race.status === 'Ranked',
                autoConfirmAt: race.resultsSubmittedAt
                    ? new Date(new Date(race.resultsSubmittedAt).getTime() + RESULTS_CONFIRM_WINDOW_MIN * 60000)
                    : null,
            },
        });
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
        if (!['approve', 'reject', 'ban'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'approve' / 'reject' / 'ban'" });
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
        } else if (action === 'reject') {
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
                    console.error('Refund entry fee failed on reject:', e.message);
                }
            }
        } else {
            // BAN: kỷ luật nặng — registration không được tham gia và KHÔNG hoàn fee.
            // Khác Reject (admin từ chối tham gia → hoàn tiền) ở chỗ Ban là vi phạm
            // luật (doping, gian lận) → tiền entry fee không được refund.
            reg.approvalStatus = 'Banned';
            reg.rejectReason = reason || 'Vi phạm luật giải';
        }

        await race.save();

        const notifyTitle = {
            approve: `Đã duyệt đăng ký race "${race.name}"`,
            reject: `Bị từ chối đăng ký race "${race.name}"`,
            ban: `Bị BANNED khỏi race "${race.name}"`,
        }[action];
        const notifyBody = {
            approve: 'Ngựa của bạn đã được duyệt tham gia.',
            reject: `Lý do: ${reg.rejectReason}. Entry fee đã được hoàn.`,
            ban: `Lý do: ${reg.rejectReason}. Entry fee KHÔNG được hoàn vì vi phạm.`,
        }[action];
        await notify(reg.owner, {
            type: action === 'approve' ? NOTIFICATION_TYPES.REGISTRATION_APPROVED : NOTIFICATION_TYPES.REGISTRATION_REJECTED,
            title: notifyTitle,
            body: notifyBody,
            data: { raceId: race._id, registrationId: reg._id, action },
        });

        const successMsg = {
            approve: 'Đã duyệt jockey',
            reject: 'Đã từ chối jockey',
            ban: 'Đã BANNED registration — không hoàn entry fee',
        }[action];
        return res.status(200).send({ status: 'Success', message: successMsg, data: reg });
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
// Referee KHÔNG gửi rank — backend tự xếp từ effective time (finishTimeSec +
// tổng phạt Active). Ngựa bị phạt mà thời gian sau phạt chậm hơn con dưới thì
// tự tụt hạng. Field `rank` client gửi lên (nếu có) bị bỏ qua.
const validateResults = (results, race) => {
    if (!Array.isArray(results) || results.length === 0) return 'results là mảng bắt buộc';
    const seenRegs = new Set();
    for (const r of results) {
        if (!mongoose.isValidObjectId(r.registrationId)) {
            return 'Mỗi item cần registrationId hợp lệ';
        }
        if (seenRegs.has(String(r.registrationId))) {
            return `registrationId ${r.registrationId} bị trùng trong results`;
        }
        seenRegs.add(String(r.registrationId));
        // Bắt buộc finishTimeSec — rank được suy ra từ thời gian, không có thời
        // gian thì không có căn cứ xếp hạng khi tranh chấp.
        if (typeof r.finishTimeSec !== 'number' || !Number.isFinite(r.finishTimeSec) || r.finishTimeSec <= 0) {
            return `finishTimeSec là bắt buộc cho mọi ngựa và phải > 0 (registrationId ${r.registrationId})`;
        }
        // Phạt thêm khi chốt kết quả (vd: jockey sai vạch xuất phát phát hiện sau).
        // BẮT BUỘC kèm reason để có audit, không cho referee phạt "khan".
        if (r.penalty !== undefined) {
            if (typeof r.penalty !== 'object' || r.penalty === null) {
                return 'penalty phải là object { reason, timePenaltySec }';
            }
            if (!r.penalty.reason || typeof r.penalty.reason !== 'string' || !r.penalty.reason.trim()) {
                return 'penalty.reason là bắt buộc khi ghi phạt';
            }
            if (typeof r.penalty.timePenaltySec !== 'number' || r.penalty.timePenaltySec < 0) {
                return 'penalty.timePenaltySec phải là số ≥ 0';
            }
        }
        const reg = race.registrations.id(r.registrationId);
        if (!reg) return `Không tìm thấy registration ${r.registrationId}`;
        if (reg.approvalStatus !== 'Approved') return 'Chỉ có thể xếp rank cho đăng ký đã Approved';
    }

    // Phải chấm ĐỦ mọi registration Approved — thiếu 1 con là bảng rank lệch.
    const approvedIds = race.registrations
        .filter((reg) => reg.approvalStatus === 'Approved')
        .map((reg) => String(reg._id));
    const missing = approvedIds.filter((id) => !seenRegs.has(id));
    if (missing.length > 0) {
        return `Thiếu kết quả cho ${missing.length} registration Approved: ${missing.join(', ')}`;
    }
    return null;
};

/** Update Horse + Jockey aggregate stats based on a finished registration. */
const updateRunnerStats = async (reg) => {
    const horse = await Horse.findById(reg.horse);
    if (horse) {
        horse.totalRaces = (horse.totalRaces || 0) + 1;
        if (reg.finalRank === 1) horse.totalWins = (horse.totalWins || 0) + 1;
        // Tăng rank distribution để FE hiển thị podium history (vd: "5 hạng 1, 3 hạng 2").
        if (!horse.rankCounts) horse.rankCounts = { rank1: 0, rank2: 0, rank3: 0, others: 0 };
        if (reg.finalRank === 1) horse.rankCounts.rank1 = (horse.rankCounts.rank1 || 0) + 1;
        else if (reg.finalRank === 2) horse.rankCounts.rank2 = (horse.rankCounts.rank2 || 0) + 1;
        else if (reg.finalRank === 3) horse.rankCounts.rank3 = (horse.rankCounts.rank3 || 0) + 1;
        else horse.rankCounts.others = (horse.rankCounts.others || 0) + 1;
        await horse.save();
    }
    const jockey = await Jockey.findById(reg.jockey);
    if (jockey) {
        jockey.totalRaces = (jockey.totalRaces || 0) + 1;
        if (reg.finalRank === 1) jockey.totalWins = (jockey.totalWins || 0) + 1;
        if (!jockey.rankCounts) jockey.rankCounts = { rank1: 0, rank2: 0, rank3: 0, others: 0 };
        if (reg.finalRank === 1) jockey.rankCounts.rank1 = (jockey.rankCounts.rank1 || 0) + 1;
        else if (reg.finalRank === 2) jockey.rankCounts.rank2 = (jockey.rankCounts.rank2 || 0) + 1;
        else if (reg.finalRank === 3) jockey.rankCounts.rank3 = (jockey.rankCounts.rank3 || 0) + 1;
        else jockey.rankCounts.others = (jockey.rankCounts.others || 0) + 1;
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
 * Referee gỡ 1 penalty đã ghi — SOFT CANCEL (không xoá hẳn) để giữ audit
 * trail. Penalty status đổi Active → Cancelled, lưu cancelReason + ai gỡ +
 * thời điểm. Simulation + ranking sẽ bỏ qua penalty Cancelled.
 *
 * Dùng cho 2 case:
 *   - Referee ghi nhầm
 *   - Jockey kháng án thành công
 *
 * Body: { cancelReason: string }
 */
export const cancelPenalty = async (req, res) => {
    try {
        const { id, regId, penaltyId } = req.params;
        if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(regId) || !mongoose.isValidObjectId(penaltyId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { cancelReason } = req.body || {};
        if (!cancelReason || typeof cancelReason !== 'string' || !cancelReason.trim()) {
            return res.status(400).send({ status: 'Error', message: 'cancelReason là bắt buộc (lý do gỡ phạt để audit)' });
        }

        const { race, error } = await loadOwnRace(id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể gỡ phạt' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });

        const penalty = reg.penalties.id(penaltyId);
        if (!penalty) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy phạt' });
        if (penalty.status === 'Cancelled') {
            return res.status(400).send({ status: 'Error', message: 'Penalty đã bị gỡ trước đó' });
        }

        penalty.status = 'Cancelled';
        penalty.cancelReason = cancelReason.trim();
        penalty.cancelledBy = req.user._id;
        penalty.cancelledAt = new Date();

        // Tự động Accept appeal mới nhất (Pending) nếu có — referee gỡ phạt =
        // chấp nhận lý do của jockey. Nếu jockey không gửi appeal mà referee
        // tự gỡ (vd: ghi nhầm) thì không có appeal nào để update.
        const pendingAppeal = (penalty.appeals || []).find((a) => a.status === 'Pending');
        if (pendingAppeal) {
            pendingAppeal.status = 'Accepted';
            pendingAppeal.decidedBy = req.user._id;
            pendingAppeal.decidedAt = new Date();
            pendingAppeal.decisionNote = cancelReason.trim();
        }

        await race.save();

        // Notify jockey để biết phạt đã được gỡ.
        await notify(reg.jockey, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Án phạt được gỡ — race "${race.name}"`,
            body: `Referee đã gỡ án phạt "${penalty.reason}" (${penalty.timePenaltySec}s). Lý do: ${cancelReason.trim()}.`,
            data: { raceId: race._id, registrationId: reg._id, penaltyId: penalty._id, cancelled: true },
        });

        return res.status(200).send({
            status: 'Success',
            message: `Đã gỡ phạt ${penalty.timePenaltySec}s`,
            data: { penalty, penalties: reg.penalties },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Referee từ chối kháng án của jockey (không gỡ phạt, chỉ ghi lý do reject).
 * Penalty vẫn giữ Active, appeal status Pending → Rejected.
 *
 * Body: { decisionNote: string }
 */
export const rejectAppeal = async (req, res) => {
    try {
        const { id, regId, penaltyId, appealId } = req.params;
        if ([id, regId, penaltyId, appealId].some((x) => !mongoose.isValidObjectId(x))) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { decisionNote } = req.body || {};
        if (!decisionNote || typeof decisionNote !== 'string' || !decisionNote.trim()) {
            return res.status(400).send({ status: 'Error', message: 'decisionNote là bắt buộc' });
        }

        const { race, error } = await loadOwnRace(id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });
        const penalty = reg.penalties.id(penaltyId);
        if (!penalty) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy phạt' });
        const appeal = penalty.appeals.id(appealId);
        if (!appeal) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy kháng án' });
        if (appeal.status !== 'Pending') {
            return res.status(400).send({ status: 'Error', message: `Kháng án đã ${appeal.status}` });
        }

        appeal.status = 'Rejected';
        appeal.decidedBy = req.user._id;
        appeal.decidedAt = new Date();
        appeal.decisionNote = decisionNote.trim();
        await race.save();

        await notify(reg.jockey, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Kháng án bị từ chối — race "${race.name}"`,
            body: `Lý do: ${decisionNote.trim()}. Án phạt "${penalty.reason}" vẫn còn hiệu lực.`,
            data: { raceId: race._id, registrationId: reg._id, penaltyId, appealId },
        });

        return res.status(200).send({
            status: 'Success',
            message: 'Đã từ chối kháng án',
            data: { appeal, penalty },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Referee xem list tất cả kháng án Pending trên các race của mình. Flat list
 * cho dashboard "Cần xử lý" — referee thấy ngay penalty nào jockey đang xin gỡ.
 */
export const listPendingAppeals = async (req, res) => {
    try {
        const races = await Race.find({
            referee: req.user._id,
            status: { $in: ['Draft', 'Open', 'Locked'] },
            'registrations.penalties.appeals.status': 'Pending',
        })
            .populate('registrations.horse', 'name')
            .populate('registrations.jockey', 'fullName avatar')
            .populate('registrations.owner', 'fullName stableName')
            .lean();

        const items = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                for (const penalty of (reg.penalties || [])) {
                    for (const appeal of (penalty.appeals || [])) {
                        if (appeal.status !== 'Pending') continue;
                        items.push({
                            raceId: race._id,
                            raceName: race.name,
                            raceDate: race.raceDate,
                            registrationId: reg._id,
                            horse: reg.horse,
                            jockey: reg.jockey,
                            owner: reg.owner,
                            penaltyId: penalty._id,
                            penaltyReason: penalty.reason,
                            penaltyTimeSec: penalty.timePenaltySec,
                            penaltyAddedAt: penalty.addedAt,
                            appealId: appeal._id,
                            appealReason: appeal.reason,
                            appealSubmittedAt: appeal.submittedAt,
                        });
                    }
                }
            }
        }

        // Cũ nhất lên đầu — referee xử lý FIFO.
        items.sort((a, b) => new Date(a.appealSubmittedAt) - new Date(b.appealSubmittedAt));

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách kháng án chờ xử lý',
            data: items,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Cửa sổ referee được sửa kết quả sau khi chấm lần đầu (phút). Hết cửa sổ này
// mà referee chưa confirm → tự động confirm + payout.
const RESULTS_CONFIRM_WINDOW_MIN = 180;

// Ghi finishTimeSec + penalty rồi TỰ TÍNH finalRank theo effective time
// (finishTimeSec + tổng phạt Active). Ngựa về nhanh nhưng bị phạt nặng sẽ
// tự tụt hạng — referee không nhập rank tay. KHÔNG payout, KHÔNG đổi status.
// Trả về bảng computedRanks để response cho referee thấy penalty tác động ra sao.
const applyResultsToRace = (race, results, refereeId) => {
    // Pass 1: ghi thời gian + phạt mới vào từng registration.
    for (const r of results) {
        const reg = race.registrations.id(r.registrationId);
        reg.finishTimeSec = r.finishTimeSec;
        if (r.penalty) {
            reg.penalties.push({
                reason: r.penalty.reason.trim(),
                timePenaltySec: r.penalty.timePenaltySec,
                addedBy: refereeId,
                addedAt: new Date(),
            });
        }
    }
    // Pass 2: tính effective time (sau khi penalty mới đã nằm trong reg.penalties)
    // rồi sort tăng dần → gán rank 1..N. Tie: giữ thứ tự gửi lên (stable sort).
    const rows = results.map((r) => {
        const reg = race.registrations.id(r.registrationId);
        const totalPenaltySec = (reg.penalties || [])
            .filter((p) => p.status !== 'Cancelled')
            .reduce((s, p) => s + (p.timePenaltySec || 0), 0);
        return {
            registrationId: reg._id,
            finishTimeSec: reg.finishTimeSec,
            totalPenaltySec,
            effectiveTimeSec: Math.round((reg.finishTimeSec + totalPenaltySec) * 100) / 100,
        };
    });
    rows.sort((a, b) => a.effectiveTimeSec - b.effectiveTimeSec);
    rows.forEach((row, i) => {
        row.finalRank = i + 1;
        race.registrations.id(row.registrationId).finalRank = i + 1;
    });
    return rows;
};

// Race đã quá 3h kể từ khi chấm mà chưa confirm?
const isConfirmWindowExpired = (race, now = Date.now()) =>
    race.resultsSubmittedAt &&
    race.status === 'Ranked' &&
    (now - new Date(race.resultsSubmittedAt).getTime()) / 60000 >= RESULTS_CONFIRM_WINDOW_MIN;

/**
 * Tự động confirm + payout nếu race có kết quả provisional đã quá 3h. Gọi lazy
 * từ các endpoint đọc race (getRace, listMyRaces) để không cần cron. Trả về
 * true nếu vừa auto-finalize.
 */
export const autoConfirmIfExpired = async (race) => {
    if (!isConfirmWindowExpired(race)) return false;
    const hasRanks = race.registrations.some((r) => r.finalRank);
    if (!hasRanks) return false;
    await finalizeRace(race, race.referee);
    return true;
};

/**
 * Referee chấm kết quả (provisional). Race GIỮ trạng thái Locked — chưa payout.
 * Referee có 3 tiếng để sửa (editResults) hoặc confirm (confirmResults). Sau 3h
 * hệ thống tự confirm. Gọi lại được nhiều lần khi vẫn trong cửa sổ (overwrite).
 */
export const submitResults = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race đã xác nhận kết quả, không chấm lại được' });
        }
        if (race.status !== 'Locked' && race.status !== 'Ranked') {
            return res.status(400).send({ status: 'Error', message: 'Chỉ chấm được race đang Locked (đã bắt đầu đua) hoặc Ranked (chấm lại trong cửa sổ)' });
        }
        // Nếu đã chấm trước đó và quá 3h → tự confirm rồi, không cho ghi đè.
        if (isConfirmWindowExpired(race)) {
            await autoConfirmIfExpired(race);
            return res.status(400).send({ status: 'Error', message: 'Đã quá 3 tiếng — kết quả tự xác nhận, không sửa được nữa' });
        }
        const validationError = validateResults(req.body.results, race);
        if (validationError) return res.status(400).send({ status: 'Error', message: validationError });

        const computedRanks = applyResultsToRace(race, req.body.results, req.user._id);
        // Chấm từ Locked = lần chấm ĐẦU của phiên này → đặt mốc cửa sổ 3h mới
        // (xoá mốc rác nếu race từng được chấm theo flow cũ). Resubmit khi đang
        // Ranked thì GIỮ mốc — không cho reset timer để né auto-confirm.
        if (race.status === 'Locked' || !race.resultsSubmittedAt) {
            race.resultsSubmittedAt = new Date();
        }
        // Ảnh biên bản (tùy chọn) — chỉ ghi đè khi có ≥1 URL hợp lệ.
        const proofImgs = sanitizeProofImages(req.body.resultProofImages);
        if (proofImgs) race.resultProofImages = proofImgs;
        // Chấm xong → Ranked (đã có bảng xếp hạng tạm). Confirm/3h mới Finished.
        race.status = 'Ranked';
        await race.save();

        const deadline = new Date(new Date(race.resultsSubmittedAt).getTime() + RESULTS_CONFIRM_WINDOW_MIN * 60000);
        return res.status(200).send({
            status: 'Success',
            message: 'Đã chấm kết quả — race chuyển sang Ranked (bảng xếp hạng tạm). Bấm xác nhận hoặc tự xác nhận sau 3 tiếng.',
            data: {
                race,
                computedRanks,
                provisional: true,
                resultsSubmittedAt: race.resultsSubmittedAt,
                autoConfirmAt: deadline,
                canEditUntil: deadline,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Referee bấm XÁC NHẬN kết quả → finalize ngay: payout + status Finished.
 * Sau bước này không sửa được nữa (chỉ admin override).
 */
export const confirmResults = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Kết quả đã được xác nhận trước đó' });
        }
        if (race.status !== 'Ranked') {
            return res.status(400).send({ status: 'Error', message: 'Race chưa ở trạng thái Ranked — chấm kết quả trước khi xác nhận.' });
        }
        const hasRanks = race.registrations.some((r) => r.finalRank);
        if (!hasRanks) {
            return res.status(400).send({ status: 'Error', message: 'Chưa có finalRank nào để xác nhận' });
        }
        // Ảnh biên bản (tùy chọn) — gán trước finalizeRace vì hàm đó tự race.save().
        const proofImgs = sanitizeProofImages(req.body.resultProofImages);
        if (proofImgs) race.resultProofImages = proofImgs;
        const payoutFailures = await finalizeRace(race, req.user._id);
        return res.status(200).send({
            status: 'Success',
            message: payoutFailures.length ? 'Đã xác nhận (có lỗi payout)' : 'Đã xác nhận kết quả — race Finished, đã chia thưởng',
            data: { race, payoutFailures },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Dry-run: compute simulated results without persisting. Lets the referee
// preview and decide whether to auto-finalize or override manually.
/**
 * Referee sửa kết quả TẠM (provisional) trong cửa sổ 3 tiếng kể từ lần chấm
 * đầu. Race vẫn Locked, chưa payout — sửa thoải mái. Hết 3h hoặc đã confirm
 * thì không sửa được (chỉ admin override qua /api/admin/races/:id/results).
 */
export const editResults = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        if (race.status === 'Finished') {
            return res.status(403).send({ status: 'Error', message: 'Kết quả đã xác nhận, không sửa được. Liên hệ admin nếu cần override.' });
        }
        if (race.status !== 'Ranked') {
            return res.status(400).send({ status: 'Error', message: 'Race chưa ở trạng thái Ranked — dùng submitResults để chấm trước.' });
        }
        if (isConfirmWindowExpired(race)) {
            await autoConfirmIfExpired(race);
            return res.status(403).send({ status: 'Error', message: 'Đã quá 3 tiếng — kết quả tự xác nhận, không sửa được nữa.' });
        }

        const validationError = validateResults(req.body.results, race);
        if (validationError) return res.status(400).send({ status: 'Error', message: validationError });

        const computedRanks = applyResultsToRace(race, req.body.results, req.user._id);
        const proofImgs = sanitizeProofImages(req.body.resultProofImages);
        if (proofImgs) race.resultProofImages = proofImgs;
        await race.save();

        const deadline = new Date(new Date(race.resultsSubmittedAt).getTime() + RESULTS_CONFIRM_WINDOW_MIN * 60000);
        return res.status(200).send({
            status: 'Success',
            message: 'Đã cập nhật kết quả — rank tự xếp lại theo thời gian sau phạt. Race vẫn Ranked.',
            data: { race, computedRanks, provisional: true, autoConfirmAt: deadline, canEditUntil: deadline },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Simulation preview — KHÔNG persist. Lúc nào cũng "test only".
 * Đây là endpoint kiểu Konami: chạy thử race trên giao diện game, không tốn
 * tiền thật. Response luôn có cờ isTest=true để FE biết rõ.
 */
export const previewSimulation = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });
        const results = await simulateRace(race);
        return res.status(200).send({
            status: 'Success',
            message: '[TEST] Simulation preview — không persist, không payout',
            data: {
                isTest: true,
                raceId: race._id,
                raceName: race.name,
                results,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Run simulation. Mặc định persist + payout (đua thật). Nếu body/query có
 * testMode=true thì CHỈ trả kết quả tính được, KHÔNG lưu finalRank, KHÔNG
 * chạy payout, KHÔNG cập nhật stats — dùng để dev/admin test với data thật
 * trước khi quyết định finalize. Response kèm cờ isTest để FE hiển thị
 * watermark "ĐANG CHẠY TEST" trên kết quả.
 */
export const autoFinalize = async (req, res) => {
    try {
        const { race, error } = await loadOwnRace(req.params.id, req.user._id);
        if (error) return res.status(error.status).send({ status: 'Error', message: error.message });

        const testMode = req.body?.testMode === true || req.query?.testMode === 'true';

        if (!testMode && race.status === 'Finished') {
            return res.status(400).send({ status: 'Error', message: 'Race already finished' });
        }
        const results = await simulateRace(race);
        if (results.length === 0) {
            return res.status(400).send({ status: 'Error', message: 'No Approved registrations to simulate' });
        }

        if (testMode) {
            // KHÔNG đụng vào race, KHÔNG payout — chỉ tính rank trên data hiện tại.
            return res.status(200).send({
                status: 'Success',
                message: '[TEST] Mô phỏng đã chạy — kết quả không được lưu',
                data: {
                    isTest: true,
                    raceId: race._id,
                    raceName: race.name,
                    simulation: results,
                    note: 'Bỏ testMode=true để chạy đua thật và payout.',
                },
            });
        }

        for (const r of results) {
            const reg = race.registrations.id(r.registrationId);
            reg.finalRank = r.rank;
            // Auto-sim không có thời gian thật → estimate từ distance + score
            // (score cao = đua nhanh hơn ~). Just-for-display, không bám thực tế.
            if (race.distanceM && r.score) {
                const baseSpeedMs = 16;   // ~58km/h base
                const speedAdj = (r.score - 50) * 0.05;
                const estSec = race.distanceM / (baseSpeedMs + speedAdj);
                reg.finishTimeSec = Math.max(60, Math.round(estSec * 100) / 100);
            }
        }
        const payoutFailures = await finalizeRace(race, req.user._id);

        return res.status(200).send({
            status: 'Success',
            message: payoutFailures.length ? 'Auto-finalized with payout failures' : 'Race auto-finalized',
            data: { isTest: false, race, simulation: results, payoutFailures },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
