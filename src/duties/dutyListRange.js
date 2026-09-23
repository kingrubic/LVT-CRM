/** Keep in sync with `convex/dutyRange.ts` (`dutyListDateWindow`). */

export const DUTY_LIST_LOOKBACK_MONTHS = 12;
export const DUTY_LIST_LOOKAHEAD_MONTHS = 12;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vietnamIsoDate(now = Date.now()) {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function addIsoMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  const result = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return result.toISOString().slice(0, 10);
}

/** Rolling year used by Lịch công tác list mode so the query stays bounded. */
export function dutyListDateWindow(now = Date.now()) {
  const today = vietnamIsoDate(now);
  return {
    startDate: addIsoMonths(today, -DUTY_LIST_LOOKBACK_MONTHS),
    endDate: addIsoMonths(today, DUTY_LIST_LOOKAHEAD_MONTHS),
  };
}
