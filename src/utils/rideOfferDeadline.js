/**
 * Jockey response deadline rules.
 *
 * Owner mời jockey cưỡi → jockey có một khoảng thời gian trước race để
 * accept/decline. Hết khoảng đó (= còn ít hơn N ngày tới race) jockey
 * không được decline nữa — họ phải đua. Mục đích: tránh trường hợp jockey
 * chốt khung trống xong sát ngày race lại từ chối khiến owner trở tay không kịp.
 *
 * Mặc định 7 ngày. Có thể override qua env JOCKEY_RESPONSE_DEADLINE_DAYS.
 */
export const JOCKEY_RESPONSE_DEADLINE_DAYS =
    Number(process.env.JOCKEY_RESPONSE_DEADLINE_DAYS) || 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @returns true nếu thời điểm hiện tại đã quá hạn jockey được decline
 * (race còn ≤ JOCKEY_RESPONSE_DEADLINE_DAYS ngày).
 */
export const isPastJockeyDeclineDeadline = (race, now = new Date()) => {
    if (!race?.raceDate) return false;
    const msUntilRace = new Date(race.raceDate).getTime() - now.getTime();
    return msUntilRace <= JOCKEY_RESPONSE_DEADLINE_DAYS * MS_PER_DAY;
};

/**
 * Coi như Pending = Accepted nếu đã qua deadline. Dùng ở downstream
 * (referee approve, race finalize) để không bị kẹt khi jockey im lặng.
 */
export const effectiveJockeyResponse = (reg, race, now = new Date()) => {
    const status = reg?.jockeyResponse?.status || 'Pending';
    if (status === 'Pending' && isPastJockeyDeclineDeadline(race, now)) {
        return 'Accepted';
    }
    return status;
};
