/**
 * Calendar math for the Plan (weeks start on Monday as in US business calendars used by crews).
 * Day keys are calendar days with no zone: the arithmetic (addDays, weekStart, monthGrid) is done in UTC, so it does
 * not depend on the machine's zone. Which day a moment falls on is a matter of a zone: todayKey / isoDayKey take one,
 * the company's by default (features/zone.ts getZone), never the phone's (П4b-2).
 */
import { dayKeyIn, dayNumber, daysBetween, getZone, keyOfNumber, weekdayOf } from "./zone";

export type DayKey = string; // YYYY-MM-DD

/** noon UTC of a day key — only for a label of the day formatted with timeZone "UTC" (the day has no zone) */
export const fromDayKey = (k: DayKey): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0, 0));
};
/** today of the company (or of the zone given) */
export const todayKey = (tz: string = getZone(), now: number = Date.now()): DayKey => dayKeyIn(now, tz);
export const addDays = (k: DayKey, n: number): DayKey => keyOfNumber(dayNumber(k) + n);
export const addMonths = (k: DayKey, n: number): DayKey => {
  const [y, m, d] = k.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return keyOfNumber(Math.floor(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d!, last)) / 86_400_000));
};
/** Monday of the week containing k. */
export const weekStart = (k: DayKey): DayKey => addDays(k, -((weekdayOf(k) + 6) % 7));
export const weekDays = (k: DayKey): DayKey[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(k), i));
/** 6 × 7 cells starting on the Monday on/before the 1st; inMonth marks days of k's month. */
export function monthGrid(k: DayKey): { key: DayKey; inMonth: boolean }[] {
  const month = k.slice(0, 7);
  const start = weekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => {
    const key = addDays(start, i);
    return { key, inMonth: key.startsWith(month) };
  });
}
/** the day of a moment on the company's calendar (or of the zone given) */
export const isoDayKey = (iso: string, tz: string = getZone()): DayKey => dayKeyIn(iso, tz);
/** days from the company's today to a day (0 = today) — the form's day chips */
export const dayOffsetOf = (k: DayKey, today: DayKey = todayKey()): number => daysBetween(today, k);
