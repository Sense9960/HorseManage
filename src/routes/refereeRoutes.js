import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    listMyRaces,
    getRace,
    decideRegistration,
    submitResults,
    previewSimulation,
    autoFinalize,
    listPendingRegistrations,
    addPenalty,
    removePenalty,
    editResults,
} from '../controllers/refereeController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.REFEREE));

router.get('/races', listMyRaces);
router.get('/pending-registrations', listPendingRegistrations);
router.get('/races/:id', getRace);
router.patch('/races/:id/registrations/:regId', decideRegistration);
router.post('/races/:id/registrations/:regId/penalty', addPenalty);
router.delete('/races/:id/registrations/:regId/penalty/:penaltyId', removePenalty);
router.post('/races/:id/results', submitResults);
router.patch('/races/:id/results', editResults);
router.get('/races/:id/simulate', previewSimulation);
router.post('/races/:id/auto-finalize', autoFinalize);

export default router;
