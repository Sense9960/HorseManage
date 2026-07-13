import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getRaceLeaderboard, listRaces } from '../controllers/raceController.js';
import { getAIPrediction, postAIChat } from '../controllers/racePredictionAIController.js';
import { aiLimiter } from '../middlewares/rateLimit.js';

const router = express.Router();

// Auth-any-role: bất kỳ user đã login đều xem được leaderboard.
// Không restrict theo role để admin, owner, jockey, referee, enduser đều
// dùng chung 1 endpoint — tránh duplicate logic ở 5 endpoint role-specific.
router.use(authenticate);

router.get('/', listRaces);
router.get('/:id/leaderboard', getRaceLeaderboard);
// Endpoint AI gọi LLM trả phí → siết rate limit riêng (aiLimiter) trên nền
// apiLimiter chung đã áp ở app.js.
router.get('/:id/ai-predict', aiLimiter, getAIPrediction);
router.post('/:id/ai-chat', aiLimiter, postAIChat);

export default router;
