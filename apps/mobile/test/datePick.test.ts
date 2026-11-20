import { describe, expect, it } from "vitest";
import { dayKeyMove, dayState } from "../src/features/datePickLogic";
import { monthGrid } from "../src/features/calendar";

// DS А7 (wave 5б of spec 56): the date grid's keys and the day states
describe("DatePick", () => {
  it("arrows: a day, a week; Home / End — the week's ends (Monday- or Sunday-first); PageUp / PageDown — a month", () => {
    // 2026-11-18 is a Wednesday
    expect(dayKeyMove("2026-11-18", "ArrowLeft", false)).toBe("2026-11-17");
    expect(dayKeyMove("2026-11-30", "ArrowRight", false)).toBe("2026-12-01");
    expect(dayKeyMove("2026-11-18", "ArrowUp", false)).toBe("2026-11-11");
    expect(dayKeyMove("2026-11-28", "ArrowDown", false)).toBe("2026-12-05");
    expect(dayKeyMove("2026-11-18", "Home", false)).toBe("2026-11-16");
    expect(dayKeyMove("2026-11-18", "End", false)).toBe("2026-11-22");
    expect(dayKeyMove("2026-11-18", "Home", true)).toBe("2026-11-15");
    expect(dayKeyMove("2026-11-18", "End", true)).toBe("2026-11-21");
    expect(dayKeyMove("2026-01-31", "PageDown", false)).toBe("2026-02-28");
    expect(dayKeyMove("2026-11-18", "PageUp", false)).toBe("2026-10-18");
    expect(dayKeyMove("2026-11-18", "a", false)).toBeNull();
  });
  it("states: chosen, today, day off, before min, another month — each its own", () => {
    const o = { value: "2026-11-19", today: "2026-11-18", first: "2026-11-18", month: "2026-11-01", workday: (k: string) => !k.endsWith("22") };
    expect(dayState("2026-11-19", o)).toMatchObject({ selected: true, today: false, before: false });
    expect(dayState("2026-11-18", o)).toMatchObject({ selected: false, today: true, before: false });
    expect(dayState("2026-11-17", o)).toMatchObject({ before: true });
    expect(dayState("2026-11-22", o)).toMatchObject({ off: true, before: false });
    expect(dayState("2026-12-01", o)).toMatchObject({ other: true });
  });
  it("the grid starts on Sunday only when asked (en-US DateField); the Plan's stays Monday", () => {
    expect(monthGrid("2026-11-18")[0]!.key).toBe("2026-10-26");
    expect(monthGrid("2026-11-18", true)[0]!.key).toBe("2026-11-01");
  });
});
