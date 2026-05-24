import mongoose from 'mongoose';

const giftSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        pointsCost: { type: Number, required: true, min: 1 },
        quantity: { type: Number, required: true, min: 0 },
        imageUrl: { type: String, trim: true, default: '' },
        active: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

const redemptionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        gift: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift', required: true },
        giftNameSnapshot: { type: String, required: true },
        pointsPaid: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled'], default: 'Pending' },
        deliveredAt: { type: Date },
    },
    { timestamps: true }
);

export const Gift = mongoose.model('Gift', giftSchema);
export const GiftRedemption = mongoose.model('GiftRedemption', redemptionSchema);
