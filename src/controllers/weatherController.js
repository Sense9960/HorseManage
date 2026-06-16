import {
    searchPlaces,
    getCurrentWeather,
    getForecast,
    getForecastForDate,
} from '../services/weatherService.js';

/** GET /api/weather/places?q=Saigon — search địa điểm để admin chọn khi tạo race. */
export const searchWeatherPlaces = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || !String(q).trim()) {
            return res.status(400).send({ status: 'Error', message: 'Query q là bắt buộc' });
        }
        const places = await searchPlaces(String(q).trim());
        return res.status(200).send({ status: 'Success', message: 'Kết quả tìm kiếm', data: places });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

/** GET /api/weather/current?lat=10.78&lng=106.69 — thời tiết hiện tại. */
export const getCurrent = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).send({ status: 'Error', message: 'lat và lng (số) là bắt buộc' });
        }
        const data = await getCurrentWeather({ lat, lng });
        return res.status(200).send({ status: 'Success', message: 'Thời tiết hiện tại', data });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

/** GET /api/weather/forecast?lat=&lng= — 5 ngày, mỗi 3 giờ. */
export const getForecastEndpoint = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).send({ status: 'Error', message: 'lat và lng (số) là bắt buộc' });
        }
        const data = await getForecast({ lat, lng });
        return res.status(200).send({ status: 'Success', message: 'Forecast 5 ngày', data });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

/** GET /api/weather/forecast-for-date?lat=&lng=&date=2026-06-20T08:00:00Z. */
export const getForecastForRaceDate = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const { date } = req.query;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !date) {
            return res.status(400).send({ status: 'Error', message: 'lat, lng, date là bắt buộc' });
        }
        const data = await getForecastForDate({ lat, lng, date });
        return res.status(200).send({ status: 'Success', message: 'Thời tiết ước tính cho ngày đua', data });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};
