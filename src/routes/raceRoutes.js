import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { listPublicRaces, getPublicRaceDetail } from '../controllers/raceController.js';

const router = express.Router();

// Chỉ cần đăng nhập — KHÔNG authorize role. Mọi role (Admin/Owner/Jockey/
// Referee/EndUser) đều xem được danh sách race + bảng xếp hạng.
router.use(authenticate);

router.get('/', listPublicRaces);
router.get('/:id', getPublicRaceDetail);

export default router;
