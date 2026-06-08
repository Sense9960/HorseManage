import mongoose from 'mongoose';

// 5 giới tính ngựa theo độ tuổi + thiến
export const HORSE_GENDERS = ['Colt', 'Stallion', 'Gelding', 'Filly', 'Mare'];

// Giống ngựa dùng cho đua
export const HORSE_BREEDS = [
    'Thoroughbred',
    'Arabian',
    'Quarter Horse',
    'Standardbred',
    'Appaloosa',
    'Mustang',
];

// Hình thức đua mỗi giống phù hợp nhất
export const HORSE_RACING_SPECIALTIES = [
    'Flat racing',
    'Endurance racing',
    'Sprint',
    'Harness racing',
    'Barrel racing',
];

/**
 * Mapping giống → hình thức đua + cự ly đề xuất (mét). Dùng để auto-fill
 * racingSpecialty và preferredDistanceM khi create/update mà chưa set.
 */
export const BREED_PROFILE = {
    Thoroughbred:    { specialty: 'Flat racing',      preferredDistanceM: 2000 },
    Arabian:         { specialty: 'Endurance racing', preferredDistanceM: 5000 },
    'Quarter Horse': { specialty: 'Sprint',           preferredDistanceM: 400 },
    Standardbred:    { specialty: 'Harness racing',   preferredDistanceM: 1600 },
    Appaloosa:       { specialty: 'Barrel racing',    preferredDistanceM: 300 },
    Mustang:         { specialty: 'Barrel racing',    preferredDistanceM: 300 },
};

const horseSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        breed: { type: String, enum: HORSE_BREEDS },
        color: { type: String },
        gender: { type: String, enum: HORSE_GENDERS },
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
        racingSpecialty: { type: String, enum: HORSE_RACING_SPECIALTIES },
        notes: { type: String },
    },
    { timestamps: true }
);

// Auto-fill racingSpecialty + preferredDistanceM từ breed nếu owner chưa set
// thủ công. Owner vẫn override được bằng cách truyền giá trị riêng.
horseSchema.pre('validate', function (next) {
    if (this.breed && BREED_PROFILE[this.breed]) {
        const profile = BREED_PROFILE[this.breed];
        if (!this.racingSpecialty) this.racingSpecialty = profile.specialty;
        if (this.preferredDistanceM == null) this.preferredDistanceM = profile.preferredDistanceM;
    }
    next();
});

export default mongoose.model('Horse', horseSchema);
