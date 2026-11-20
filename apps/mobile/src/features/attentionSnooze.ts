/**
 * #2097 (founder 18.11, audit #2004 КЛ-09): «Позже» in «Разбор дел» puts a reason off until a day the office chooses, for
 * the whole company (public.attention_snoozes). The reason comes back by itself at 00:00 of that day in the company's
 * time zone. Pure: test/attentionSnooze.test.ts.
 */
import type { DB } from "@/data/types";
import { dayKeyIn, dayNumber, getZone, keyOfNumber, wallToInstant, type DayKey } from "@/features/zone";

/** the quick days of the «Позже» sheet (a day of one's own — after #2057's DateField) */
export const SNOOZE_DAYS = [
  { key: "tomorrow", days: 1 },
  { key: "days3", days: 3 },
  { key: "week", days: 7 },
] as const;
export type SnoozeKey = (typeof SNOOZE_DAYS)[number]["key"];

/** the company's day `days` after today */
export const snoozeDay = (days: number, now: number = Date.now(), tz: string = getZone()): DayKey => keyOfNumber(dayNumber(dayKeyIn(now, tz)) + days);

/** when a reason put off to `day` comes back: 00:00 of that day in the company's zone */
export const snoozeUntil = (day: DayKey, tz: string = getZone()): string => wallToInstant(day, 0, tz);

/** is the reason still put off now */
export function isSnoozed(db: Pick<DB, "attentionSnoozes">, itemId: string, now: number = Date.now()): boolean {
  const s = db.attentionSnoozes?.find((x) => x.itemId === itemId);
  return !!s && Date.parse(s.until) > now;
}

/** the list after putting `itemId` off until `until` (null — back now): one entry per reason */
export function withSnooze<T extends Pick<DB, "attentionSnoozes">>(d: T, itemId: string, until: string | null): T {
  const rest = (d.attentionSnoozes ?? []).filter((x) => x.itemId !== itemId);
  return { ...d, attentionSnoozes: until ? [...rest, { itemId, until }] : rest };
}
