import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
    searchWeatherPlaces,
    getCurrent,
    getForecastEndpoint,
    getForecastForRaceDate,
} from '../controllers/weatherController.js';

const router = express.Router();

// Auth bắt buộc để tránh OpenWeatherMap quota bị abuse public. Mọi user
// đã login đều xem được — không restrict theo role.
router.use(authenticate);

router.get('/places', searchWeatherPlaces);
router.get('/current', getCurrent);
router.get('/forecast', getForecastEndpoint);
router.get('/forecast-for-date', getForecastForRaceDate);

export default router;
