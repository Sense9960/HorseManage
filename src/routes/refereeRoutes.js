import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
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
    cancelPenalty,
    editResults,
    confirmResults,
    rejectAppeal,
    listPendingAppeals,
} from '../controllers/refereeController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.REFEREE));

router.get('/races', listMyRaces);
router.get('/pending-registrations', listPendingRegistrations);
router.get('/pending-appeals', listPendingAppeals);
router.get('/races/:id', getRace);
router.patch('/races/:id/registrations/:regId', decideRegistration);
router.post('/races/:id/registrations/:regId/penalty', addPenalty);
// Soft cancel — giữ record + cancelReason cho audit. Endpoint cũ DELETE giữ
// lại path để FE đang dùng không break, nhưng giờ làm soft-cancel chứ không
// xoá hẳn nữa.
router.delete('/races/:id/registrations/:regId/penalty/:penaltyId', cancelPenalty);
router.patch('/races/:id/registrations/:regId/penalty/:penaltyId/appeal/:appealId/reject', rejectAppeal);
router.post('/races/:id/results', submitResults);
router.patch('/races/:id/results', editResults);
router.post('/races/:id/confirm-results', confirmResults);
router.get('/races/:id/simulate', previewSimulation);
router.post('/races/:id/auto-finalize', autoFinalize);

export default router;
