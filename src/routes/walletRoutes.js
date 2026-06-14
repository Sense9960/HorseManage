import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
    getMyWallet,
    listMyTransactions,
    createDeposit,
    createWithdraw,
    vnpayReturn,
    vnpayIpn,
} from '../controllers/walletController.js';
import { authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';

// User-facing wallet routes (Owner/Jockey)
const userRouter = express.Router();
userRouter.use(authenticate, authorize(ROLES.OWNER_HORSE, ROLES.JOCKEY));
userRouter.get('/', getMyWallet);
userRouter.get('/transactions', listMyTransactions);
userRouter.post('/deposit', createDeposit);
userRouter.post('/withdraw', createWithdraw);

// VNPay callback routes — KHÔNG auth (VNPay không gửi JWT). Bảo mật bằng
// chữ ký HMAC-SHA512 trong query string, verify ở controller.
const vnpayRouter = express.Router();
vnpayRouter.get('/return', vnpayReturn);   // browser redirect sau khi user thanh toán xong
vnpayRouter.get('/ipn', vnpayIpn);         // server-to-server, là source of truth để credit ví

export { userRouter as walletRouter, vnpayRouter };
