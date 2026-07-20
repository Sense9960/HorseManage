import mongoose from 'mongoose';
import Horse from '../models/Horse.js';
import Race, { MAX_HORSES_PER_RACE } from '../models/Race.js';
import { User, Jockey, ROLES } from '../models/User.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import { credit, debit, getOrCreateWallet } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';
import { calculatePrizeBreakdown } from '../utils/prizeBreakdown.js';
import { applyEffectiveStatus, getEffectiveStatus } from '../utils/registrationWindow.js';

const JOCKEY_PUBLIC_FIELDS = 'fullName avatar licenseNumber experienceYears weightKg heightCm totalRaces totalWins rating pricePerRace status';

const HORSE_FIELDS = [
    'name', 'breed', 'color', 'gender', 'dateOfBirth',
    'weightKg', 'heightCm', 'registrationNumber', 'status', 'notes',
];

const OWNER_EDITABLE = ['fullName', 'phone', 'avatar', 'address', 'stableName', 'stableAddress', 'silks'];

export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        for (const f of OWNER_EDITABLE) {
            if (req.body[f] !== undefined) user[f] = req.body[f];
        }
        await user.save();
        return res.status(200).send({ status: 'Success', message: 'Profile updated', data: user });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

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
        const horse = await Horse.findById(req.params.id).populate('currentJockey', 'fullName licenseNumber rating');
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }

        // Liệt kê tất cả race mà ngựa này có registration. Một ngựa được đua
        // nhiều race cùng lúc — chia thành upcoming (chưa Finished) và history.
        const races = await Race.find({ 'registrations.horse': horse._id })
            .sort({ raceDate: -1 })
            .populate('registrations.jockey', 'fullName')
            .lean();
        const upcoming = [];
        const history = [];
        for (const race of races) {
            const reg = race.registrations.find((r) => String(r.horse) === String(horse._id));
            if (!reg) continue;
            const item = {
                raceId: race._id,
                raceName: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                registrationId: reg._id,
                jockey: reg.jockey,
                approvalStatus: reg.approvalStatus,
                jockeyResponse: reg.jockeyResponse?.status,
                hireFee: reg.hireFee,
                entryFeePaid: reg.entryFeePaid,
                finalRank: reg.finalRank,
            };
            if (race.status === 'Finished' || race.status === 'Cancelled') {
                history.push(item);
            } else {
                upcoming.push(item);
            }
        }

        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết ngựa',
            data: {
                horse,
                racesParticipating: {
                    upcomingCount: upcoming.length,
                    upcoming,
                    history,
                },
            },
        });
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
        const { jockeyId, clear } = req.body;

        const horse = await Horse.findById(req.params.id);
        if (!horse) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy ngựa' });
        }
        if (String(horse.owner) !== String(req.user._id)) {
            return res.status(403).send({ status: 'Error', message: 'Ngựa này không thuộc về bạn' });
        }

        // Branch gỡ assignment: body { clear: true } hoặc jockeyId: null/'' để rảnh tay
        // cho ngựa, không gán jockey nào hết. Owner sẽ phải truyền jockeyId thủ công
        // khi đăng ký race tiếp theo.
        if (clear === true || jockeyId === null || jockeyId === '') {
            const previousJockey = horse.currentJockey;
            if (!previousJockey) {
                return res.status(400).send({
                    status: 'Error',
                    message: 'Ngựa hiện không có jockey nào để gỡ.',
                });
            }
            horse.currentJockey = undefined;
            try {
                await horse.save();
            } catch (err) {
                return res.status(500).send({ status: 'Error', message: `Không thể lưu ngựa: ${err.message}` });
            }

            await notify(previousJockey, {
                type: NOTIFICATION_TYPES.JOCKEY_HIRED,
                title: `Bị gỡ khỏi ngựa "${horse.name}"`,
                body: `Owner ${req.user.fullName} không còn gán bạn làm jockey của ngựa này.`,
                data: { horseId: horse._id, ownerId: req.user._id, cleared: true },
            });

            return res.status(200).send({
                status: 'Success',
                message: 'Đã gỡ jockey khỏi ngựa',
                data: horse,
            });
        }

        if (!mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'jockeyId không hợp lệ' });
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

// List races Owner can browse. Default: races still accepting registrations
// (Draft + Open). Pass ?status=All to see history (Locked/Finished too).
export const listRacesForOwner = async (req, res) => {
    try {
        const { status, onlyMine } = req.query;
        // ?status=All → không filter status (trả về mọi race)
        // ?status=Open|Draft|Locked|Finished|Cancelled → filter đúng cái đó
        // Không truyền → mặc định Draft + Open (đang nhận đăng ký)
        let filter;
        if (status === 'All') filter = {};
        else if (status) filter = { status };
        else filter = { status: { $in: ['Draft', 'Open'] } };

        // Filter chỉ trả các race owner đã đăng ký tham gia (có registration của họ).
        // Dùng cho tab "Lịch sử / Cuộc đua của tôi" trên FE.
        const wantOnlyMine = onlyMine === 'true' || onlyMine === true;
        if (wantOnlyMine) {
            filter['registrations.owner'] = req.user._id;
        }

        const races = await Race.find(filter)
            .sort({ raceDate: 1 })
            .populate('referee', 'fullName')
            .populate('registrations.horse', 'name')
            .lean();
        const myId = String(req.user._id);
        const now = new Date();
        const data = races.map((r) => {
            const mine = r.registrations.find((reg) => String(reg.owner) === myId);
            const invite = (r.invitedOwners || []).find((i) => String(i.owner) === myId);
            const isInvited = !!invite;
            // Lazy compute effective status cho response — .lean() không save
            // được, nhưng FE cần thấy status đúng ngay. Persist sẽ xảy ra ở
            // registerForRace hoặc cron sau.
            const effectiveStatus = getEffectiveStatus(r, now);
            return {
                _id: r._id,
                name: r.name,
                raceDate: r.raceDate,
                registrationOpenAt: r.registrationOpenAt || null,
                registrationCloseAt: r.registrationCloseAt || null,
                location: r.location,
                distanceM: r.distanceM,
                status: effectiveStatus,
                storedStatus: r.status,
                prizeMoney: r.prizeMoney,
                prizeDistribution: r.prizeDistribution,
                prizeBreakdown: calculatePrizeBreakdown(r),
                entryFee: r.entryFee || 0,
                addEntryFeeToPrize: !!r.addEntryFeeToPrize,
                referee: r.referee,
                registrationCount: r.registrations.length,
                isInvited,
                inviteStatus: invite ? invite.status : null,
                myRegistration: mine
                    ? {
                          _id: mine._id,
                          horse: mine.horse,
                          jockey: mine.jockey,
                          hireFee: mine.hireFee,
                          jockeyBonusPercent: mine.jockeyBonusPercent,
                          approvalStatus: mine.approvalStatus,
                          jockeyResponse: mine.jockeyResponse,
                          finalRank: mine.finalRank,
                      }
                    : null,
            };
        });
        return res.status(200).send({ status: 'Success', message: 'Races', data });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * GET /api/owner/invites
 * Danh sách các giải admin đã MỜI owner này tham gia, kèm trạng thái phản hồi
 * (Pending/Accepted/Declined) của chính owner. Sort theo ngày đua gần nhất.
 */
export const listMyInvites = async (req, res) => {
    try {
        const myId = String(req.user._id);
        const races = await Race.find({ 'invitedOwners.owner': req.user._id })
            .sort({ raceDate: 1 })
            .populate('referee', 'fullName')
            .lean();
        const now = new Date();
        const data = races.map((r) => {
            const invite = (r.invitedOwners || []).find((i) => String(i.owner) === myId);
            const myReg = r.registrations.find((reg) => String(reg.owner) === myId);
            const acceptedCount = (r.invitedOwners || []).filter((i) => i.status === 'Accepted').length;
            const cap = r.maxParticipants || 0;
            return {
                raceId: r._id,
                name: r.name,
                raceDate: r.raceDate,
                location: r.location,
                distanceM: r.distanceM,
                status: getEffectiveStatus(r, now),
                prizeMoney: r.prizeMoney,
                referee: r.referee,
                inviteStatus: invite ? invite.status : 'Pending',
                respondedAt: invite ? invite.respondedAt || null : null,
                declineReason: invite ? invite.declineReason || null : null,
                hasRegistered: !!myReg,
                // Sức chứa: cap=0 nghĩa là không giới hạn (slotsLeft=null).
                maxParticipants: cap,
                acceptedCount,
                slotsLeft: cap > 0 ? Math.max(cap - acceptedCount, 0) : null,
                isFull: cap > 0 && acceptedCount >= cap,
            };
        });
        return res.status(200).send({ status: 'Success', message: 'Lời mời tham gia giải', data });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * POST /api/owner/invites/:raceId/respond
 * Owner đồng ý / từ chối lời mời tham gia giải. Trả lời 1 lần, không sửa lại
 * (giống ride-offer của jockey).
 *   - accept: PHẢI kèm ngựa + jockey (horseId, [jockeyId], [hireFee],
 *     [jockeyBonusPercent]) → đăng ký ngựa vào giải LUÔN như registerForRace,
 *     rồi đánh dấu lời mời Accepted. Đồng ý mà không có ngựa thì đâu có đua được.
 *   - decline: chỉ cần { reason? }. Từ chối KHÔNG chặn owner đăng ký sau này.
 */
export const respondToInvite = async (req, res) => {
    try {
        const { raceId } = req.params;
        const { action, reason } = req.body;
        if (!mongoose.isValidObjectId(raceId)) {
            return res.status(400).send({ status: 'Error', message: 'raceId không hợp lệ' });
        }
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).send({ status: 'Error', message: "action phải là 'accept' hoặc 'decline'" });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy giải' });
        // Lazy transition trước khi xử lý — giải có thể vừa qua giờ đóng đơn.
        if (applyEffectiveStatus(race)) await race.save();

        const invite = (race.invitedOwners || []).find((i) => String(i.owner) === String(req.user._id));
        if (!invite) {
            return res.status(403).send({ status: 'Error', message: 'Bạn không được mời tham gia giải này' });
        }
        if (invite.status !== 'Pending') {
            const done = invite.status === 'Accepted' ? 'đồng ý' : 'từ chối';
            return res.status(400).send({ status: 'Error', message: `Bạn đã ${done} lời mời này rồi, không đổi được` });
        }

        // ---- TỪ CHỐI: chỉ ghi trạng thái, không cần ngựa ----
        if (action === 'decline') {
            if (!['Draft', 'Open'].includes(race.status)) {
                return res.status(400).send({ status: 'Error', message: `Giải đang ${race.status}, không phản hồi lời mời được nữa` });
            }
            invite.status = 'Declined';
            invite.respondedAt = new Date();
            invite.declineReason = reason ? String(reason).trim() : undefined;
            await race.save();
            return res.status(200).send({
                status: 'Success',
                message: 'Đã từ chối lời mời tham gia giải',
                data: { raceId: race._id, inviteStatus: 'Declined', respondedAt: invite.respondedAt, declineReason: invite.declineReason || null },
            });
        }

        // ---- ĐỒNG Ý: bắt buộc kèm ngựa + đăng ký thật vào giải ----
        // Đăng ký cần giải đang Open (đang mở đơn) — Draft chưa mở, Locked đã đóng.
        if (race.status !== 'Open') {
            const msg = race.status === 'Draft'
                ? `Giải chưa mở đăng ký (mở lúc ${race.registrationOpenAt ? new Date(race.registrationOpenAt).toLocaleString('vi-VN') : 'chưa xác định'})`
                : 'Giải không còn nhận đăng ký, không thể đồng ý kèm ngựa';
            return res.status(400).send({ status: 'Error', message: msg });
        }
        if (!req.body.horseId) {
            return res.status(400).send({
                status: 'Error',
                message: 'Đồng ý lời mời cần chọn ngựa để tham gia (truyền horseId, kèm jockeyId nếu ngựa chưa có jockey mặc định).',
                data: { needAction: 'PICK_HORSE_TO_JOIN' },
            });
        }
        // Cơ chế "đồng ý trước được vào": giới hạn theo số owner đã Accepted.
        if (race.maxParticipants > 0) {
            const acceptedCount = (race.invitedOwners || []).filter((i) => i.status === 'Accepted').length;
            if (acceptedCount >= race.maxParticipants) {
                return res.status(409).send({
                    status: 'Error',
                    message: `Giải đã đủ ${race.maxParticipants} người tham dự — bạn đến sau nên không vào được nữa.`,
                });
            }
        }

        const result = await buildRaceRegistration(race, req.user._id, req.body);
        if (result.error) {
            return res.status(result.error.statusCode).send({
                status: 'Error',
                message: result.error.message,
                ...(result.error.data && { data: result.error.data }),
            });
        }
        invite.status = 'Accepted';
        invite.respondedAt = new Date();
        await race.save();
        await notifyHiredJockey(race, req.user._id, result.jockey, result.hireFee);

        return res.status(200).send({
            status: 'Success',
            message: result.raceFull
                ? `Đã đồng ý lời mời và đăng ký ngựa tham gia — chờ referee duyệt. Giải đã đủ ${MAX_HORSES_PER_RACE} ngựa — form tự động đóng.`
                : 'Đã đồng ý lời mời và đăng ký ngựa tham gia — chờ referee duyệt',
            data: {
                raceId: race._id,
                inviteStatus: 'Accepted',
                respondedAt: invite.respondedAt,
                registration: result.registration,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Owner race detail. Trả về toàn bộ thông tin race + danh sách người tham gia
 * (populate horse/jockey/owner) + myRegistration tách riêng để FE hiển thị
 * trạng thái đăng ký của chính owner. Race đã Finished thì kèm podium top 3
 * đã sort.
 */
export const getRaceDetailForOwner = async (req, res) => {
    try {
        const { raceId } = req.params;
        if (!mongoose.isValidObjectId(raceId)) {
            return res.status(400).send({ status: 'Error', message: 'raceId không hợp lệ' });
        }

        const race = await Race.findById(raceId)
            .populate('referee', 'fullName email phone')
            .populate(
                'registrations.horse',
                'name registrationNumber breed color gender weightKg heightCm speedRating staminaRating preferredDistanceM',
            )
            .populate(
                'registrations.jockey',
                'fullName avatar experienceYears weightKg heightCm rating totalRaces totalWins pricePerRace',
            )
            .populate('registrations.owner', 'fullName stableName avatar')
            .lean();

        if (!race) {
            return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        }

        const myId = String(req.user._id);
        const myRegistration = race.registrations.find((r) => String(r.owner?._id || r.owner) === myId) || null;

        const participants = race.registrations.map((r) => ({
            registrationId: r._id,
            isMine: String(r.owner?._id || r.owner) === myId,
            horse: r.horse,
            jockey: r.jockey,
            owner: r.owner,
            hireFee: r.hireFee,
            jockeyBonusPercent: r.jockeyBonusPercent,
            entryFeePaid: r.entryFeePaid,
            approvalStatus: r.approvalStatus,
            rejectReason: r.rejectReason,
            jockeyResponse: r.jockeyResponse,
            finalRank: r.finalRank,
            oddTop1: r.oddTop1,
            oddTop2: r.oddTop2,
            oddTop3: r.oddTop3,
        }));

        if (race.status === 'Finished') {
            participants.sort((a, b) => {
                if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank;
                if (a.finalRank) return -1;
                if (b.finalRank) return 1;
                return 0;
            });
        }

        const podium = race.status === 'Finished'
            ? participants
                .filter((p) => p.finalRank && p.finalRank <= 3)
                .map((p) => ({
                    rank: p.finalRank,
                    horse: p.horse,
                    jockey: p.jockey,
                    owner: p.owner,
                }))
            : [];

        // Bảng xếp hạng đầy đủ 1, 2, 3, 4, ... cho trang kết quả giải đấu.
        const breakdownForLb = calculatePrizeBreakdown(race);
        const leaderboard = race.status === 'Finished'
            ? participants
                .filter((p) => p.finalRank)
                .sort((a, b) => a.finalRank - b.finalRank)
                .map((p) => {
                    const reg = race.registrations.find((r) => String(r._id) === String(p.registrationId));
                    return {
                        rank: p.finalRank,
                        isMine: p.isMine,
                        horse: p.horse,
                        jockey: p.jockey,
                        owner: p.owner,
                        prizeWon: breakdownForLb.find((b) => b.rank === p.finalRank)?.amount || 0,
                        finishTimeSec: reg?.finishTimeSec ?? null,
                        penalties: reg?.penalties || [],
                        totalPenaltySec: (reg?.penalties || []).reduce((s, x) => s + (x.timePenaltySec || 0), 0),
                    };
                })
            : [];

        return res.status(200).send({
            status: 'Success',
            message: 'Chi tiết race',
            data: {
                _id: race._id,
                name: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                prizeMoney: race.prizeMoney,
                prizeDistribution: race.prizeDistribution,
                prizeBreakdown: calculatePrizeBreakdown(race),
                entryFee: race.entryFee,
                addEntryFeeToPrize: race.addEntryFeeToPrize,
                referee: race.referee,
                finalizedAt: race.finalizedAt,
                participantCount: participants.length,
                myRegistration,
                participants,
                podium,
                leaderboard,
            },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Lịch sử race của owner: tất cả race họ từng đăng ký, sort raceDate giảm dần.
 * Trả gọn theo từng race: ngựa-jockey của owner, hạng cuối, prize owner nhận
 * được, kèm thông tin winner (ai về hạng 1) — Finished races mới có winner.
 *
 * Đây là endpoint dành riêng cho tab "Lịch sử trả thưởng" trên UI. Khác với
 * listRacesForOwner?onlyMine=true ở chỗ: response phẳng hơn, kèm payout info.
 */
export const getMyRaceHistory = async (req, res) => {
    try {
        const myId = String(req.user._id);
        // Pagination: cap mặc định 50, tối đa 200 để tránh dump cả nghìn race
        // cho 1 owner cũ (sản phẩm thật sẽ có UI infinite-scroll).
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
        const skip = Math.max(Number(req.query.skip) || 0, 0);

        const filter = { 'registrations.owner': req.user._id };
        const total = await Race.countDocuments(filter);
        const races = await Race.find(filter)
            .sort({ raceDate: -1 })
            .skip(skip)
            .limit(limit)
            .populate('referee', 'fullName')
            .populate('registrations.horse', 'name registrationNumber breed')
            .populate('registrations.jockey', 'fullName')
            .populate('registrations.owner', 'fullName stableName')
            .lean();

        const data = races.map((race) => {
            const breakdown = calculatePrizeBreakdown(race);
            const myReg = race.registrations.find((r) => String(r.owner?._id || r.owner) === myId);
            const winnerReg = race.status === 'Finished'
                ? race.registrations.find((r) => r.finalRank === 1)
                : null;

            const prizeForRank = (rank) =>
                breakdown.find((b) => b.rank === rank)?.amount || 0;

            const myPrize = myReg?.finalRank ? prizeForRank(myReg.finalRank) : 0;
            const myBonus = myReg?.finalRank && myReg.jockeyBonusPercent
                ? Math.round((myPrize * myReg.jockeyBonusPercent) / 100)
                : 0;
            const myNetProfit = myPrize - myBonus - (myReg?.hireFee || 0) - (myReg?.entryFeePaid || 0);

            return {
                raceId: race._id,
                raceName: race.name,
                raceDate: race.raceDate,
                location: race.location,
                distanceM: race.distanceM,
                status: race.status,
                referee: race.referee,
                prizeMoney: race.prizeMoney,
                prizeBreakdown: breakdown,
                entryFee: race.entryFee || 0,
                addEntryFeeToPrize: !!race.addEntryFeeToPrize,

                myEntry: myReg ? {
                    registrationId: myReg._id,
                    horse: myReg.horse,
                    jockey: myReg.jockey,
                    approvalStatus: myReg.approvalStatus,
                    jockeyResponse: myReg.jockeyResponse?.status,
                    finalRank: myReg.finalRank,
                    hireFee: myReg.hireFee,
                    jockeyBonusPercent: myReg.jockeyBonusPercent,
                    entryFeePaid: myReg.entryFeePaid,
                    payoutDone: myReg.payoutDone,
                    bonusPaid: myReg.bonusPaid,
                } : null,

                winner: winnerReg ? {
                    horse: winnerReg.horse,
                    jockey: winnerReg.jockey,
                    owner: winnerReg.owner,
                    prize: prizeForRank(1),
                } : null,

                payout: race.status === 'Finished' ? {
                    myFinalRank: myReg?.finalRank || null,
                    myPrize,
                    myBonusPaidToJockey: myBonus,
                    myNetProfit,
                    isMyWin: myReg?.finalRank === 1,
                } : null,
            };
        });

        return res.status(200).send({
            status: 'Success',
            message: 'Lịch sử race của bạn',
            data,
            pagination: { total, limit, skip, hasMore: skip + data.length < total },
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
        const wasApproved = reg.approvalStatus === 'Approved';
        const jockeyId = reg.jockey;
        const horseName = (await Horse.findById(reg.horse).select('name').lean())?.name;

        // Chính sách hoàn fee:
        //  - Pending / Rejected: hoàn 100% entry fee + rollback prize pool nếu trước
        //    đó addEntryFeeToPrize=true (vì owner chưa "chiếm slot" đã duyệt).
        //  - Approved: KHÔNG hoàn fee như tiền phạt rút lui muộn. Prize pool giữ
        //    nguyên (entry fee đã được tính vào tổng giải, không trả ngược).
        let refundedAmount = 0;
        if (reg.entryFeePaid > 0 && !wasApproved) {
            await credit(reg.owner, reg.entryFeePaid, {
                type: WALLET_TX_TYPES.REFUND,
                reference: String(race._id),
                description: `Refund entry fee (cancelled) for race "${race.name}"`,
            });
            refundedAmount = reg.entryFeePaid;
            if (race.addEntryFeeToPrize) {
                race.prizeMoney = Math.max(0, (race.prizeMoney || 0) - reg.entryFeePaid);
            }
        }
        const forfeitedFee = wasApproved ? (reg.entryFeePaid || 0) : 0;

        reg.deleteOne();
        await race.save();

        await notify(jockeyId, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Offer withdrawn for race "${race.name}"`,
            body: `Owner cancelled the offer${horseName ? ` (horse: ${horseName})` : ''}.`,
            data: { raceId: race._id, registrationId: regId, cancelled: true },
        });

        return res.status(200).send({
            status: 'Success',
            message: wasApproved
                ? `Đã huỷ. Vì đã được referee duyệt nên entry fee ${forfeitedFee.toLocaleString('vi-VN')} VND không được hoàn.`
                : 'Đã huỷ và hoàn entry fee',
            data: { refundedAmount, forfeitedFee, wasApproved },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

/**
 * Core đăng ký 1 ngựa + jockey vào race cho owner. Dùng chung cho registerForRace
 * và luồng đồng ý lời mời (respondToInvite). MUTATES `race` (push registration,
 * có thể cộng prizeMoney) và trừ ví nếu có entryFee, NHƯNG không gọi race.save()
 * — caller lo save + notify. Trả { error: { statusCode, message, data? } } khi
 * thất bại, hoặc { registration, jockey, hireFee } khi thành công.
 */
const buildRaceRegistration = async (race, ownerId, body = {}) => {
    const { horseId, hireFee = 0, jockeyBonusPercent = 0 } = body;
    let { jockeyId } = body;
    // Cap cứng 18 ngựa/giải — chặn sớm trước khi trừ ví. Jockey từ chối thì
    // registration bị xoá (deleteOne) nên length luôn phản ánh số ngựa đang giữ chỗ.
    if (race.registrations.length >= MAX_HORSES_PER_RACE) {
        return { error: { statusCode: 409, message: `Giải đã đủ ${MAX_HORSES_PER_RACE} ngựa — form đã đóng, không nhận thêm đăng ký.` } };
    }
    if (!mongoose.isValidObjectId(horseId)) {
        return { error: { statusCode: 400, message: 'horseId không hợp lệ' } };
    }

    const horse = await Horse.findById(horseId);
    if (!horse) return { error: { statusCode: 404, message: 'Không tìm thấy ngựa' } };
    if (String(horse.owner) !== String(ownerId)) {
        return { error: { statusCode: 403, message: 'Ngựa này không thuộc về bạn' } };
    }
    if (horse.status !== 'Active') {
        return { error: { statusCode: 400, message: 'Ngựa không ở trạng thái Active' } };
    }

    const jockeyExplicit = Boolean(jockeyId);
    // Fallback: use horse's assigned jockey if owner didn't pick a specific one.
    if (!jockeyId) jockeyId = horse.currentJockey;
    if (!jockeyId) {
        // Trường hợp phổ biến: jockey cũ vừa decline → horse.currentJockey bị
        // clear → owner đăng ký lại không có default jockey nào. Thông báo cụ thể
        // để FE biết phải hiển thị picker chọn jockey mới.
        return {
            error: {
                statusCode: 400,
                message: 'Ngựa hiện không có jockey mặc định. Hãy truyền jockeyId mới, hoặc gán jockey trước qua PATCH /api/owner/horses/:id/jockey.',
                data: { needAction: 'PICK_JOCKEY_OR_ASSIGN_FIRST' },
            },
        };
    }
    if (!mongoose.isValidObjectId(jockeyId)) {
        return { error: { statusCode: 400, message: 'jockeyId không hợp lệ' } };
    }

    const jockey = await User.findOne({ _id: jockeyId, role: ROLES.JOCKEY });
    if (!jockey) return { error: { statusCode: 404, message: 'Không tìm thấy Jockey' } };

    if (race.registrations.some((r) => String(r.horse) === String(horseId))) {
        return { error: { statusCode: 409, message: 'Ngựa đã đăng ký race này' } };
    }
    // Mỗi race chỉ cho 1 jockey cưỡi 1 ngựa (physical constraint). Phân biệt 2 case:
    //   - Owner truyền jockeyId rõ ràng → 409 thẳng vì owner chủ động chọn sai.
    //   - Default fallback từ horse.currentJockey → 400 + gợi ý chọn jockey khác.
    if (race.registrations.some((r) => String(r.jockey) === String(jockeyId))) {
        if (jockeyExplicit) {
            return { error: { statusCode: 409, message: 'Jockey này đã ở trong race với ngựa khác' } };
        }
        return {
            error: {
                statusCode: 400,
                message: `Jockey mặc định (${jockey.fullName}) của ngựa "${horse.name}" đang cưỡi ngựa khác trong race này. Vui lòng truyền jockeyId khác để đăng ký.`,
                data: { conflictingJockeyId: jockeyId, suggestion: 'PASS_DIFFERENT_JOCKEY_ID' },
            },
        };
    }

    const bonusPct = Math.min(100, Math.max(0, Number(jockeyBonusPercent) || 0));
    const entryFee = race.entryFee || 0;
    if (entryFee > 0) {
        // Pre-check số dư trước khi debit để trả message rõ ràng cho FE.
        const wallet = await getOrCreateWallet(ownerId);
        const balance = wallet?.balance || 0;
        if (balance < entryFee) {
            const shortfall = entryFee - balance;
            return {
                error: {
                    statusCode: 400,
                    message: `Số dư ví không đủ để đăng ký race. Cần ${entryFee.toLocaleString('vi-VN')} VND, ví hiện có ${balance.toLocaleString('vi-VN')} VND. Vui lòng nạp thêm ${shortfall.toLocaleString('vi-VN')} VND.`,
                    data: { required: entryFee, currentBalance: balance, shortfall, action: 'TOP_UP_REQUIRED' },
                },
            };
        }
        try {
            await debit(ownerId, entryFee, {
                type: WALLET_TX_TYPES.ENTRY_FEE,
                reference: String(race._id),
                description: `Phí tham gia race "${race.name}"`,
            });
        } catch (e) {
            return { error: { statusCode: 400, message: `Trừ phí tham gia thất bại: ${e.message}` } };
        }
        if (race.addEntryFeeToPrize) {
            race.prizeMoney = (race.prizeMoney || 0) + entryFee;
        }
    }
    race.registrations.push({
        horse: horse._id,
        jockey: jockey._id,
        owner: ownerId,
        approvalStatus: 'Pending',
        hireFee: Math.max(0, Number(hireFee) || 0),
        jockeyBonusPercent: bonusPct,
        entryFeePaid: entryFee,
    });
    // Con ngựa thứ 18 vừa vào → giải đủ chỗ, tự đóng form ngay (Locked) để
    // không ai đăng ký thêm. Caller sẽ race.save().
    const raceFull = race.registrations.length >= MAX_HORSES_PER_RACE;
    if (raceFull && race.status === 'Open') {
        race.status = 'Locked';
    }
    return { registration: race.registrations[race.registrations.length - 1], jockey, hireFee: Number(hireFee) || 0, raceFull };
};

// Sau khi push registration + save race, báo cho jockey biết có đề nghị cưỡi
// (chỉ khi có hireFee). Dùng chung cho registerForRace và accept lời mời.
const notifyHiredJockey = async (race, ownerId, jockey, hireFee) => {
    if (!(hireFee > 0)) return;
    await notify(jockey._id, {
        type: NOTIFICATION_TYPES.JOCKEY_HIRED,
        title: `Đề nghị cưỡi race "${race.name}"`,
        body: `Phí: ${hireFee.toLocaleString('vi-VN')} VND. Sẽ chi trả sau khi race kết thúc.`,
        data: { raceId: race._id, ownerId, hireFee },
    });
};

export const registerForRace = async (req, res) => {
    try {
        const { raceId } = req.params;
        if (!mongoose.isValidObjectId(raceId)) {
            return res.status(400).send({ status: 'Error', message: 'ID không hợp lệ' });
        }

        const race = await Race.findById(raceId);
        if (!race) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy race' });
        // Lazy transition: nếu registrationCloseAt đã qua nhưng status vẫn Open,
        // tự đổi sang Locked trước khi check — Owner không đăng ký được nữa.
        if (applyEffectiveStatus(race)) await race.save();
        if (race.status !== 'Open') {
            const msg = race.status === 'Draft'
                ? `Race chưa mở đăng ký (mở lúc ${race.registrationOpenAt ? new Date(race.registrationOpenAt).toLocaleString('vi-VN') : 'chưa xác định'})`
                : 'Race không còn nhận đăng ký';
            return res.status(400).send({ status: 'Error', message: msg });
        }

        const result = await buildRaceRegistration(race, req.user._id, req.body);
        if (result.error) {
            return res.status(result.error.statusCode).send({
                status: 'Error',
                message: result.error.message,
                ...(result.error.data && { data: result.error.data }),
            });
        }
        await race.save();
        await notifyHiredJockey(race, req.user._id, result.jockey, result.hireFee);

        return res.status(201).send({
            status: 'Success',
            message: result.raceFull
                ? `Đăng ký race thành công, chờ referee duyệt. Giải đã đủ ${MAX_HORSES_PER_RACE} ngựa — form tự động đóng.`
                : 'Đăng ký race thành công, chờ referee duyệt',
            data: result.registration,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
