/** Asia/Ho_Chi_Minh school dates. Vietnam has no DST; offset is a fixed UTC+7. */

export const SCHOOL_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME = "08:30";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM = /^(\d{2}):(\d{2})$/;

export function isYmd(value: string | undefined): value is string {
  if (!value || !YMD.test(value)) return false;
  const [, year, month, day] = value.match(YMD) || [];
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const stamp = new Date(utc).toISOString().slice(0, 10);
  return stamp === value;
}

export function assertYmd(value: string): string {
  const trimmed = String(value || "").trim();
  if (!isYmd(trimmed)) throw new Error("INVALID_DATE");
  return trimmed;
}

export function isHm(value: string | undefined): value is string {
  if (!value || !HM.test(value)) return false;
  const [, hour, minute] = value.match(HM) || [];
  const h = Number(hour);
  const m = Number(minute);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function assertHm(value: string): string {
  const trimmed = String(value || "").trim();
  if (!isHm(trimmed)) throw new Error("INVALID_TIME");
  return trimmed;
}

export function vietnamDateFromUtcMs(ms: number): string {
  return new Date(ms + VIETNAM_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function vietnamWallTimeToUtcMs(date: string, time: string): number {
  const ymd = assertYmd(date);
  const hm = assertHm(time);
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute] = hm.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - VIETNAM_UTC_OFFSET_MS;
}

export function compareYmd(a: string, b: string): number {
  return assertYmd(a).localeCompare(assertYmd(b));
}

export function dateInRange(date: string, start: string, end?: string): boolean {
  const current = assertYmd(date);
  if (compareYmd(current, start) < 0) return false;
  if (end && compareYmd(current, end) > 0) return false;
  return true;
}

export function assertYmdRange(from: string, to: string): { from: string; to: string } {
  const start = assertYmd(from);
  const end = assertYmd(to);
  if (compareYmd(start, end) > 0) throw new Error("INVALID_DATE_RANGE");
  return { from: start, to: end };
}

export function addDaysYmd(date: string, days: number): string {
  const ymd = assertYmd(date);
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function parseFlexibleSchoolDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return vietnamDateFromUtcMs(value.getTime());
  }
  const text = String(value).trim();
  if (!text) return null;
  if (isYmd(text)) return text;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(text);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const candidate = `${dmy[3]}-${month}-${day}`;
    return isYmd(candidate) ? candidate : null;
  }
  const iso = Date.parse(text);
  if (Number.isFinite(iso)) return vietnamDateFromUtcMs(iso);
  return null;
}
