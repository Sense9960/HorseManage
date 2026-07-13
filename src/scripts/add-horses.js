import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User, OwnerHorse, Jockey, ROLES } from '../models/User.js';
import Horse from '../models/Horse.js';
import { HORSE_BREEDS, HORSE_GENDERS } from '../models/Horse.js';

const addHorses = async () => {
    await connectDB();

    // Lấy owner và jockey hiện có (từ seed)
    let owner1 = await OwnerHorse.findOne({ email: 'owner1@horse.test' });
    let owner2 = await OwnerHorse.findOne({ email: 'owner2@horse.test' });
    let jockey1 = await Jockey.findOne({ email: 'alex@horse.test' });
    let jockey2 = await Jockey.findOne({ email: 'mai@horse.test' });

    // Nếu không có, tạo mới
    if (!owner1) {
        owner1 = await OwnerHorse.create({
            username: 'owner_blackstar',
            email: 'owner1@horse.test',
            password: 'testpass123',
            fullName: 'Black Star Stable',
            role: ROLES.OWNER_HORSE,
            isVerified: true,
            companyName: 'Black Star Stable Co.',
            taxCode: 'TAX-001',
            stableName: 'Black Star Stable',
        });
    }

    if (!owner2) {
        owner2 = await OwnerHorse.create({
            username: 'owner_redmoon',
            email: 'owner2@horse.test',
            password: 'testpass123',
            fullName: 'Red Moon Stable',
            role: ROLES.OWNER_HORSE,
            isVerified: true,
            companyName: 'Red Moon Stable Co.',
            taxCode: 'TAX-002',
            stableName: 'Red Moon Stable',
        });
    }

    if (!jockey1) {
        jockey1 = await Jockey.create({
            username: 'jockey_alex',
            email: 'alex@horse.test',
            password: 'testpass123',
            fullName: 'Alex Nguyen',
            role: ROLES.JOCKEY,
            isVerified: true,
            licenseNumber: 'JKY-0001',
        });
    }

    if (!jockey2) {
        jockey2 = await Jockey.create({
            username: 'jockey_mai',
            email: 'mai@horse.test',
            password: 'testpass123',
            fullName: 'Mai Tran',
            role: ROLES.JOCKEY,
            isVerified: true,
            licenseNumber: 'JKY-0002',
        });
    }

    console.log('Adding 10 test horses...');
    const horsesData = [
        {
            name: 'Chó Chạy Nhanh',
            breed: 'Thoroughbred',
            color: 'Chestnut',
            gender: 'Stallion',
            dateOfBirth: new Date('2019-03-15'),
            weightKg: 480,
            heightCm: 165,
            registrationNumber: 'REG-ADD-001',
            owner: owner1._id,
            currentJockey: jockey1._id,
            status: 'Active',
            totalRaces: 20,
            totalWins: 15,
            rankCounts: { rank1: 15, rank2: 2, rank3: 2, others: 1 },
            speedRating: 85,
            staminaRating: 65,
            preferredDistanceM: 1200,
        },
        {
            name: 'Mặt Trăng Xanh',
            breed: 'Arabian',
            color: 'Bay',
            gender: 'Mare',
            dateOfBirth: new Date('2020-07-01'),
            weightKg: 450,
            heightCm: 160,
            registrationNumber: 'REG-ADD-002',
            owner: owner1._id,
            currentJockey: jockey2._id,
            status: 'Active',
            totalRaces: 20,
            totalWins: 5,
            rankCounts: { rank1: 5, rank2: 3, rank3: 4, others: 8 },
            speedRating: 65,
            staminaRating: 70,
            preferredDistanceM: 1600,
        },
        {
            name: 'Sao Đỏ Bay',
            breed: 'Quarter Horse',
            color: 'Sorrel',
            gender: 'Gelding',
            dateOfBirth: new Date('2018-11-20'),
            weightKg: 500,
            heightCm: 170,
            registrationNumber: 'REG-ADD-003',
            owner: owner2._id,
            currentJockey: jockey1._id,
            status: 'Active',
            totalRaces: 18,
            totalWins: 12,
            rankCounts: { rank1: 12, rank2: 3, rank3: 2, others: 1 },
            speedRating: 78,
            staminaRating: 72,
            preferredDistanceM: 1400,
        },
        {
            name: 'Vũ Công Mưa',
            breed: 'Standardbred',
            color: 'Brown',
            gender: 'Mare',
            dateOfBirth: new Date('2021-04-10'),
            weightKg: 430,
            heightCm: 158,
            registrationNumber: 'REG-ADD-004',
            owner: owner2._id,
            status: 'Active',
            totalRaces: 15,
            totalWins: 8,
            rankCounts: { rank1: 8, rank2: 4, rank3: 2, others: 1 },
            speedRating: 70,
            staminaRating: 75,
            preferredDistanceM: 1600,
        },
        {
            name: 'Gió Mạnh',
            breed: 'Appaloosa',
            color: 'Spotted',
            gender: 'Stallion',
            dateOfBirth: new Date('2017-06-30'),
            weightKg: 510,
            heightCm: 172,
            registrationNumber: 'REG-ADD-005',
            owner: owner1._id,
            currentJockey: jockey2._id,
            status: 'Active',
            totalRaces: 22,
            totalWins: 9,
            rankCounts: { rank1: 9, rank2: 5, rank3: 4, others: 4 },
            speedRating: 68,
            staminaRating: 68,
            preferredDistanceM: 1800,
        },
        {
            name: 'Bông Tuyết',
            breed: 'Mustang',
            color: 'Grey',
            gender: 'Filly',
            dateOfBirth: new Date('2022-02-14'),
            weightKg: 420,
            heightCm: 156,
            registrationNumber: 'REG-ADD-006',
            owner: owner2._id,
            currentJockey: jockey1._id,
            status: 'Active',
            totalRaces: 12,
            totalWins: 4,
            rankCounts: { rank1: 4, rank2: 3, rank3: 3, others: 2 },
            speedRating: 60,
            staminaRating: 62,
            preferredDistanceM: 1500,
        },
        {
            name: 'Lửa Phục Hận',
            breed: 'Thoroughbred',
            color: 'Black',
            gender: 'Stallion',
            dateOfBirth: new Date('2018-08-25'),
            weightKg: 495,
            heightCm: 168,
            registrationNumber: 'REG-ADD-007',
            owner: owner1._id,
            status: 'Active',
            totalRaces: 24,
            totalWins: 11,
            rankCounts: { rank1: 11, rank2: 6, rank3: 4, others: 3 },
            speedRating: 75,
            staminaRating: 70,
            preferredDistanceM: 1600,
        },
        {
            name: 'Sương Nguyên',
            breed: 'Arabian',
            color: 'Grey',
            gender: 'Mare',
            dateOfBirth: new Date('2019-11-05'),
            weightKg: 440,
            heightCm: 162,
            registrationNumber: 'REG-ADD-008',
            owner: owner2._id,
            currentJockey: jockey2._id,
            status: 'Active',
            totalRaces: 16,
            totalWins: 6,
            rankCounts: { rank1: 6, rank2: 4, rank3: 3, others: 3 },
            speedRating: 63,
            staminaRating: 68,
            preferredDistanceM: 1700,
        },
        {
            name: 'Kỵ Sĩ Đen',
            breed: 'Quarter Horse',
            color: 'Black',
            gender: 'Gelding',
            dateOfBirth: new Date('2020-01-12'),
            weightKg: 485,
            heightCm: 167,
            registrationNumber: 'REG-ADD-009',
            owner: owner1._id,
            currentJockey: jockey1._id,
            status: 'Active',
            totalRaces: 19,
            totalWins: 7,
            rankCounts: { rank1: 7, rank2: 5, rank3: 4, others: 3 },
            speedRating: 70,
            staminaRating: 65,
            preferredDistanceM: 1500,
        },
        {
            name: 'Cơn Sốc',
            breed: 'Standardbred',
            color: 'Bay',
            gender: 'Colt',
            dateOfBirth: new Date('2021-09-30'),
            weightKg: 460,
            heightCm: 164,
            registrationNumber: 'REG-ADD-010',
            owner: owner2._id,
            status: 'Active',
            totalRaces: 10,
            totalWins: 3,
            rankCounts: { rank1: 3, rank2: 2, rank3: 2, others: 3 },
            speedRating: 58,
            staminaRating: 60,
            preferredDistanceM: 1400,
        },
    ];

    const createdHorses = await Horse.insertMany(horsesData);
    console.log(`✓ Successfully added ${createdHorses.length} horses`);
    console.log('\nHorses added:');
    createdHorses.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.name} - ${h.totalWins}/${h.totalRaces} wins, Status: ${h.status}`);
    });

    await mongoose.disconnect();
};

addHorses().catch(async (err) => {
    console.error('Add horses failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
