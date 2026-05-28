import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    updateProfile,
    listMyHorses,
    listRideOffers,
    respondToRideOffer,
} from '../controllers/jockeyController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.JOCKEY));

router.put('/profile', updateProfile);
router.get('/horses', listMyHorses);
router.get('/ride-offers', listRideOffers);
router.patch('/ride-offers/:raceId/:regId', respondToRideOffer);

export default router;
