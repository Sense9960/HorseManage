import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    getProfile,
    listJockeys,
    followJockey,
    unfollowJockey,
    listFollowing,
    listAvailableGifts,
    redeemGift,
    listMyRedemptions,
    listPredictableRaces,
    placePrediction,
    listMyPredictions,
} from '../controllers/endUserController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.END_USER));

router.get('/profile', getProfile);
router.get('/jockeys', listJockeys);
router.get('/following', listFollowing);
router.post('/follow/:jockeyId', followJockey);
router.delete('/follow/:jockeyId', unfollowJockey);

router.get('/gifts', listAvailableGifts);
router.post('/gifts/:id/redeem', redeemGift);
router.get('/redemptions', listMyRedemptions);

router.get('/races', listPredictableRaces);
router.post('/races/:raceId/predict', placePrediction);
router.get('/predictions', listMyPredictions);

export default router;
