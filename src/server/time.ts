/**
 * Saudi Arabia observes UTC+03:00 all year (no daylight saving), so local wall-clock time
 * converts with a fixed offset. All timestamps are stored in UTC.
 */
export const RIYADH_OFFSET_MINUTES = 180;
export const TIMEZONE = "Asia/Riyadh";
const MS_MIN = 60_000;

/** Local calendar date in Riyadh, "YYYY-MM-DD". */
export function riyadhDate(d: Date): string {
  return new Date(d.getTime() + RIYADH_OFFSET_MINUTES * MS_MIN).toISOString().slice(0, 10);
}

/** UTC instant for a Riyadh local date + minute of day. */
export function riyadhToUtc(dateStr: string, minuteOfDay: number): Date {
  const midnightUtc = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(midnightUtc)) throw new Error(`invalid date ${dateStr}`);
  return new Date(midnightUtc + (minuteOfDay - RIYADH_OFFSET_MINUTES) * MS_MIN);
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" date. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function addDays(dateStr: string, n: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) <= 24 && Number(m[2]) < 60 && v <= 1440 ? v : NaN;
}
