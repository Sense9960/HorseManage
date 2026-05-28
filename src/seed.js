import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { User, Admin, Jockey, OwnerHorse, Referee, EndUser, ROLES } from './models/User.js';
import Horse from './models/Horse.js';
import Race from './models/Race.js';
import Notification from './models/Notification.js';
import { Gift, GiftRedemption } from './models/Gift.js';
import { Wallet, WalletTransaction } from './models/Wallet.js';
import Prediction from './models/Prediction.js';
import { credit } from './services/walletService.js';
import { WALLET_TX_TYPES } from './models/Wallet.js';

const seed = async () => {
    await connectDB();

    console.log('Wiping existing data and stale indexes...');
    for (const coll of [
        User.collection, Horse.collection, Race.collection,
        Notification.collection, Wallet.collection, WalletTransaction.collection,
        Gift.collection, GiftRedemption.collection, Prediction.collection,
    ]) {
        try { await coll.drop(); } catch (e) { if (e.codeName !== 'NamespaceNotFound') throw e; }
    }
    await Promise.all([
        User.syncIndexes(), Horse.syncIndexes(), Race.syncIndexes(),
        Notification.syncIndexes(), Wallet.syncIndexes(), WalletTransaction.syncIndexes(),
        Gift.syncIndexes(), GiftRedemption.syncIndexes(), Prediction.syncIndexes(),
    ]);

    console.log('Seeding users...');
    const admin = await Admin.create({
        username: 'admin',
        email: 'admin@horse.test',
        password: 'admin123',
        fullName: 'System Admin',
        role: ROLES.ADMIN,
        isVerified: true,
        department: 'System',
    });

    const jockey1 = await Jockey.create({
        username: 'jockey_alex',
        email: 'alex@horse.test',
        password: 'jockey123',
        fullName: 'Alex Nguyen',
        role: ROLES.JOCKEY,
        isVerified: true,
        dateOfBirth: new Date('2000-05-10'),
        gender: 'Male',
        licenseNumber: 'JKY-0001',
        experienceYears: 4,
        weightKg: 55,
        heightCm: 168,
        totalRaces: 12,
        totalWins: 3,
        rating: 25,
        pricePerRace: 500_000,
    });

    const jockey2 = await Jockey.create({
        username: 'jockey_mai',
        email: 'mai@horse.test',
        password: 'jockey123',
        fullName: 'Mai Tran',
        role: ROLES.JOCKEY,
        isVerified: true,
        dateOfBirth: new Date('2001-09-22'),
        gender: 'Female',
        licenseNumber: 'JKY-0002',
        experienceYears: 3,
        weightKg: 50,
        heightCm: 162,
        totalRaces: 8,
        totalWins: 2,
        rating: 25,
        pricePerRace: 400_000,
    });

    const owner1 = await OwnerHorse.create({
        username: 'owner_blackstar',
        email: 'owner1@horse.test',
        password: 'owner123',
        fullName: 'Black Star Stable',
        role: ROLES.OWNER_HORSE,
        isVerified: true,
        companyName: 'Black Star Stable Co.',
        taxCode: 'TAX-001',
        stableName: 'Black Star Stable',
        stableAddress: '12 Race Street, Saigon',
        silks: { primaryColor: 'Black', secondaryColor: 'Gold', pattern: 'Stripes' },
    });

    const owner2 = await OwnerHorse.create({
        username: 'owner_redmoon',
        email: 'owner2@horse.test',
        password: 'owner123',
        fullName: 'Red Moon Stable',
        role: ROLES.OWNER_HORSE,
        isVerified: true,
        companyName: 'Red Moon Stable Co.',
        taxCode: 'TAX-002',
        stableName: 'Red Moon Stable',
        stableAddress: '88 Derby Road, Hanoi',
        silks: { primaryColor: 'Red', secondaryColor: 'White', pattern: 'Diamonds' },
    });

    const referee1 = await Referee.create({
        username: 'referee_kien',
        email: 'referee@horse.test',
        password: 'ref12345',
        fullName: 'Kien Pham',
        role: ROLES.REFEREE,
        isVerified: true,
        refereeCertNumber: 'REF-0001',
        specialization: 'Flat racing',
    });

    const enduser1 = await EndUser.create({
        username: 'fan_tom',
        email: 'tom@horse.test',
        password: 'fan12345',
        fullName: 'Tom Fan',
        role: ROLES.END_USER,
        isVerified: true,
        membershipLevel: 'Silver',
        points: 500,
        favoriteJockeys: [jockey1._id],
    });

    const enduser2 = await EndUser.create({
        username: 'fan_jane',
        email: 'jane@horse.test',
        password: 'fan12345',
        fullName: 'Jane Watcher',
        role: ROLES.END_USER,
        isVerified: true,
        membershipLevel: 'Bronze',
        points: 30,
    });

    console.log('Seeding horses...');
    const horses = await Horse.insertMany([
        {
            name: 'Thunder Bolt',
            breed: 'Thoroughbred',
            color: 'Bay',
            gender: 'Stallion',
            dateOfBirth: new Date('2019-03-15'),
            weightKg: 480,
            heightCm: 165,
            registrationNumber: 'REG-1001',
            owner: owner1._id,
            currentJockey: jockey1._id,
            status: 'Active',
            totalRaces: 10,
            totalWins: 3,
            // Sprint star — explosive short-distance specialist
            speedRating: 85,
            staminaRating: 55,
            preferredDistanceM: 1200,
        },
        {
            name: 'Midnight Star',
            breed: 'Arabian',
            color: 'Black',
            gender: 'Mare',
            dateOfBirth: new Date('2020-07-01'),
            weightKg: 450,
            heightCm: 160,
            registrationNumber: 'REG-1002',
            owner: owner1._id,
            status: 'Active',
            totalRaces: 5,
            totalWins: 1,
            speedRating: 65,
            staminaRating: 65,
            preferredDistanceM: 1600,
        },
        {
            name: 'Red Comet',
            breed: 'Quarter Horse',
            color: 'Chestnut',
            gender: 'Gelding',
            dateOfBirth: new Date('2018-11-20'),
            weightKg: 500,
            heightCm: 170,
            registrationNumber: 'REG-1003',
            owner: owner2._id,
            currentJockey: jockey2._id,
            status: 'Active',
            totalRaces: 15,
            totalWins: 5,
            // Endurance specialist — long-distance powerhouse
            speedRating: 60,
            staminaRating: 85,
            preferredDistanceM: 2400,
        },
        {
            name: 'Snow Dancer',
            breed: 'Andalusian',
            color: 'Grey',
            gender: 'Mare',
            dateOfBirth: new Date('2021-04-10'),
            weightKg: 430,
            heightCm: 158,
            registrationNumber: 'REG-1004',
            owner: owner2._id,
            status: 'Resting',
            totalRaces: 2,
            totalWins: 0,
            speedRating: 55,
            staminaRating: 55,
            preferredDistanceM: 1600,
        },
        {
            name: 'Iron Hoof',
            breed: 'Thoroughbred',
            color: 'Brown',
            gender: 'Stallion',
            dateOfBirth: new Date('2017-06-30'),
            weightKg: 510,
            heightCm: 172,
            registrationNumber: 'REG-1005',
            owner: owner1._id,
            status: 'Injured',
            totalRaces: 20,
            totalWins: 6,
            speedRating: 75,
            staminaRating: 60,
            preferredDistanceM: 1400,
        },
    ]);

    console.log('Seeding races...');
    const race = await Race.create({
        name: 'Saigon Spring Derby 2026',
        raceDate: new Date('2026-06-15T08:00:00Z'),
        location: 'Phu Tho Racecourse, Saigon',
        distanceM: 1600,
        status: 'Open',
        referee: referee1._id,
        prizeMoney: 10_000_000,
        entryFee: 300_000,
        addEntryFeeToPrize: true,
        registrations: [
            {
                horse: horses[0]._id,
                jockey: jockey1._id,
                owner: owner1._id,
                approvalStatus: 'Approved',
                hireFee: 500_000,
                // Alex already accepted — referee can approve right away
                jockeyResponse: { status: 'Accepted', respondedAt: new Date() },
                oddTop1: 4.5,
                oddTop2: 2.2,
                oddTop3: 1.4,
            },
            {
                horse: horses[2]._id,
                jockey: jockey2._id,
                owner: owner2._id,
                approvalStatus: 'Pending',
                hireFee: 400_000,
                // Mai hasn't responded — test the jockey accept/decline flow
                jockeyResponse: { status: 'Pending' },
                oddTop1: 6.0,
                oddTop2: 3.0,
                oddTop3: 1.8,
            },
        ],
    });

    console.log('Seeding sample prediction...');
    const approvedReg = race.registrations[0];
    const stake = 100;
    const odds = approvedReg.oddTop1;
    await Prediction.create({
        user: enduser1._id,
        race: race._id,
        registration: approvedReg._id,
        predictionType: 'Top1',
        stake,
        oddsAtPlacement: odds,
        potentialPayout: Math.round(stake * odds),
    });
    await User.updateOne({ _id: enduser1._id }, { $inc: { points: -stake } });

    console.log('Seeding wallets (preload tiền cho owner để trả hireFee)...');
    await credit(owner1._id, 5_000_000, { type: WALLET_TX_TYPES.DEPOSIT, description: 'Seed initial balance', notifyUser: false });
    await credit(owner2._id, 5_000_000, { type: WALLET_TX_TYPES.DEPOSIT, description: 'Seed initial balance', notifyUser: false });

    console.log('Seeding gifts...');
    await Gift.insertMany([
        { name: 'Phiếu giảm giá vé xem đua 50%', description: 'Áp dụng cho 1 vé bất kỳ', pointsCost: 100, quantity: 50, createdBy: admin._id },
        { name: 'Áo phông HorseManage', description: 'Size M/L/XL', pointsCost: 300, quantity: 20, createdBy: admin._id },
        { name: 'Bộ ấm trà sứ', description: 'Phần thưởng VIP', pointsCost: 800, quantity: 5, createdBy: admin._id },
    ]);

    console.log('\n========================================');
    console.log('Seed completed.');
    console.log('========================================');
    console.log(`Admin     : 1  (admin@horse.test / admin123)`);
    console.log(`Jockey    : 2  (alex@horse.test, mai@horse.test / jockey123)`);
    console.log(`OwnerHorse: 2  (owner1@horse.test, owner2@horse.test / owner123)`);
    console.log(`Referee   : 1  (referee@horse.test / ref12345)`);
    console.log(`EndUser   : 2  (tom@horse.test, jane@horse.test / fan12345)`);
    console.log(`Horse     : ${horses.length}`);
    console.log(`Race      : 1  (${race.name}, 1 Approved + 1 Pending registration, odds set)`);
    console.log(`Gift      : 3  (100/300/800 điểm; Tom có 400 điểm sau khi cược, Jane có 30)`);
    console.log(`Prediction: 1  (Tom đặt 100đ Top1 vào Thunder Bolt, odds 4.5x = thưởng 450)`);
    console.log('========================================\n');

    await mongoose.disconnect();
};

seed().catch(async (err) => {
    console.error('Seed failed:', err);
    await mongoose.disconnect();
    process.exit(1);
});
