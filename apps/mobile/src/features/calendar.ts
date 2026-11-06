/**
 * Calendar math for the Plan (weeks start on Monday as in US business calendars used by crews).
 * Day keys are calendar days with no zone: the arithmetic (addDays, weekStart, monthGrid) is done in UTC, so it does
 * not depend on the machine's zone. Which day a moment falls on is a matter of a zone: todayKey / isoDayKey take one
 * (the company's — features/zone.ts); without it they read the phone, until the screens move over (П4b-2).
 */
import { dayKeyIn, dayNumber, keyOfNumber, weekdayOf } from "./zone";

export type DayKey = string; // YYYY-MM-DD

export const dayKeyOf = (d: Date): DayKey =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** local noon of a day key — for formatting a label on the phone (safe across DST changes) */
export const fromDayKey = (k: DayKey): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
};
/** today: of the zone when given (the company's), else of the phone */
export const todayKey = (tz?: string): DayKey => (tz ? dayKeyIn(Date.now(), tz) : dayKeyOf(new Date()));
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
/** the day of a moment: in the zone when given (the company's), else on the phone */
export const isoDayKey = (iso: string, tz?: string): DayKey => (tz ? dayKeyIn(iso, tz) : dayKeyOf(new Date(iso)));
