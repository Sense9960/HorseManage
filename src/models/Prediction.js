/**
 * Prediction = EndUser betting points on a race outcome.
 *
 * Three flavors: Top1 (horse finishes 1st), Top2 (horse finishes in top 2),
 * Top3 (horse finishes in top 3). Top1 is hardest → biggest payout; Top3 is
 * easiest → smallest. Admin sets per-registration odds on the Race before
 * users place predictions.
 *
 * Stake is deducted from user.points at placement and an odds snapshot is
 * stored so a later admin tweak to the race's odds cannot retroactively
 * change a user's potential payout.
 *
 * Lifecycle:
 *   Pending  — placed, race not yet finished
 *   Won      — race finished, prediction matched, payout = stake × odds
 *   Lost     — race finished, prediction missed (no refund)
 *   Refunded — race cancelled or settlement failed (stake returned)
 */

import mongoose from 'mongoose';

export const PREDICTION_TYPES = ['Top1', 'Top2', 'Top3'];
export const PREDICTION_STATUSES = ['Pending', 'Won', 'Lost', 'Refunded'];

const predictionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        race: { type: mongoose.Schema.Types.ObjectId, ref: 'Race', required: true, index: true },
        registration: { type: mongoose.Schema.Types.ObjectId, required: true },
        predictionType: { type: String, enum: PREDICTION_TYPES, required: true },
        stake: { type: Number, required: true, min: 1 },
        oddsAtPlacement: { type: Number, required: true, min: 1 },
        potentialPayout: { type: Number, required: true, min: 0 },
        status: { type: String, enum: PREDICTION_STATUSES, default: 'Pending', index: true },
        payout: { type: Number, default: 0, min: 0 },
        settledAt: { type: Date },
    },
    { timestamps: true }
);

predictionSchema.index({ race: 1, status: 1 });
predictionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Prediction', predictionSchema);
