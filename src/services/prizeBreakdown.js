/**
 * Tính bảng chia thưởng cụ thể (VND) từ prizeMoney + prizeDistribution.
 * Trả về mảng đã sort theo rank, mỗi item gồm rank/percent/amount để FE
 * hiển thị "Hạng 1: 9.000.000 VND" mà không phải tự nhân chia ở client.
 *
 * Làm tròn về số nguyên VND (banker rounding không cần thiết cho cấp xã hội này).
 */
export const calculatePrizeBreakdown = (race) => {
    const total = Number(race?.prizeMoney) || 0;
    const dist = Array.isArray(race?.prizeDistribution) ? race.prizeDistribution : [];
    return dist
        .slice()
        .sort((a, b) => (a.rank || 0) - (b.rank || 0))
        .map((d) => ({
            rank: d.rank,
            percent: d.percent,
            amount: Math.round((total * (d.percent || 0)) / 100),
        }));
};
