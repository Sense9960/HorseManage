// EndUser points-betting on race outcomes. Odds are snapshotted at placement
// so later admin edits to Race.registrations[].oddTop* don't change payouts.
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
