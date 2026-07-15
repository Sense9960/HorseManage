/**
 * Race + embedded Registration[].
 *
 * Lifecycle: Draft → Open → Locked → Finished (Cancelled allowed anywhere
 * except after Finished — currently not enforced at the schema level).
 *
 * Registrations are embedded (not a separate collection) because the cardinality
 * per race is small (≤ 20 horses) and we always query them together with the
 * race. Each Registration tracks:
 *   - approvalStatus: referee gate (Pending → Approved / Rejected)
 *   - finalRank: set by referee at submitResults
 *   - hireFee: amount the owner promised the jockey for this race, paid out
 *     from owner's wallet → jockey's wallet when race goes Finished.
 *   - payoutDone: idempotency flag so a re-trigger of submitResults does not
 *     pay the hire fee twice.
 *
 * prizeMoney is the total purse for the race; prizeDistribution splits it
 * across ranks (default 60/30/10 for top 3). Anything not covered = 0.
 */

import mongoose from 'mongoose';

const registrationSchema = new mongoose.Schema(
    {
        horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
        jockey: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        approvalStatus: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', 'Banned'],
            default: 'Pending',
        },
        rejectReason: { type: String, trim: true },
        finalRank: { type: Number, min: 1 },
        // Thời gian hoàn thành race của ngựa (giây). Referee nhập kèm khi chốt
        // kết quả để bảng xếp hạng hiện cả "Hạng 1: Thunder — 1:32.45s".
        finishTimeSec: { type: Number, min: 0 },
        hireFee: { type: Number, default: 0, min: 0 },
        // % of prize money owner shares with jockey when the horse ranks.
        jockeyBonusPercent: { type: Number, default: 0, min: 0, max: 100 },
        // Snapshot of race.entryFee at registration time — used for refunds.
        entryFeePaid: { type: Number, default: 0, min: 0 },
        payoutDone: { type: Boolean, default: false },
        bonusPaid: { type: Boolean, default: false },
        // Jockey's response to the hire offer. Owner registers → Pending;
        // jockey must Accept before referee can approve. Decline closes the
        // registration (no further state changes from jockey).
        jockeyResponse: {
            status: { type: String, enum: ['Pending', 'Accepted', 'Declined'], default: 'Pending' },
            respondedAt: { type: Date },
            declineReason: { type: String, trim: true },
        },
        // Prediction odds; 0 = predictions disabled for this registration/type.
        oddTop1: { type: Number, default: 0, min: 0 },
        oddTop2: { type: Number, default: 0, min: 0 },
        oddTop3: { type: Number, default: 0, min: 0 },
        // Referee đánh phạt trước/trong race (vd: jockey sai vạch xuất phát,
        // ngựa đánh ngựa khác). timePenaltySec sẽ cộng vào thời gian hoàn thành
        // khi tính rank → ngựa bị phạt nặng dễ xuống hạng. Có thể có nhiều phạt.
        //
        // Khi referee gỡ penalty (vd: jockey kháng án thành công), record vẫn
        // giữ lại nhưng status đổi sang Cancelled + lưu cancelReason để audit.
        // Penalty Cancelled KHÔNG trừ vào finishTimeSec / simulation score nữa.
        penalties: {
            type: [{
                reason: { type: String, required: true, trim: true },
                timePenaltySec: { type: Number, required: true, min: 0 },
                addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                addedAt: { type: Date, default: Date.now },
                status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active' },
                cancelReason: { type: String, trim: true },
                cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                cancelledAt: { type: Date },
                // Jockey gửi kháng án xin gỡ phạt. Mảng — cho phép nhiều lần
                // resubmit nếu lần đầu bị từ chối hoặc cần bổ sung lý do.
                appeals: {
                    type: [{
                        reason: { type: String, required: true, trim: true },
                        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                        submittedAt: { type: Date, default: Date.now },
                        status: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
                        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                        decidedAt: { type: Date },
                        decisionNote: { type: String, trim: true },
                    }],
                    default: [],
                },
            }],
            default: [],
        },
    },
    { timestamps: true }
);

const raceSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        raceDate: { type: Date, required: true },
        location: { type: String, trim: true },
        distanceM: { type: Number, min: 100 },
        status: {
            type: String,
            // Ranked = referee đã chấm (có finalRank tạm) nhưng CHƯA xác nhận —
            // sửa được trong 3h; confirm hoặc hết 3h mới sang Finished (payout).
            enum: ['Draft', 'Open', 'Locked', 'Ranked', 'Finished', 'Cancelled'],
            default: 'Draft',
        },
        referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        prizeMoney: { type: Number, default: 0, min: 0 },
        // Mandatory fee each owner pays to enter the race (filter + funding).
        entryFee: { type: Number, default: 0, min: 0 },
        // If true, every paid entryFee is added to prizeMoney.
        addEntryFeeToPrize: { type: Boolean, default: false },
        prizeDistribution: {
            type: [{ rank: { type: Number, min: 1 }, percent: { type: Number, min: 0, max: 100 } }],
            default: () => [
                { rank: 1, percent: 60 },
                { rank: 2, percent: 30 },
                { rank: 3, percent: 10 },
            ],
        },
        // Cửa sổ đăng ký: Owner chỉ đăng ký được trong khoảng [open, close].
        // Nếu không set → hành xử như cũ: mở ngay khi Draft → Open, đóng khi
        // raceDate tới. Set để có control chính xác giờ:phút.
        registrationOpenAt: { type: Date },
        registrationCloseAt: { type: Date },
        // Thời điểm referee chấm kết quả LẦN ĐẦU (provisional). Race vẫn Locked.
        // Referee được sửa kết quả trong 3 tiếng kể từ mốc này. Sau đó (hoặc
        // khi referee bấm confirm) → finalize: payout + status Finished.
        resultsSubmittedAt: { type: Date },
        registrations: { type: [registrationSchema], default: [] },
        // Admin "mời" 1 hoặc nhiều owner tham gia race. Khác với public race
        // (mọi owner đều thấy), invitedOwners cho phép tổ chức giải private.
        // FE list race sẽ flag isInvited=true cho owner trong array này.
        invitedOwners: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            default: [],
        },
        finalizedAt: { type: Date },
        // Biên bản kết quả thực tế do trọng tài đính khi chấm/chốt (tùy chọn,
        // KHÔNG bắt buộc). Lưu URL string như avatar/licenseDocuments — FE tự
        // upload ảnh (PNG…) lên storage ngoài rồi gửi URL về. Dùng để đối chiếu
        // kết quả thật với bảng xếp hạng đã chấm.
        resultProofImages: { type: [String], default: [] },
    },
    { timestamps: true }
);

raceSchema.index({ 'registrations.horse': 1, _id: 1 });
raceSchema.index({ 'registrations.jockey': 1, _id: 1 });

export default mongoose.model('Race', raceSchema);
