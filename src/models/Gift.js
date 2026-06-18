/**
 * Gift catalog (Admin creates) + GiftRedemption (EndUser claims).
 *
 * EndUsers earn `points` (a field on the User discriminator) from activities
 * like correct predictions and redeem them for Gifts. Redemption is atomic:
 *   1. $inc quantity by -1 (only succeeds while stock > 0)
 *   2. Check user.points >= gift.pointsCost; if not, rollback step 1.
 *   3. Deduct points + write a redemption row in status=Pending.
 *
 * Admin then marks the redemption Delivered when the physical item is shipped
 * (or applies the digital reward).
 *
 * `giftNameSnapshot` denormalises the gift's name onto the redemption so the
 * user's history stays readable even if the gift is later deleted/renamed.
 */

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
        // Mã code 10 ký tự (4 chữ cái + 6 số) cấp trực tiếp cho user khi đổi.
        // Không cần admin "giao hàng" nữa — đây là voucher điện tử dùng ngay.
        code: { type: String, unique: true, sparse: true, index: true, uppercase: true, trim: true },
        // description giải thích cách dùng / điều kiện áp dụng — copy từ gift.description
        // lúc redeem để user xem lại trong lịch sử mà không phụ thuộc gift gốc.
        description: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['Issued', 'Used', 'Cancelled'], default: 'Issued' },
        usedAt: { type: Date },
    },
    { timestamps: true }
);

export const Gift = mongoose.model('Gift', giftSchema);
export const GiftRedemption = mongoose.model('GiftRedemption', redemptionSchema);
