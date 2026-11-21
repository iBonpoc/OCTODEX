/** The Plan's day and «Сегодня у бригад» as visual v2 «время и интервал» (prototype audit 12 §2.3: the wall of «Опаздывает»). */
import { describe, expect, it } from "vitest";
import { nearIndex, plateHalves, problemSummary, quietStatuses } from "../src/features/planSlots";

describe("unit:planSlots", () => {
  it("the plate: one AM/PM when both halves share it", () => {
    expect(plateHalves("1:30 PM", "2:30 PM")).toEqual(["1:30", "2:30 PM"]);
    expect(plateHalves("8:30 AM", "12:30 PM")).toEqual(["8:30 AM", "12:30 PM"]);
    expect(plateHalves("8:30", "12:30")).toEqual(["8:30", "12:30"]);
  });
  it("the nearest visit: the first open one whose end is still ahead", () => {
    const now = Date.parse("2026-11-20T18:00:00Z");
    const items = [
      { kind: "visit", start: "2026-11-20T15:00:00Z", end: "2026-11-20T17:00:00Z", done: false },
      { kind: "task", start: "2026-11-20T18:30:00Z", done: false },
      { kind: "visit", start: "2026-11-20T17:30:00Z", end: "2026-11-20T19:00:00Z", done: true },
      { kind: "visit", start: "2026-11-20T19:00:00Z", end: "2026-11-20T20:00:00Z", done: false },
    ];
    expect(nearIndex(items, now)).toBe(3);
    expect(nearIndex(items.slice(0, 2), now)).toBe(-1);
  });
  it("a problem is a pill on the first such row only; the rest a quiet word; in work keeps its pill; scheduled has none", () => {
    // the audit's day: late, in work, late, unassigned, late, late
    expect(quietStatuses(["warn", "info", "warn", "warn", "bad", "warn"])).toEqual(["pill", "pill", "word", "word", "word", "word"]);
    expect(quietStatuses(["neutral", undefined, "ok"])).toEqual(["none", "none", "pill"]);
  });
  it("one summary over the rows when two or more are late or missed", () => {
    expect(problemSummary(["late", null, "late", "missed"])).toEqual({ late: 2, missed: 1 });
    expect(problemSummary(["late", null])).toBeNull();
  });
});
