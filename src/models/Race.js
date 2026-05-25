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
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending',
        },
        rejectReason: { type: String, trim: true },
        finalRank: { type: Number, min: 1 },
        hireFee: { type: Number, default: 0, min: 0 },
        payoutDone: { type: Boolean, default: false },
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
            enum: ['Draft', 'Open', 'Locked', 'Finished'],
            default: 'Draft',
        },
        referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        prizeMoney: { type: Number, default: 0, min: 0 },
        prizeDistribution: {
            type: [{ rank: { type: Number, min: 1 }, percent: { type: Number, min: 0, max: 100 } }],
            default: () => [
                { rank: 1, percent: 60 },
                { rank: 2, percent: 30 },
                { rank: 3, percent: 10 },
            ],
        },
        registrations: { type: [registrationSchema], default: [] },
        finalizedAt: { type: Date },
    },
    { timestamps: true }
);

raceSchema.index({ 'registrations.horse': 1, _id: 1 });
raceSchema.index({ 'registrations.jockey': 1, _id: 1 });

export default mongoose.model('Race', raceSchema);
