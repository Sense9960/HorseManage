import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getRaceLeaderboard } from '../controllers/raceController.js';

const router = express.Router();

// Auth-any-role: bất kỳ user đã login đều xem được leaderboard.
// Không restrict theo role để admin, owner, jockey, referee, enduser đều
// dùng chung 1 endpoint — tránh duplicate logic ở 5 endpoint role-specific.
router.use(authenticate);

router.get('/:id/leaderboard', getRaceLeaderboard);

export default router;
