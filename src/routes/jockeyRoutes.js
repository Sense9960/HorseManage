import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import { getProfile, updateProfile, listMyHorses } from '../controllers/jockeyController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.JOCKEY));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/horses', listMyHorses);

export default router;
