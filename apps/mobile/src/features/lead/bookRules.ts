/** Pure date helpers for the lead sheets (unit-tested in test/leadSheets.test.ts). Times are local to the device. */

/** how many days ahead the visit date chips go */
export const BOOK_DAYS = 21;
export const SNOOZE_MONTHS = [1, 3, 6] as const;

/** Start of an estimate visit: today + dayOffset at startMin minutes after midnight (local). */
export function bookStart(dayOffset: number, startMin: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  return d.toISOString();
}

/** Snooze until N months from now, 9:00 local, so the lead comes back at the start of a work day. */
export function snoozeUntil(months: number, now = new Date()): string {
  const d = new Date(now);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
