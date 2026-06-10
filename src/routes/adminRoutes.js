import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    listUsers,
    getUser,
    updateUserStatus,
    approveJockeyLicense,
    listPendingJockeyLicenses,
    deleteUser,
    createUser,
    updateUser,
    resetUserPassword,
    changeUserRole,
    createRace,
    listRaces,
    getRaceDetail,
    setRaceOdds,
    resettleRacePredictions,
    adminListHorses,
    adminUpdateHorseStatus,
    adminDeleteHorse,
    createGift,
    listGifts,
    updateGift,
    deleteGift,
    listRedemptions,
    markRedemptionDelivered,
} from '../controllers/adminController.js';
import { listPendingWithdrawals, decideWithdraw } from '../controllers/walletController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/role', changeUserRole);
router.post('/users/:id/reset-password', resetUserPassword);
router.get('/jockeys/pending-licenses', listPendingJockeyLicenses);
router.patch('/jockeys/:id/license', approveJockeyLicense);
router.delete('/users/:id', deleteUser);

router.post('/races', createRace);
router.get('/races', listRaces);
router.get('/races/:id', getRaceDetail);
router.patch('/races/:id/odds', setRaceOdds);
router.post('/races/:id/resettle-predictions', resettleRacePredictions);

router.get('/horses', adminListHorses);
router.patch('/horses/:id/status', adminUpdateHorseStatus);
router.delete('/horses/:id', adminDeleteHorse);

router.post('/gifts', createGift);
router.get('/gifts', listGifts);
router.patch('/gifts/:id', updateGift);
router.delete('/gifts/:id', deleteGift);
router.get('/redemptions', listRedemptions);
router.patch('/redemptions/:id/deliver', markRedemptionDelivered);

router.get('/withdrawals', listPendingWithdrawals);
router.patch('/withdrawals/:txId', decideWithdraw);

export default router;
