import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { listMine, markRead, markAllRead } from '../controllers/notificationController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', listMine);
router.patch('/:id/read', markRead);
router.post('/mark-all-read', markAllRead);

export default router;
