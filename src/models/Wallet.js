import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        balance: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: 'VND' },
    },
    { timestamps: true }
);

export const WALLET_TX_TYPES = {
    DEPOSIT: 'Deposit',
    WITHDRAW: 'Withdraw',
    PRIZE: 'Prize',
    HIRE_FEE_IN: 'HireFeeIn',
    HIRE_FEE_OUT: 'HireFeeOut',
    BONUS: 'Bonus',
    REFUND: 'Refund',
    ADJUSTMENT: 'Adjustment',
};

const walletTxSchema = new mongoose.Schema(
    {
        wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, enum: Object.values(WALLET_TX_TYPES), required: true },
        direction: { type: String, enum: ['Credit', 'Debit'], required: true },
        amount: { type: Number, required: true, min: 0 },
        balanceAfter: { type: Number, required: true },
        status: { type: String, enum: ['Pending', 'Success', 'Failed'], default: 'Success' },
        reference: { type: String, trim: true },
        externalRef: { type: String, trim: true, index: true },
        description: { type: String, trim: true },
        payoutInfo: {
            bankName: { type: String, trim: true },
            accountNumber: { type: String, trim: true },
            accountName: { type: String, trim: true },
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        reviewNote: { type: String, trim: true },
    },
    { timestamps: true }
);

export const Wallet = mongoose.model('Wallet', walletSchema);
export const WalletTransaction = mongoose.model('WalletTransaction', walletTxSchema);
