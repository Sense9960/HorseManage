import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getRaceLeaderboard, listRaces } from '../controllers/raceController.js';
import { getAIPrediction, postAIChat } from '../controllers/racePredictionAIController.js';

const router = express.Router();

// Auth-any-role: bất kỳ user đã login đều xem được leaderboard.
// Không restrict theo role để admin, owner, jockey, referee, enduser đều
// dùng chung 1 endpoint — tránh duplicate logic ở 5 endpoint role-specific.
router.use(authenticate);

router.get('/', listRaces);
router.get('/:id/leaderboard', getRaceLeaderboard);
router.get('/:id/ai-predict', getAIPrediction);
router.post('/:id/ai-chat', postAIChat);

export default router;
