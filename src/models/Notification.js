import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = {
    REGISTRATION_APPROVED: 'RegistrationApproved',
    REGISTRATION_REJECTED: 'RegistrationRejected',
    RACE_FINISHED: 'RaceFinished',
    PRIZE_PAID: 'PrizePaid',
    HIRE_FEE_PAID: 'HireFeePaid',
    JOCKEY_HIRED: 'JockeyHired',
    WALLET_CREDIT: 'WalletCredit',
    WALLET_DEBIT: 'WalletDebit',
    PREDICTION_BONUS: 'PredictionBonus',
};

const notificationSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
        title: { type: String, required: true },
        body: { type: String, default: '' },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
        read: { type: Boolean, default: false, index: true },
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
