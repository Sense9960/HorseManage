import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    listUsers,
    getUser,
    updateUserStatus,
    approveJockeyLicense,
    deleteUser,
} from '../controllers/adminController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/jockeys/:id/license', approveJockeyLicense);
router.delete('/users/:id', deleteUser);

export default router;
