import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
    getMyWallet,
    listMyTransactions,
    createDeposit,
    createWithdraw,
    sepayWebhook,
} from '../controllers/walletController.js';
import { authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';

const userRouter = express.Router();
userRouter.use(authenticate, authorize(ROLES.OWNER_HORSE, ROLES.JOCKEY));
userRouter.get('/', getMyWallet);
userRouter.get('/transactions', listMyTransactions);
userRouter.post('/deposit', createDeposit);
userRouter.post('/withdraw', createWithdraw);

const webhookRouter = express.Router();
webhookRouter.post('/webhook', sepayWebhook);

export { userRouter as walletRouter, webhookRouter as sepayRouter };
