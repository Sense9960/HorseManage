/**
 * AI race prediction — chấm điểm dự đoán cho từng ngựa trong 1 race, rồi nhờ
 * DeepSeek viết lời phân tích tiếng Việt dựa TRÊN các con số đã tính sẵn.
 *
 * Nguyên tắc: LLM không được tự tính % thắng — nó chỉ diễn giải bảng điểm
 * deterministic bên dưới. Nhờ vậy % dự đoán không đổi giữa các lần gọi (trừ
 * khi dữ liệu race thay đổi), và không có rủi ro model bịa số.
 *
 * Công thức (Laplace-smoothed để ngựa/jockey mới toanh — 0 trận — không bị
 * dồn về đúng 0%):
 *   horseWinRate  = (horse.totalWins + 1)  / (horse.totalRaces + 2)   — 50%
 *   jockeyWinRate = (jockey.totalWins + 1) / (jockey.totalRaces + 2)  — 30%
 *   recentForm    = podiumRate*0.5 + physicalRating*0.5              — 20%
 *     podiumRate      = (rank1+rank2+rank3 + 1) / (totalRaces + 2)
 *     physicalRating  = (speedRating + staminaRating) / 200
 * Điểm cuối được chuẩn hoá tuyến tính để tổng % dự đoán trong race = 100.
 */

import mongoose from 'mongoose';
import Race from '../models/Race.js';
import { chatCompletion } from './deepseekService.js';

// horse win-rate 40%, jockey 25%, phong độ podium 20%, thể chất (speed/stamina) 15%.
// Tách physical thành yếu tố riêng để ngựa MỚI (chưa có lịch sử) vẫn phân hoá
// theo chỉ số tiềm năng thay vì đồng đều 50% hết.
const WEIGHTS = { horse: 0.4, jockey: 0.25, form: 0.2, physical: 0.15 };

const laplaceRate = (wins = 0, races = 0) => (wins + 1) / (races + 2);

// Phong độ = tỷ lệ vào podium (top 3) gần đây. Ngựa mới → laplace về ~50%.
const recentFormScore = (horse) => {
    const races = horse.totalRaces || 0;
    const podium =
        (horse.rankCounts?.rank1 || 0) + (horse.rankCounts?.rank2 || 0) + (horse.rankCounts?.rank3 || 0);
    return laplaceRate(podium, races);
};

// Thể chất = trung bình speed+stamina, chuẩn hoá 0..1. Ngựa mới không set →
// default 50/50 = 0.5.
const physicalScore = (horse) => ((horse.speedRating ?? 50) + (horse.staminaRating ?? 50)) / 200;

/**
 * Tính bảng điểm cho 1 race đã populate horse + jockey. Chỉ tính trên
 * registration Approved — Pending/Rejected/Banned không thực sự đua.
 * Trả null nếu chưa đủ 2 ngựa Approved (không đủ để so sánh/dự đoán).
 */
export const buildPredictionTable = (race) => {
    const approved = (race.registrations || []).filter((r) => r.approvalStatus === 'Approved');
    if (approved.length < 2) return null;

    const rows = approved.map((r) => {
        const horse = r.horse || {};
        const jockey = r.jockey || {};
        const horseWinRate = laplaceRate(horse.totalWins, horse.totalRaces);
        const jockeyWinRate = laplaceRate(jockey.totalWins, jockey.totalRaces);
        const form = recentFormScore(horse);
        const physical = physicalScore(horse);
        const score =
            horseWinRate * WEIGHTS.horse +
            jockeyWinRate * WEIGHTS.jockey +
            form * WEIGHTS.form +
            physical * WEIGHTS.physical;
        return {
            registrationId: r._id,
            horse: { _id: horse._id, name: horse.name, totalWins: horse.totalWins || 0, totalRaces: horse.totalRaces || 0 },
            jockey: { _id: jockey._id, fullName: jockey.fullName, totalWins: jockey.totalWins || 0, totalRaces: jockey.totalRaces || 0 },
            horseWinRatePercent: round1(horseWinRate * 100),
            jockeyWinRatePercent: round1(jockeyWinRate * 100),
            recentFormPercent: round1(form * 100),
            physicalPercent: round1(physical * 100),
            score,
        };
    });

    const totalScore = rows.reduce((s, r) => s + r.score, 0) || 1;
    const table = rows
        .map((r) => ({ ...r, predictedWinPercent: round1((r.score / totalScore) * 100) }))
        .sort((a, b) => b.predictedWinPercent - a.predictedWinPercent);
    table.forEach((r) => delete r.score);
    return table;
};

const round1 = (n) => Math.round(n * 10) / 10;

const formatTableForPrompt = (table) =>
    table
        .map(
            (r, i) =>
                `${i + 1}. Ngựa "${r.horse.name}" (jockey ${r.jockey.fullName || 'chưa rõ'}) — dự đoán thắng ${r.predictedWinPercent}% ` +
                `[tỷ lệ thắng lịch sử ngựa ${r.horseWinRatePercent}%, tỷ lệ thắng jockey ${r.jockeyWinRatePercent}%, phong độ podium ${r.recentFormPercent}%, thể chất ${r.physicalPercent}%]`
        )
        .join('\n');

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích đua ngựa nói tiếng Việt cho ứng dụng HorseManage.
Bạn sẽ nhận một bảng số liệu ĐÃ được tính sẵn (tỷ lệ thắng lịch sử, phong độ, % dự đoán).
QUY TẮC BẮT BUỘC:
- Không được tự bịa hoặc chỉnh sửa bất kỳ con số nào ngoài bảng đã cho.
- Chỉ diễn giải, so sánh, và đưa lời khuyên dựa trên đúng các số liệu đó.
- Luôn trả lời bằng tiếng Việt, giọng văn chuyên nghiệp nhưng dễ hiểu.
- Luôn kết thúc bằng một câu miễn trừ trách nhiệm ngắn: kết quả chỉ mang tính tham khảo,
  đua ngựa có yếu tố ngẫu nhiên, không đảm bảo chính xác 100%, không khuyến khích cá cược trái phép.
- Nếu người dùng hỏi ngoài phạm vi phân tích đua ngựa của race này, hãy lịch sự từ chối và mời họ hỏi lại đúng chủ đề.`;

/**
 * Cache 3 phút theo raceId — tránh mỗi lần user mở trang chi tiết race là
 * tốn 1 lượt gọi DeepSeek (giống pattern cache của weatherService.js).
 */
const predictionCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * GET /api/races/:id/ai-predict — bảng dự đoán + phân tích AI cho 1 race.
 */
export const getRaceAIPrediction = async (raceId) => {
    if (!mongoose.isValidObjectId(raceId)) {
        const err = new Error('raceId không hợp lệ');
        err.statusCode = 400;
        throw err;
    }

    const cacheKey = String(raceId);
    const hit = predictionCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.data;

    const race = await Race.findById(raceId)
        .populate('registrations.horse', 'name totalWins totalRaces rankCounts speedRating staminaRating')
        .populate('registrations.jockey', 'fullName totalWins totalRaces rating')
        .lean();

    if (!race) {
        const err = new Error('Không tìm thấy race');
        err.statusCode = 404;
        throw err;
    }

    const table = buildPredictionTable(race);
    if (!table) {
        const err = new Error('Race chưa đủ 2 ngựa được duyệt (Approved) để dự đoán');
        err.statusCode = 400;
        throw err;
    }

    const userPrompt = `Race "${race.name}" (${race.distanceM || '?'}m, ${race.location || 'chưa rõ địa điểm'}).\nBảng dự đoán:\n${formatTableForPrompt(table)}\n\nHãy phân tích ngắn gọn: ứng viên sáng giá nhất và vì sao, 1-2 ứng viên đáng chú ý khác, và lời khuyên cho người xem.`;

    const aiAnalysis = await chatCompletion([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ]);

    const data = {
        race: { _id: race._id, name: race.name, raceDate: race.raceDate, location: race.location, distanceM: race.distanceM, status: race.status },
        predictions: table,
        aiAnalysis,
        disclaimer:
            'Dự đoán chỉ mang tính chất tham khảo, dựa trên dữ liệu lịch sử. Đua ngựa có yếu tố ngẫu nhiên và không đảm bảo chính xác 100%.',
    };
    predictionCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
};

/**
 * POST /api/races/:id/ai-chat — chatbox hỏi-đáp về 1 race, luôn "neo" câu trả
 * lời vào đúng bảng số liệu của race đó (qua system prompt) để tránh model trả
 * lời chung chung/bịa số. Stateless — client tự giữ + gửi lại `history`.
 */
export const chatAboutRace = async (raceId, message, history = []) => {
    if (!mongoose.isValidObjectId(raceId)) {
        const err = new Error('raceId không hợp lệ');
        err.statusCode = 400;
        throw err;
    }
    if (!message || !String(message).trim()) {
        const err = new Error('message là bắt buộc');
        err.statusCode = 400;
        throw err;
    }
    // Cap độ dài để chặn 1 message khổng lồ làm phồng token cost DeepSeek.
    if (String(message).trim().length > 2000) {
        const err = new Error('message quá dài (tối đa 2000 ký tự)');
        err.statusCode = 400;
        throw err;
    }

    const race = await Race.findById(raceId)
        .populate('registrations.horse', 'name totalWins totalRaces rankCounts speedRating staminaRating')
        .populate('registrations.jockey', 'fullName totalWins totalRaces rating')
        .lean();
    if (!race) {
        const err = new Error('Không tìm thấy race');
        err.statusCode = 404;
        throw err;
    }

    const table = buildPredictionTable(race);
    const tableSection = table
        ? `Bảng dự đoán (đã tính sẵn, không được sửa số):\n${formatTableForPrompt(table)}`
        : 'Race này chưa đủ ngựa Approved để tính bảng dự đoán — chỉ trả lời dựa trên thông tin race chung, không đưa ra %.';

    const contextPrompt = `Race "${race.name}" (${race.distanceM || '?'}m, ${race.location || 'chưa rõ địa điểm'}, trạng thái ${race.status}).\n${tableSection}`;

    const safeHistory = Array.isArray(history)
        ? history
              .filter((h) => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string')
              .slice(-10)
        : [];

    const aiReply = await chatCompletion([
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextPrompt}` },
        ...safeHistory,
        { role: 'user', content: String(message).trim() },
    ]);

    return {
        race: { _id: race._id, name: race.name },
        reply: aiReply,
        disclaimer: 'Dự đoán chỉ mang tính chất tham khảo, không đảm bảo chính xác 100%.',
    };
};
