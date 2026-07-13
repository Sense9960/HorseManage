/**
 * DeepSeek chat completion wrapper — OpenAI-compatible REST API.
 * Docs: https://api-docs.deepseek.com/
 *
 * LLM chỉ dùng để "viết văn" — mọi con số (tỷ lệ thắng, % dự đoán) phải được
 * tính toán deterministic trước ở racePredictionAIService.js rồi mới đưa vào
 * prompt. Không bao giờ để model tự bịa số liệu.
 */

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 20_000;

if (!DEEPSEEK_KEY) {
    console.warn('DEEPSEEK_API_KEY chưa được set — các endpoint AI prediction sẽ throw khi gọi.');
}

const assertKey = () => {
    if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY chưa được set trong env');
};

/**
 * messages theo chuẩn OpenAI: [{ role: 'system'|'user'|'assistant', content }].
 * Trả về text thuần (đã trim) của assistant reply.
 */
export const chatCompletion = async (messages, { temperature = 0.4, maxTokens = 700 } = {}) => {
    assertKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
        res = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${DEEPSEEK_KEY}`,
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages,
                temperature,
                max_tokens: maxTokens,
            }),
            signal: controller.signal,
        });
    } catch (e) {
        const err = new Error(
            e.name === 'AbortError' ? 'DeepSeek không phản hồi kịp thời (timeout)' : `Không gọi được DeepSeek: ${e.message}`
        );
        err.statusCode = 502;
        throw err;
    } finally {
        clearTimeout(timeout);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`DeepSeek ${res.status}: ${text || res.statusText}`);
        // 401/403 = key sai, 429 = quota, 5xx = DeepSeek down — tất cả đều là
        // lỗi phía "upstream", không phải lỗi request của client → 502.
        err.statusCode = res.status === 400 ? 400 : 502;
        throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        const err = new Error('DeepSeek trả về response rỗng');
        err.statusCode = 502;
        throw err;
    }
    return content.trim();
};
