import { riyadhDate, riyadhToUtc, weekdayOf } from "../time";

/**
 * Pure slot computation for one provider on one Riyadh-local date.
 *
 * A slot start S is offered only if the whole reservation fits:
 *   reservation  = [S − travelBuffer, S + duration)
 *   • it lies inside one working window of that weekday (travel included)
 *   • it overlaps no existing active reservation of the provider
 *   • S ≥ now + minNotice, and the date ≤ today + maxAdvanceDays
 *   • the date is not a whole-day exception
 */
export interface SlotInput {
  date: string; // YYYY-MM-DD, Riyadh local
  rules: { weekday: number; startMinute: number; endMinute: number }[];
  exceptionDates: string[];
  busy: { from: Date; to: Date }[];
  durationMinutes: number;
  travelBufferMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  now: Date;
  stepMinutes?: number;
}

const MS = 60_000;

export function computeSlots(i: SlotInput): Date[] {
  const step = i.stepMinutes ?? 15;
  const today = riyadhDate(i.now);
  const dayDiff = Math.round((Date.parse(`${i.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (dayDiff < 0 || dayDiff > i.maxAdvanceDays) return [];
  if (i.exceptionDates.includes(i.date)) return [];

  const earliest = i.now.getTime() + i.minNoticeMinutes * MS;
  const windows = i.rules.filter((r) => r.weekday === weekdayOf(i.date));
  const out = new Map<number, Date>();

  for (const w of windows) {
    // First start: travel must fit inside the window.
    for (let m = w.startMinute + i.travelBufferMinutes; m + i.durationMinutes <= w.endMinute; m += step) {
      const start = riyadhToUtc(i.date, m);
      if (start.getTime() < earliest) continue;
      const from = start.getTime() - i.travelBufferMinutes * MS;
      const to = start.getTime() + i.durationMinutes * MS;
      const clash = i.busy.some((b) => from < b.to.getTime() && b.from.getTime() < to);
      if (!clash) out.set(start.getTime(), start);
    }
  }
  return [...out.values()].sort((a, b) => a.getTime() - b.getTime());
}
