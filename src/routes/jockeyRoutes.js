import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    updateProfile,
    listMyHorses,
    getMyHorseDetail,
    listRideOffers,
    respondToRideOffer,
    requestLicense,
    getLicenseStatus,
} from '../controllers/jockeyController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.JOCKEY));

router.put('/profile', updateProfile);

router.get('/license', getLicenseStatus);
router.post('/license/request', requestLicense);
router.get('/horses', listMyHorses);
router.get('/horses/:horseId', getMyHorseDetail);
router.get('/ride-offers', listRideOffers);
router.patch('/ride-offers/:raceId/:regId', respondToRideOffer);

export default router;
