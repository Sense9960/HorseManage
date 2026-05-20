import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    getProfile,
    listJockeys,
    followJockey,
    unfollowJockey,
    listFollowing,
} from '../controllers/endUserController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.END_USER));

router.get('/profile', getProfile);
router.get('/jockeys', listJockeys);
router.get('/following', listFollowing);
router.post('/follow/:jockeyId', followJockey);
router.delete('/follow/:jockeyId', unfollowJockey);

export default router;
