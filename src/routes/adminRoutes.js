import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    listUsers,
    getUser,
    updateUserStatus,
    approveJockeyLicense,
    deleteUser,
    createRace,
    listRaces,
} from '../controllers/adminController.js';
import { listPendingWithdrawals, decideWithdraw } from '../controllers/walletController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/jockeys/:id/license', approveJockeyLicense);
router.delete('/users/:id', deleteUser);

router.post('/races', createRace);
router.get('/races', listRaces);

router.get('/withdrawals', listPendingWithdrawals);
router.patch('/withdrawals/:txId', decideWithdraw);

export default router;
