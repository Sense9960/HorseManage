/**
 * OpenWeatherMap integration.
 *
 * Dùng cho:
 *   - Search địa điểm + hiện thời tiết khi admin tạo race
 *   - Hiện thời tiết hiện tại của race đang diễn ra
 *   - Forecast 5 ngày để dự đoán điều kiện đua
 *
 * Free tier: 60 calls/phút, 1M calls/tháng. Đủ thoải mái cho dự án nhỏ.
 * Docs: https://openweathermap.org/api
 */

const OWM_KEY = process.env.OPENWEATHER_API_KEY;
const BASE = 'https://api.openweathermap.org';

if (!OWM_KEY) {
    console.warn('OPENWEATHER_API_KEY chưa được set — endpoint /api/weather sẽ throw khi gọi.');
}

/**
 * Cache đơn giản: key là URL, value là { data, expiresAt }. Free tier rate
 * limit là 60 calls/phút — cache 5 phút để cùng 1 city/coords không hammer API.
 */
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const cachedFetch = async (url) => {
    const now = Date.now();
    const hit = cache.get(url);
    if (hit && hit.expiresAt > now) return hit.data;

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`OpenWeatherMap ${res.status}: ${text || res.statusText}`);
        err.statusCode = res.status;
        throw err;
    }
    const data = await res.json();
    cache.set(url, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
};

const assertKey = () => {
    if (!OWM_KEY) throw new Error('OPENWEATHER_API_KEY chưa được set trong env');
};

/**
 * Search địa điểm theo tên (vd: "Phu Tho", "Sai Gon"). Trả về tối đa 5 ứng
 * viên kèm lat/lng để frontend cho admin chọn đúng địa điểm tổ chức race.
 */
export const searchPlaces = async (query, limit = 5) => {
    assertKey();
    const url = `${BASE}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=${limit}&appid=${OWM_KEY}`;
    const data = await cachedFetch(url);
    return data.map((p) => ({
        name: p.name,
        country: p.country,
        state: p.state || null,
        lat: p.lat,
        lng: p.lon,
        localNames: p.local_names || {},
    }));
};

/**
 * Thời tiết hiện tại tại 1 toạ độ. Trả về dạng phẳng dễ hiển thị (không
 * trả raw OpenWeatherMap response).
 */
export const getCurrentWeather = async ({ lat, lng }) => {
    assertKey();
    const url = `${BASE}/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric&lang=vi`;
    const raw = await cachedFetch(url);
    return shapeWeather(raw);
};

/**
 * Forecast 5 ngày, mỗi 3 giờ. Frontend có thể filter theo ngày race.
 * OpenWeatherMap free tier không cho daily — phải xử lý 3-hour slots.
 */
export const getForecast = async ({ lat, lng }) => {
    assertKey();
    const url = `${BASE}/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric&lang=vi&cnt=40`;
    const raw = await cachedFetch(url);
    return {
        city: {
            name: raw.city?.name,
            country: raw.city?.country,
            lat: raw.city?.coord?.lat,
            lng: raw.city?.coord?.lon,
            timezoneSec: raw.city?.timezone,
            sunrise: raw.city?.sunrise ? new Date(raw.city.sunrise * 1000) : null,
            sunset: raw.city?.sunset ? new Date(raw.city.sunset * 1000) : null,
        },
        slots: (raw.list || []).map(shapeWeather),
    };
};

/**
 * Lấy forecast cho 1 ngày race cụ thể — chọn slot 3-giờ gần nhất với raceDate.
 * Trả null nếu raceDate quá xa quá tầm forecast 5 ngày.
 */
export const getForecastForDate = async ({ lat, lng, date }) => {
    const target = new Date(date).getTime();
    const { city, slots } = await getForecast({ lat, lng });
    if (!slots.length) return { city, forecast: null, note: 'Không có forecast' };

    // Chọn slot có |slot.time - target| nhỏ nhất
    let best = slots[0];
    let bestDelta = Math.abs(new Date(best.time).getTime() - target);
    for (const slot of slots) {
        const delta = Math.abs(new Date(slot.time).getTime() - target);
        if (delta < bestDelta) {
            best = slot;
            bestDelta = delta;
        }
    }
    // OpenWeatherMap forecast = 5 ngày → 432000000ms. Nếu raceDate > 5 ngày
    // sau tất cả slot, đánh dấu out-of-range.
    const outOfRange = bestDelta > 5 * 24 * 60 * 60 * 1000;
    return {
        city,
        forecast: outOfRange ? null : best,
        note: outOfRange ? 'raceDate quá 5 ngày — vượt phạm vi free forecast' : 'OK',
    };
};

/**
 * Chuyển raw OpenWeatherMap object về shape phẳng FE dễ dùng.
 */
const shapeWeather = (raw) => {
    const w = raw.weather?.[0] || {};
    return {
        time: raw.dt ? new Date(raw.dt * 1000) : null,
        tempC: raw.main?.temp,
        feelsLikeC: raw.main?.feels_like,
        humidity: raw.main?.humidity,
        pressure: raw.main?.pressure,
        windSpeedMs: raw.wind?.speed,
        windDeg: raw.wind?.deg,
        cloudPercent: raw.clouds?.all,
        rainMm3h: raw.rain?.['3h'] || raw.rain?.['1h'] || 0,
        description: w.description,
        main: w.main,
        iconUrl: w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : null,
        location: raw.name ? { name: raw.name, country: raw.sys?.country } : undefined,
    };
};
