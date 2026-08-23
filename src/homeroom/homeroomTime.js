/** Asia/Ho_Chi_Minh school dates. Vietnam has no DST; offset is a fixed UTC+7. */

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vietnamTodayYmd(now = Date.now()) {
  return new Date(Number(now) + VIETNAM_UTC_OFFSET_MS).toISOString().slice(0, 10);
}
