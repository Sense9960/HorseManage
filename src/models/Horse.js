import mongoose from 'mongoose';

const horseSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        breed: { type: String },
        color: { type: String },
        gender: { type: String, enum: ['Stallion', 'Mare', 'Gelding'] },
        dateOfBirth: { type: Date },
        weightKg: { type: Number },
        heightCm: { type: Number },
        registrationNumber: { type: String, unique: true, sparse: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        currentJockey: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['Active', 'Resting', 'Injured', 'Retired'], default: 'Active' },
        totalRaces: { type: Number, default: 0 },
        totalWins: { type: Number, default: 0 },
        // Racing profile — used by the race simulator.
        speedRating: { type: Number, default: 50, min: 0, max: 100 },
        staminaRating: { type: Number, default: 50, min: 0, max: 100 },
        preferredDistanceM: { type: Number, min: 0 },
        notes: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model('Horse', horseSchema);
