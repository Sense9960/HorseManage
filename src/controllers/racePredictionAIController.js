/**
 * REST endpoints cho chatbox AI dự đoán đua ngựa (DeepSeek).
 * Logic tính điểm + gọi DeepSeek nằm ở services/racePredictionAIService.js —
 * controller chỉ lo request/response shape, giống các controller khác trong repo.
 */
import { getRaceAIPrediction, chatAboutRace } from '../services/racePredictionAIService.js';

/** GET /api/races/:id/ai-predict — bảng dự đoán % thắng + phân tích AI cho 1 race. */
export const getAIPrediction = async (req, res) => {
    try {
        const data = await getRaceAIPrediction(req.params.id);
        return res.status(200).send({ status: 'Success', message: 'Dự đoán AI cho race', data });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};

/** POST /api/races/:id/ai-chat — hỏi-đáp với AI về race, neo vào bảng dự đoán của race đó. */
export const postAIChat = async (req, res) => {
    try {
        const { message, history } = req.body || {};
        const data = await chatAboutRace(req.params.id, message, history);
        return res.status(200).send({ status: 'Success', message: 'Phản hồi từ AI', data });
    } catch (err) {
        return res.status(err.statusCode || 500).send({ status: 'Error', message: err.message });
    }
};
