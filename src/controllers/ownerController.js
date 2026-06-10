import mongoose from 'mongoose';
import Horse from '../models/Horse.js';
import Race from '../models/Race.js';
import { User, Jockey, ROLES } from '../models/User.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import { credit, debit } from '../services/walletService.js';
import { WALLET_TX_TYPES } from '../models/Wallet.js';
import { calculatePrizeBreakdown } from '../services/prizeBreakdown.js';

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

// List races Owner can browse. Default: races still accepting registrations
// (Draft + Open). Pass ?status=All to see history (Locked/Finished too).
export const listRacesForOwner = async (req, res) => {
    try {
        const { status, onlyMine } = req.query;
        const filter = status && status !== 'All'
            ? { status }
            : { status: { $in: ['Draft', 'Open'] } };

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
        const data = races.map((r) => {
            const mine = r.registrations.find((reg) => String(reg.owner) === myId);
            return {
                _id: r._id,
                name: r.name,
                raceDate: r.raceDate,
                location: r.location,
                distanceM: r.distanceM,
                status: r.status,
                prizeMoney: r.prizeMoney,
                prizeDistribution: r.prizeDistribution,
                prizeBreakdown: calculatePrizeBreakdown(r),
                referee: r.referee,
                registrationCount: r.registrations.length,
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
            },
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
        if (reg.approvalStatus === 'Approved') {
            return res.status(400).send({ status: 'Error', message: 'Already approved by referee — cannot cancel' });
        }

        const jockeyId = reg.jockey;
        const horseName = (await Horse.findById(reg.horse).select('name').lean())?.name;

        // Refund entry fee + roll back prize pool contribution.
        if (reg.entryFeePaid > 0) {
            await credit(reg.owner, reg.entryFeePaid, {
                type: WALLET_TX_TYPES.REFUND,
                reference: String(race._id),
                description: `Refund entry fee (cancelled) for race "${race.name}"`,
            });
            if (race.addEntryFeeToPrize) {
                race.prizeMoney = Math.max(0, (race.prizeMoney || 0) - reg.entryFeePaid);
            }
        }

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
        const { horseId, hireFee = 0, jockeyBonusPercent = 0 } = req.body;
        let { jockeyId } = req.body;
        if (!mongoose.isValidObjectId(raceId) || !mongoose.isValidObjectId(horseId)) {
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

        // Fallback: use horse's assigned jockey if owner didn't pick a specific one.
        if (!jockeyId) jockeyId = horse.currentJockey;
        if (!jockeyId) {
            return res.status(400).send({
                status: 'Error',
                message: 'Ngựa chưa có jockey gán sẵn. Hãy gán jockey trước hoặc truyền jockeyId.',
            });
        }
        if (!mongoose.isValidObjectId(jockeyId)) {
            return res.status(400).send({ status: 'Error', message: 'jockeyId không hợp lệ' });
        }

        const jockey = await User.findOne({ _id: jockeyId, role: ROLES.JOCKEY });
        if (!jockey) return res.status(404).send({ status: 'Error', message: 'Không tìm thấy Jockey' });

        if (race.registrations.some((r) => String(r.horse) === String(horseId))) {
            return res.status(409).send({ status: 'Error', message: 'Ngựa đã đăng ký race này' });
        }
        if (race.registrations.some((r) => String(r.jockey) === String(jockeyId))) {
            return res.status(409).send({ status: 'Error', message: 'Jockey đã đăng ký race này' });
        }

        const bonusPct = Math.min(100, Math.max(0, Number(jockeyBonusPercent) || 0));
        const entryFee = race.entryFee || 0;
        if (entryFee > 0) {
            try {
                await debit(req.user._id, entryFee, {
                    type: WALLET_TX_TYPES.ENTRY_FEE,
                    reference: String(race._id),
                    description: `Entry fee for race "${race.name}"`,
                });
            } catch (e) {
                return res.status(400).send({
                    status: 'Error',
                    message: `Insufficient wallet balance for entry fee (${entryFee} VND): ${e.message}`,
                });
            }
            if (race.addEntryFeeToPrize) {
                race.prizeMoney = (race.prizeMoney || 0) + entryFee;
            }
        }
        race.registrations.push({
            horse: horse._id,
            jockey: jockey._id,
            owner: req.user._id,
            approvalStatus: 'Pending',
            hireFee: Math.max(0, Number(hireFee) || 0),
            jockeyBonusPercent: bonusPct,
            entryFeePaid: entryFee,
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
