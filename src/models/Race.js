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
        registrations: { type: [registrationSchema], default: [] },
        finalizedAt: { type: Date },
    },
    { timestamps: true }
);

raceSchema.index({ 'registrations.horse': 1, _id: 1 });
raceSchema.index({ 'registrations.jockey': 1, _id: 1 });

export default mongoose.model('Race', raceSchema);
