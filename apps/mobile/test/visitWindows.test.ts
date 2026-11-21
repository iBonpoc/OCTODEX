/**
 * #2208 «ближайшие свободные окна»: the visit form and «Перенести» offer the nearest free windows as chips in one row. A window is a
 * run of free starts of `freeSlots()` (the one busy rule, unchanged) — from its first start to the end of its last one; the days are
 * walked from the form's day forward, a day off has none.
 */
import { describe, expect, it } from "vitest";
import type { DB, Visit } from "../src/data/types";
import { atMinute, type Hours } from "../src/features/schedule";
import { nearestWindows, slotWindows } from "../src/features/visitWindows";

const LA = "America/Los_Angeles";
const NOW = new Date("2026-11-05T18:00:00.000Z").getTime(); // 10:00 AM in LA, Thursday
const H: Hours = { dayStartMin: 8 * 60, dayEndMin: 18 * 60, stepMin: 30 };
const V = (p: Partial<Visit>): Visit => ({ id: "v", techId: "m1", assigneeIds: ["m1"], start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p }) as Visit;
const db = (visits: Visit[]) => ({ visits }) as unknown as Pick<DB, "visits">;

describe("unit:visitWindows — the nearest free windows (#2208)", () => {
  it("free starts in a row make one window: first start → the end of the last one", () => {
    expect(slotWindows([480, 510, 540, 660, 690], 30, 60)).toEqual([
      { from: 480, to: 600 },
      { from: 660, to: 750 },
    ]);
    expect(slotWindows([], 30, 60)).toEqual([]);
  });
  it("today from now, around a busy visit; then the next days; a day off is skipped; at most `max`", () => {
    const busy = V({ id: "b", start: atMinute("2026-11-05", 13 * 60, LA), durationMin: 120 });
    const hoursOf = (day: string): Hours => (day === "2026-11-07" ? { ...H, off: true } : H);
    const w = nearestWindows(db([busy]), ["m1"], "2026-11-05", 60, { now: NOW, tz: LA, hoursOf, max: 4 });
    expect(w).toEqual([
      { day: "2026-11-05", from: 10 * 60, to: 13 * 60 },
      { day: "2026-11-05", from: 15 * 60, to: 18 * 60 },
      { day: "2026-11-06", from: 8 * 60, to: 18 * 60 },
      // Saturday the 7th is a day off
      { day: "2026-11-08", from: 8 * 60, to: 18 * 60 },
    ]);
  });
  it("moving a visit: its own time is free (exceptId); nobody on it — every window", () => {
    const own = V({ id: "own", start: atMinute("2026-11-05", 10 * 60, LA), durationMin: 480 });
    expect(nearestWindows(db([own]), ["m1"], "2026-11-05", 60, { now: NOW, tz: LA, hoursOf: () => H, max: 1 })).toEqual([{ day: "2026-11-06", from: 480, to: 1080 }]);
    expect(nearestWindows(db([own]), ["m1"], "2026-11-05", 60, { now: NOW, tz: LA, hoursOf: () => H, max: 1, exceptId: "own" })).toEqual([{ day: "2026-11-05", from: 600, to: 1080 }]);
    expect(nearestWindows(db([own]), [], "2026-11-05", 60, { now: NOW, tz: LA, hoursOf: () => H, max: 1 })).toEqual([{ day: "2026-11-05", from: 600, to: 1080 }]);
  });
});
