/**
 * Parse mốc thời gian do client gửi lên theo giờ Việt Nam (Hanoi/Bangkok,
 * UTC+7) khi chuỗi KHÔNG kèm offset.
 *
 * Vì server (Vercel) chạy ở UTC, `new Date("2026-07-20T21:00")` sẽ bị hiểu là
 * 21:00 UTC = 04:00 sáng hôm sau giờ VN → lệch 7 tiếng. Hàm này chuẩn hoá:
 *   - Chuỗi đã có offset rõ ràng ('Z' hoặc '+hh:mm' / '-hh:mm') → giữ nguyên,
 *     không ép offset (client chủ động, không đoán mò).
 *   - Chuỗi "trần" (vd "2026-07-20T21:00" hoặc "2026-07-20 21:00") → hiểu là
 *     giờ VN, gắn +07:00.
 *   - Chỉ có ngày ("2026-07-20") → 00:00 giờ VN.
 *   - Date / number → dùng nguyên (đã là mốc tuyệt đối).
 *
 * Trả về Date (có thể Invalid Date nếu input rác — caller tự check isNaN).
 */
const VN_OFFSET = '+07:00';

export const parseVnDate = (input) => {
    if (input instanceof Date || typeof input === 'number') return new Date(input);
    if (typeof input !== 'string') return new Date(NaN);

    let s = input.trim();
    if (!s) return new Date(NaN);

    // Đã có offset (Z, +07:00, -0500…) → mốc tuyệt đối, không đụng.
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(s);

    s = s.replace(' ', 'T');
    if (!s.includes('T')) s += 'T00:00:00'; // chỉ có ngày → nửa đêm giờ VN
    return new Date(`${s}${VN_OFFSET}`);
};
