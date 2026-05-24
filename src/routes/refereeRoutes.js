import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    listMyRaces,
    getRace,
    decideRegistration,
    submitResults,
} from '../controllers/refereeController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.REFEREE));

router.get('/races', listMyRaces);
router.get('/races/:id', getRace);
router.patch('/races/:id/registrations/:regId', decideRegistration);
router.post('/races/:id/results', submitResults);

export default router;
