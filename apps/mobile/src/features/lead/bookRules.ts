/** Pure date helpers for the lead sheets (unit-tested in test/leadSheets.test.ts). Days and hours are the company's
 *  (features/zone.ts), not the phone's (П4b). */
import { addDays, addMonths } from "@/features/calendar";
import { dayKeyIn, getZone, wallToInstant } from "@/features/zone";

/** how many days ahead the visit date chips go */
export const BOOK_DAYS = 21;
export const SNOOZE_MONTHS = [1, 3, 6] as const;

/** Start of an estimate visit: the company's today + dayOffset at startMin minutes after its midnight. */
export function bookStart(dayOffset: number, startMin: number, now = new Date(), tz: string = getZone()): string {
  return wallToInstant(addDays(dayKeyIn(now.getTime(), tz), dayOffset), startMin, tz);
}

/** today of the company + n days at h:00 of its clock (a task «remind me in 3 days» comes due at the start of a work day) */
export function dayAtHour(n: number, h: number, now = new Date(), tz: string = getZone()): string {
  return bookStart(n, h * 60, now, tz);
}

/** Snooze until N months from now, 9:00 of the company, so the lead comes back at the start of a work day
 *  (Jan 31 + 1 month → the last day of February). */
export function snoozeUntil(months: number, now = new Date(), tz: string = getZone()): string {
  return wallToInstant(addMonths(dayKeyIn(now.getTime(), tz), months), 9 * 60, tz);
}
