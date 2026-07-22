import mongoose from 'mongoose';
import Horse from '../models/Horse.js';
import Race from '../models/Race.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import {
    JOCKEY_RESPONSE_DEADLINE_DAYS,
    isPastJockeyDeclineDeadline,
} from '../utils/rideOfferDeadline.js';
import { credit } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';
import { getEffectiveStatus } from '../utils/registrationWindow.js';

const EDITABLE_FIELDS = [
    'fullName', 'phone', 'avatar', 'dateOfBirth', 'gender', 'address',
    'experienceYears', 'weightKg', 'heightCm', 'pricePerRace',
];

/**
 * Jockey nộp yêu cầu cấp license. Chỉ vào hàng đợi admin sau khi gọi
 * endpoint này — tránh việc mọi jockey vừa đăng ký xong đã spam dashboard.
 * Cho phép kèm note + documents (link giấy tờ).
 *
 * Resubmit được nếu admin đã reject trước đó (clear reject reason). Block
 * nếu đã có license rồi.
 */
export const requestLicense = async (req, res) => {
    try {
        const user = req.user;
        if (user.licenseNumber) {
            return res.status(400).send({
                status: 'Error',
                message: `Bạn đã có license (${user.licenseNumber}). Không cần nộp lại.`,
            });
        }
        if (user.licenseRequestedAt && !user.licenseRejectReason) {
            return res.status(400).send({
                status: 'Error',
                message: 'Yêu cầu cấp license của bạn đang chờ admin xét duyệt.',
                data: { licenseRequestedAt: user.licenseRequestedAt },
            });
        }

        const { note, documents } = req.body || {};
        user.licenseRequestedAt = new Date();
        user.licenseRequestNote = typeof note === 'string' ? note.trim() : undefined;
        if (Array.isArray(documents)) {
            user.licenseDocuments = documents.filter((d) => typeof d === 'string' && d.trim());
        }
        // Resubmit sau khi bị reject — xóa lý do cũ để admin biết là yêu cầu mới.
        user.licenseRejectReason = undefined;
        await user.save();

        return res.status(200).send({
            status: 'Success',
            message: 'Đã gửi yêu cầu cấp license. Vui lòng chờ admin xét duyệt.',
            data: {
                licenseRequestedAt: user.licenseRequestedAt,
                licenseRequestNote: user.licenseRequestNote,
                licenseDocuments: user.licenseDocuments,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Trạng thái license của jockey hiện tại. Dùng cho FE hiển thị nút
 * "Yêu cầu cấp license" / "Đang chờ duyệt" / "Đã được cấp" / "Bị từ chối".
 */
export const getLicenseStatus = async (req, res) => {
    try {
        const u = req.user;
        let state;
        if (u.licenseNumber) state = 'Approved';
        else if (u.licenseRejectReason) state = 'Rejected';
        else if (u.licenseRequestedAt) state = 'Pending';
        else state = 'NotRequested';

        return res.status(200).send({
            status: 'Success',
            message: 'Trạng thái license',
            data: {
                state,
                licenseNumber: u.licenseNumber || null,
                licenseRequestedAt: u.licenseRequestedAt || null,
                licenseRequestNote: u.licenseRequestNote || null,
                licenseDocuments: u.licenseDocuments || [],
                licenseRejectReason: u.licenseRejectReason || null,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Jockey gửi kháng án xin gỡ 1 án phạt referee đã ghi. Append vào
 * penalty.appeals[] với status=Pending. Referee thấy trên dashboard
 * GET /api/referee/pending-appeals và quyết định gỡ phạt (Accept) hoặc
 * từ chối (Reject).
 *
 * Cho phép resubmit (nhiều appeal trên cùng 1 penalty) nếu lần trước
 * bị Rejected — thường jockey sẽ bổ sung lý do mới.
 *
 * Body: { reason: string }
 */
export const submitPenaltyAppeal = async (req, res) => {
    try {
        const { raceId, regId, penaltyId } = req.params;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(regId) || !mongoose.isValidObjectId(penaltyId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        const { reason } = req.body || {};
        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).send({ status: 'Error', message: 'reason là bắt buộc — viết lý do kháng án' });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (race.status === 'Finished' || race.status === 'Cancelled') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc, không thể kháng án nữa' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });
        // Chỉ jockey BỊ phạt mới kháng án được — không cho jockey khác gửi giúp.
        if (String(reg.jockey) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Bạn không phải jockey của đăng ký này' });
        }

        const penalty = reg.penalties.id(penaltyId);
        if (!penalty) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy án phạt' });
        if (penalty.status === 'Cancelled') {
            return res.status(400).send({ status: 'Error', message: 'Án phạt đã được gỡ, không cần kháng án' });
        }
        // Block double-pending — jockey phải đợi referee xử lý xong appeal cũ.
        if ((penalty.appeals || []).some((a) => a.status === 'Pending')) {
            return res.status(400).send({
                status: 'Error',
                message: 'Đã có kháng án Pending. Chờ referee xử lý trước khi gửi mới.',
            });
        }

        penalty.appeals.push({
            reason: reason.trim(),
            submittedBy: req.user._id,
            submittedAt: new Date(),
            status: 'Pending',
        });
        await race.save();

        // Notify referee để xử lý.
        await notify(race.referee, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Jockey kháng án — race "${race.name}"`,
            body: `${req.user.fullName} xin gỡ phạt "${penalty.reason}" (${penalty.timePenaltySec}s). Lý do: ${reason.trim()}.`,
            data: { raceId: race._id, registrationId: reg._id, penaltyId: penalty._id, appeal: true },
        });

        return res.status(201).send({
            status: 'Success',
            message: 'Đã gửi kháng án, chờ referee xét duyệt',
            data: { penalty },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Jockey xem list các án phạt + kháng án của chính mình across all races.
 * FE dùng để render trang "Án phạt & Kháng án".
 */
export const listMyPenalties = async (req, res) => {
    try {
        const races = await Race.find({
            'registrations.jockey': req.user._id,
            'registrations.penalties.0': { $exists: true },
        })
            .populate('registrations.horse', 'name')
            .lean();

        const items = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                if (String(reg.jockey) !== String(req.user._id)) continue;
                for (const penalty of (reg.penalties || [])) {
                    items.push({
                        raceId: race._id,
                        raceName: race.name,
                        raceDate: race.raceDate,
                        raceStatus: race.status,
                        registrationId: reg._id,
                        horse: reg.horse,
                        penaltyId: penalty._id,
                        reason: penalty.reason,
                        timePenaltySec: penalty.timePenaltySec,
                        addedAt: penalty.addedAt,
                        status: penalty.status,
                        cancelReason: penalty.cancelReason || null,
                        cancelledAt: penalty.cancelledAt || null,
                        appeals: penalty.appeals || [],
                    });
                }
            }
        }
        // Mới nhất lên đầu
        items.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách án phạt + kháng án của bạn',
            data: items,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) user[f] = req.body[f];
        }
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Cập nhật hồ sơ thành công',
            data: user,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyHorses = async (req, res) => {
    try {
        const horses = await Horse.find({ currentJockey: req.user._id }).sort({ createdAt: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngựa bạn đang cưỡi',
            data: horses,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Chi tiết 1 con ngựa jockey đang cưỡi. Trả về thông tin ngựa, chủ ngựa,
 * race sắp tới mà jockey có đăng ký với con ngựa này, và lịch sử race đã
 * kết thúc kèm thứ hạng. Chặn jockey khác xem ngựa không thuộc về mình.
 */
export const getMyHorseDetail = async (req, res) => {
    try {
        const { horseId } = req.params;
        if (!mongoose.isValidObjectId(horseId)) {
            return res.status(400).send({ status: 'Error', message: 'horseId không hợp lệ' });
        }

        const horse = await Horse.findById(horseId)
            .populate('owner', 'fullName stableName phone email avatar');
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.currentJockey) !== String(req.user._id)) {
            return res.status(403).send({
                status: 'Error',
                message: 'Bạn không phải jockey hiện tại của ngựa này',
            });
        }

        const races = await Race.find({
            registrations: {
                $elemMatch: { horse: horse._id, jockey: req.user._id },
            },
        })
            .sort({ raceDate: -1 })
            .select('name raceDate location distanceM status prizeMoney registrations.$');

        const upcoming = [];
        const history = [];
        let wins = 0;
        let podiums = 0;
        let totalRankedRaces = 0;
        let rankSum = 0;

        for (const race of races) {
            const reg = race.registrations[0];
            if (!reg) continue;
            const item = {
                raceId: race._id,
                raceName: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                approvalStatus: reg.approvalStatus,
                jockeyResponse: reg.jockeyResponse?.status,
                hireFee: reg.hireFee,
                finalRank: reg.finalRank,
            };
            if (race.status === 'Finished') {
                history.push(item);
                if (reg.finalRank) {
                    totalRankedRaces += 1;
                    rankSum += reg.finalRank;
                    if (reg.finalRank === 1) wins += 1;
                    if (reg.finalRank <= 3) podiums += 1;
                }
            } else {
                upcoming.push(item);
            }
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết ngựa bạn đang cưỡi',
            data: {
                horse,
                stats: {
                    totalRaces: history.length,
                    rankedRaces: totalRankedRaces,
                    wins,
                    podiums,
                    averageRank: totalRankedRaces
                        ? Number((rankSum / totalRankedRaces).toFixed(2))
                        : null,
                },
                upcomingRaces: upcoming,
                raceHistory: history,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * List all ride offers (registrations where I'm the jockey) that are still
 * awaiting my decision. We filter by jockeyResponse.status='Pending' AND
 * race.status not Finished/Cancelled so jockeys aren't shown stale offers.
 */
export const listRideOffers = async (req, res) => {
    try {
        const races = await Race.find({
            'registrations.jockey': req.user._id,
            status: { $in: ['Draft', 'Open', 'Locked'] },
            // Bỏ qua race có raceDate đã trôi qua — chúng không thực tế để
            // jockey vẫn phản hồi (lẽ ra referee đã finalize hoặc cancel rồi).
            raceDate: { $gte: new Date() },
        })
            .populate('registrations.horse', 'name registrationNumber')
            .populate('registrations.owner', 'fullName stableName');
        // Flatten into individual offers for the jockey's UX
        const offers = [];
        for (const race of races) {
            for (const reg of race.registrations) {
                if (String(reg.jockey) !== String(req.user._id)) continue;
                if (reg.jockeyResponse?.status !== 'Pending') continue;
                offers.push({
                    raceId: race._id,
                    raceName: race.name,
                    raceDate: race.raceDate,
                    registrationId: reg._id,
                    horse: reg.horse,
                    owner: reg.owner,
                    hireFee: reg.hireFee,
                });
            }
        }
        return res.status(200).send({
            status: 'Success',
            message: 'Lời mời cưỡi đang chờ phản hồi',
            data: offers,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * GET /api/jockey/races — LỊCH ĐUA của jockey.
 * Mọi giải jockey này có đăng ký (chính mình cưỡi), nhóm sẵn theo timeline:
 *   - upcoming   : chưa tới giờ đua (Draft/Open/Locked, raceDate > now) — sắp đua
 *   - inProgress : ĐANG đua / chờ chấm (Ranked, hoặc raceDate đã tới mà chưa Finished)
 *   - finished   : ĐÃ đua xong (Finished) — kèm finalRank + finishTimeSec
 *   - cancelled  : giải bị huỷ
 * Truyền ?status=Open|Locked|Ranked|Finished|Cancelled để lấy mảng phẳng lọc theo status.
 */
export const listMyRaces = async (req, res) => {
    try {
        const { status } = req.query;
        if (status) {
            const allowed = ['Draft', 'Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'];
            if (!allowed.includes(status)) {
                return res.status(400).send({ status: 'Error', message: `status phải thuộc: ${allowed.join(', ')}` });
            }
        }

        const races = await Race.find({ 'registrations.jockey': req.user._id })
            .sort({ raceDate: -1 })
            .populate('registrations.horse', 'name registrationNumber breed')
            .populate('registrations.owner', 'fullName stableName')
            .lean();

        const now = Date.now();
        const myId = String(req.user._id);
        const buckets = { upcoming: [], inProgress: [], finished: [], cancelled: [] };
        const flat = [];
        for (const race of races) {
            const myReg = race.registrations.find((r) => String(r.jockey) === myId);
            if (!myReg) continue;
            const effectiveStatus = getEffectiveStatus(race, new Date(now));
            const item = {
                raceId: race._id,
                raceName: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: effectiveStatus,
                horse: myReg.horse,
                owner: myReg.owner,
                hireFee: myReg.hireFee,
                jockeyBonusPercent: myReg.jockeyBonusPercent,
                approvalStatus: myReg.approvalStatus,
                jockeyResponse: myReg.jockeyResponse?.status || 'Pending',
                finalRank: myReg.finalRank ?? null,
                finishTimeSec: myReg.finishTimeSec ?? null,
                penalties: myReg.penalties || [],
            };

            if (status) {
                if (effectiveStatus === status) flat.push(item);
                continue;
            }
            const raceTime = new Date(race.raceDate).getTime();
            if (effectiveStatus === 'Cancelled') buckets.cancelled.push(item);
            else if (effectiveStatus === 'Finished') buckets.finished.push(item);
            else if (effectiveStatus === 'Ranked' || raceTime <= now) buckets.inProgress.push(item);
            else buckets.upcoming.push(item);
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Lịch đua của jockey',
            data: status
                ? flat
                : {
                    counts: {
                        upcoming: buckets.upcoming.length,
                        inProgress: buckets.inProgress.length,
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

/**
 * Jockey accepts or rejects a single ride offer (one registration on a race).
 * Refuses if (a) it's not addressed to me, or (b) I already responded — no
 * flip-flopping after a decision.
 */
export const respondToRideOffer = async (req, res) => {
    try {
        const { raceId, regId } = req.params;
        const { action, reason } = req.body;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(regId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'accept' hoặc 'decline'" });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        if (race.status === 'Finished' || race.status === 'Cancelled') {
            return res.status(400).send({ status: 'Error', message: 'Race đã kết thúc/huỷ' });
        }

        const reg = race.registrations.id(regId);
        if (!reg) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy đăng ký' });
        if (String(reg.jockey) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Lời mời không gửi cho bạn' });
        }
        if (reg.jockeyResponse.status !== 'Pending') {
            return res.status(400).send({
                status: 'Error',
                message: `Bạn đã ${reg.jockeyResponse.status === 'Accepted' ? 'đồng ý' : 'từ chối'} rồi`,
            });
        }

        // Quá hạn từ chối: race còn quá ít ngày — jockey không được decline nữa
        // để tránh việc owner trở tay không kịp tìm jockey thay thế.
        if (action === 'decline' && isPastJockeyDeclineDeadline(race)) {
            return res.status(400).send({
                status: 'Error',
                message: `Đã quá thời hạn từ chối (chỉ được từ chối trước race ít nhất ${JOCKEY_RESPONSE_DEADLINE_DAYS} ngày). Bạn buộc phải đua.`,
            });
        }

        reg.jockeyResponse.status = action === 'accept' ? 'Accepted' : 'Declined';
        reg.jockeyResponse.respondedAt = new Date();
        if (action === 'decline') reg.jockeyResponse.declineReason = reason || 'Không nêu lý do';

        // Khi jockey từ chối: hoàn lại entry fee cho owner + rollback prize pool
        // (nếu addEntryFeeToPrize=true trước đó), rồi xoá registration khỏi race.
        // Lý do: owner không có lỗi — jockey từ chối nên owner phải có cơ hội
        // tìm jockey khác và đăng ký lại race nếu muốn.
        const ownerId = reg.owner;
        const horseId = reg.horse;
        const refundAmount = action === 'decline' ? (reg.entryFeePaid || 0) : 0;
        const declineReasonForNotify = reg.jockeyResponse.declineReason;

        if (action === 'decline') {
            if (refundAmount > 0) {
                await credit(ownerId, refundAmount, {
                    type: WALLET_TX_TYPES.REFUND,
                    reference: String(race._id),
                    description: `Hoàn phí tham gia race "${race.name}" do jockey từ chối`,
                });
                if (race.addEntryFeeToPrize) {
                    race.prizeMoney = Math.max(0, (race.prizeMoney || 0) - refundAmount);
                }
            }
            reg.deleteOne();

            // Bug fix: nếu horse.currentJockey đang chính là jockey này, gỡ ra
            // để owner không tự động thuê lại jockey vừa từ chối khi đăng ký
            // race khác. Owner sẽ phải chủ động gán jockey mới qua assignJockey.
            const horse = await Horse.findById(horseId);
            if (horse && String(horse.currentJockey) === String(req.user._id)) {
                horse.currentJockey = undefined;
                await horse.save();
            }
        }

        await race.save();

        if (action === 'accept') {
            await notify(ownerId, {
                type: NOTIFICATION_TYPES.JOCKEY_HIRED,
                title: `Jockey đồng ý cưỡi race "${race.name}"`,
                body: `${req.user.fullName} đã nhận lời.`,
                data: { raceId: race._id, registrationId: reg._id, action },
            });
        } else {
            await notify(ownerId, {
                type: NOTIFICATION_TYPES.JOCKEY_HIRED,
                title: `Jockey từ chối race "${race.name}"`,
                body: refundAmount > 0
                    ? `${req.user.fullName} từ chối (lý do: ${declineReasonForNotify}). Đã hoàn ${refundAmount.toLocaleString('vi-VN')} VND phí tham gia về ví của bạn.`
                    : `${req.user.fullName} từ chối (lý do: ${declineReasonForNotify}).`,
                data: {
                    raceId: race._id,
                    horseId,
                    action,
                    declineReason: declineReasonForNotify,
                    refunded: refundAmount,
                },
            });
        }

        return res.status(200).send({
            status: 'Success',
            message: action === 'accept'
                ? 'Đã đồng ý cưỡi'
                : `Đã từ chối. Owner đã được hoàn ${refundAmount.toLocaleString('vi-VN')} VND phí tham gia.`,
            data: {
                action,
                refundedToOwner: refundAmount,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
