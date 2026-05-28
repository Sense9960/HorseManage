import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    createIssue,
    listMyIssues,
    adminListIssues,
    adminUpdateIssue,
} from '../controllers/issueController.js';

const userRouter = express.Router();
userRouter.use(authenticate);
userRouter.post('/', createIssue);
userRouter.get('/mine', listMyIssues);

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize(ROLES.ADMIN));
adminRouter.get('/', adminListIssues);
adminRouter.patch('/:id', adminUpdateIssue);

export { userRouter as issueUserRouter, adminRouter as issueAdminRouter };
