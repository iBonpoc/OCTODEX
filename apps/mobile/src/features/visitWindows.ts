/**
 * #2208 «ближайшие свободные окна» (prototype audit, idea from the review of the visit form): the nearest free windows of the
 * chosen people, as chips in one row of the visit form and «Перенести». A window is a run of free starts of `freeSlots()` — the one
 * busy rule of schedule.ts, unchanged — from its first start to the end of its last one. Pure; tested in test/visitWindows.test.ts.
 */
import type { DB, ID } from "@/data/types";
import { addDays, type DayKey } from "./calendar";
import { freeSlots, type Hours } from "./schedule";

export type FreeWindow = { day: DayKey; from: number; to: number };

/** the starts of one day folded into windows: starts `step` apart are one window; a window ends where its last start's visit ends */
export function slotWindows(slots: number[], step: number, durationMin: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const m of slots) {
    const last = out[out.length - 1];
    if (last && m - (last.to - durationMin) <= step) last.to = m + durationMin;
    else out.push({ from: m, to: m + durationMin });
  }
  return out;
}

/** the first `max` free windows from `fromDay` on, at most `days` days ahead; never in the past (freeSlots) */
export function nearestWindows(
  db: Pick<DB, "visits">, techIds: ID[], fromDay: DayKey, durationMin: number,
  opts: { hoursOf: (day: DayKey) => Hours; exceptId?: ID; now?: number; tz?: string; max?: number; days?: number },
): FreeWindow[] {
  const max = opts.max ?? 6;
  const out: FreeWindow[] = [];
  for (let i = 0; i < (opts.days ?? 14) && out.length < max; i++) {
    const day = addDays(fromDay, i);
    const h = opts.hoursOf(day);
    const slots = freeSlots(db, techIds.length ? techIds : null, day, durationMin, { exceptId: opts.exceptId, now: opts.now, hours: h, tz: opts.tz });
    for (const w of slotWindows(slots, h.stepMin, durationMin)) if (out.length < max) out.push({ day, ...w });
  }
  return out;
}
