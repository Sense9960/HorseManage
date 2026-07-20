/**
 * Cửa sổ đăng ký race — logic lazy transition Open ↔ Locked theo thời gian.
 *
 * Vercel serverless không chạy được cron nền, nên thay vì true cron, ta lazy
 * check mỗi khi có request đọc race:
 *   - Nếu race.status === 'Draft' && registrationOpenAt đã tới → auto → 'Open'
 *   - Nếu race.status === 'Open'  && registrationCloseAt đã tới → auto → 'Locked'
 *
 * Caller quyết định có persist thay đổi vào DB không (thường có).
 */

/**
 * Trạng thái mà race NÊN có ở thời điểm `now` dựa trên registration window.
 * KHÔNG mutate race object.
 */
export const getEffectiveStatus = (race, now = new Date()) => {
    if (!race) return null;
    const status = race.status;
    // Chỉ auto-transition với race chưa Finished/Cancelled — sau Finished là kết
    // quả cuối, không quay lại; Cancelled là quyết định thủ công của admin.
    if (status === 'Finished' || status === 'Cancelled') return status;

    const openAt = race.registrationOpenAt ? new Date(race.registrationOpenAt) : null;
    const closeAt = race.registrationCloseAt ? new Date(race.registrationCloseAt) : null;

    if (status === 'Draft' && openAt && now >= openAt) {
        // Vừa qua giờ mở đơn → chuyển Open. Nếu cùng lúc đã qua closeAt (edge
        // case: window quá ngắn hoặc admin sai config) → nhảy thẳng Locked.
        if (closeAt && now >= closeAt) return 'Locked';
        return 'Open';
    }

    if (status === 'Open' && closeAt && now >= closeAt) {
        return 'Locked';
    }

    return status;
};

/**
 * Áp effective status vào race document (mutate). Trả về true nếu status
 * đã thay đổi — caller quyết định `race.save()` hay không.
 */
export const applyEffectiveStatus = (race, now = new Date()) => {
    const effective = getEffectiveStatus(race, now);
    if (effective !== race.status) {
        race.status = effective;
        return true;
    }
    return false;
};

/**
 * Kiểm tra 1 mảng race và persist auto-transition nếu có. Trả về số race đã
 * update. Gọi từ list endpoints để giữ trạng thái luôn tươi mà không cần cron.
 */
export const syncRegistrationWindows = async (races, now = new Date()) => {
    let updated = 0;
    for (const race of races) {
        // Với plain object từ .lean() — không có save(). Caller phải dùng
        // Race model instance nếu muốn persist. Hàm này chỉ chạy với Mongoose docs.
        if (typeof race.save !== 'function') continue;
        if (applyEffectiveStatus(race, now)) {
            await race.save();
            updated += 1;
        }
    }
    return updated;
};

/**
 * Lazy sweep dùng ở các list endpoint (referee/admin/owner): tìm những race
 * Draft/Open đã tới mốc mở/đóng đơn và PERSIST chuyển trạng thái (Draft→Open,
 * Open→Locked) vào DB. Vì Vercel serverless không chạy cron nền, đây là cách
 * đảm bảo status thực sự đổi trong DB mỗi khi có ai đó xem danh sách — thay vì
 * chỉ tính effective status tạm thời cho response.
 *
 * Chỉ query đúng nhóm cần đổi (index-friendly) rồi load bản Mongoose (không
 * .lean()) để save được. Trả về số race đã update.
 */
export const sweepRegistrationWindows = async (RaceModel, extraFilter = {}, now = new Date()) => {
    const candidates = await RaceModel.find({
        ...extraFilter,
        status: { $in: ['Draft', 'Open'] },
        $or: [
            { registrationOpenAt: { $ne: null, $lte: now } },
            { registrationCloseAt: { $ne: null, $lte: now } },
        ],
    });
    return syncRegistrationWindows(candidates, now);
};
