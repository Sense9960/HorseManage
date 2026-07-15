import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { ROLES } from '../models/User.js';
import {
    updateProfile,
    listJockeys,
    followJockey,
    unfollowJockey,
    listFollowing,
    listAvailableGifts,
    redeemGift,
    listMyRedemptions,
    listPredictableRaces,
    listMyRaceHistory,
    placePrediction,
    listMyPredictions,
    dailyCheckIn,
    getCheckInStatus,
} from '../controllers/endUserController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.END_USER));

router.put('/profile', updateProfile);

router.get('/check-in', getCheckInStatus);
router.post('/check-in', dailyCheckIn);
router.get('/jockeys', listJockeys);
router.get('/following', listFollowing);
router.post('/follow/:jockeyId', followJockey);
router.delete('/follow/:jockeyId', unfollowJockey);

router.get('/gifts', listAvailableGifts);
router.post('/gifts/:id/redeem', redeemGift);
router.get('/redemptions', listMyRedemptions);

router.get('/races', listPredictableRaces);
// Đặt trước '/races/:raceId/predict' để 'history' không bị bắt như :raceId.
router.get('/races/history', listMyRaceHistory);
router.post('/races/:raceId/predict', placePrediction);
router.get('/predictions', listMyPredictions);

export default router;
