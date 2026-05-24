import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = {
    ADMIN: 'Admin',
    JOCKEY: 'Jockey',
    OWNER_HORSE: 'OwnerHorse',
    REFEREE: 'Referee',
    END_USER: 'EndUser',
};

const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: {
            type: String,
            minlength: 6,
            select: false,
            required: function () {
                return this.authProvider === 'local';
            },
        },
        fullName: { type: String, required: true, trim: true },
        authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
        googleId: { type: String, unique: true, sparse: true, index: true },
        phone: { type: String, trim: true },
        avatar: { type: String, default: '' },
        dateOfBirth: { type: Date },
        gender: { type: String, enum: ['Male', 'Female', 'Other'] },
        address: { type: String, trim: true },
        role: {
            type: String,
            enum: Object.values(ROLES),
            default: ROLES.END_USER,
            required: true,
        },
        status: { type: String, enum: ['Active', 'Inactive', 'Banned'], default: 'Active' },
        isVerified: { type: Boolean, default: false },
        lastLoginAt: { type: Date },
    },
    { timestamps: true, discriminatorKey: 'role' }
);

userSchema.pre('save', async function () {
    if (!this.isModified('password') || !this.password) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

const User = mongoose.model('User', userSchema);

const Admin = User.discriminator(
    ROLES.ADMIN,
    new mongoose.Schema({
        permissions: { type: [String], default: ['ALL'] },
        department: { type: String, default: 'System' },
    })
);

const Jockey = User.discriminator(
    ROLES.JOCKEY,
    new mongoose.Schema({
        licenseNumber: { type: String, unique: true, sparse: true },
        experienceYears: { type: Number, default: 0 },
        weightKg: { type: Number },
        heightCm: { type: Number },
        totalRaces: { type: Number, default: 0 },
        totalWins: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
    })
);

const OwnerHorse = User.discriminator(
    ROLES.OWNER_HORSE,
    new mongoose.Schema({
        companyName: { type: String },
        taxCode: { type: String, unique: true, sparse: true },
        stableName: { type: String },
        stableAddress: { type: String },
        horses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Horse' }],
    })
);

const Referee = User.discriminator(
    ROLES.REFEREE,
    new mongoose.Schema({
        refereeCertNumber: { type: String, unique: true, sparse: true, trim: true },
        specialization: { type: String, trim: true },
        totalRacesOfficiated: { type: Number, default: 0 },
    })
);

const EndUser = User.discriminator(
    ROLES.END_USER,
    new mongoose.Schema({
        favoriteJockeys: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        membershipLevel: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Platinum'], default: 'Bronze' },
        points: { type: Number, default: 0 },
    })
);

export { User, Admin, Jockey, OwnerHorse, Referee, EndUser };
export default User;
