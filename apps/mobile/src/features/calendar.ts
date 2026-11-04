/** Calendar math for the Plan (local time, weeks start on Monday as in US business calendars used by crews). */
export type DayKey = string; // YYYY-MM-DD (local)

export const dayKeyOf = (d: Date): DayKey =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromDayKey = (k: DayKey): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0); // noon: safe across DST changes
};
export const todayKey = (): DayKey => dayKeyOf(new Date());
export const addDays = (k: DayKey, n: number): DayKey => {
  const d = fromDayKey(k);
  d.setDate(d.getDate() + n);
  return dayKeyOf(d);
};
export const addMonths = (k: DayKey, n: number): DayKey => {
  const d = fromDayKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dayKeyOf(d);
};
/** Monday of the week containing k. */
export const weekStart = (k: DayKey): DayKey => {
  const d = fromDayKey(k);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  return addDays(k, -dow);
};
export const weekDays = (k: DayKey): DayKey[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(k), i));
/** 6 × 7 cells starting on the Monday on/before the 1st; inMonth marks days of k's month. */
export function monthGrid(k: DayKey): { key: DayKey; inMonth: boolean }[] {
  const d = fromDayKey(k);
  const first = dayKeyOf(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => {
    const key = addDays(start, i);
    return { key, inMonth: fromDayKey(key).getMonth() === d.getMonth() };
  });
}
export const isoDayKey = (iso: string): DayKey => dayKeyOf(new Date(iso));
