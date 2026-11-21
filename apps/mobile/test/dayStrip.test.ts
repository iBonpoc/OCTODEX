import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { component, space } from "@octo/design-tokens";
import { pillDot, pillLook, stripDays, stripOffset, STRIP_WEEKS } from "../src/ui/dayStripLogic";
import { weekStart } from "../src/features/calendar";

describe("DayStrip (BUILD-SPEC §1, поток В)", () => {
  it("the strip is four whole weeks from the Monday a week before the picked day", () => {
    const d = stripDays("2026-11-20");
    expect(d).toHaveLength(7 * STRIP_WEEKS);
    expect(d[0]).toBe("2026-11-09");
    expect(weekStart(d[0]!)).toBe(d[0]);
    expect(d).toContain("2026-11-20");
    expect(d.at(-1)).toBe("2026-12-06");
  });
  it("crosses a month and a year without a gap", () => {
    const d = stripDays("2026-12-31");
    expect(d).toContain("2027-01-01");
    for (let i = 1; i < d.length; i++) expect(Date.parse(d[i]!) - Date.parse(d[i - 1]!)).toBe(86_400_000);
  });
  it("scrolls the picked pill to the middle, never before the start", () => {
    expect(stripOffset(0, 390)).toBe(0);
    const i = 10;
    const x = stripOffset(i, 390);
    const pillLeft = space[4] + i * (component.dayPill.w + component.dayPill.gap) - x;
    expect(pillLeft + component.dayPill.w / 2).toBeCloseTo(390 / 2);
  });
  it("the picked pill is the accent with its edge; today's number accText; the others surf with a hairline", () => {
    expect(pillLook(true, false)).toEqual({ fill: "acc", edge: "accEdge", num: "onAcc", bold: true });
    expect(pillLook(true, true).num).toBe("onAcc");
    expect(pillLook(false, true)).toEqual({ fill: "surf", edge: "bd", num: "accText", bold: true });
    expect(pillLook(false, false)).toEqual({ fill: "surf", edge: "bd", num: "ink", bold: false });
  });
  it("the dot: none on an empty day, warn when a visit has nobody, onAcc on the picked one", () => {
    expect(pillDot(undefined, false)).toBe("none");
    expect(pillDot({ n: 0, unassigned: 0 } as never, true)).toBe("none");
    expect(pillDot({ n: 2, unassigned: 1 } as never, false)).toBe("warn");
    expect(pillDot({ n: 2, unassigned: 0 } as never, false)).toBe("mut");
    expect(pillDot({ n: 2, unassigned: 1 } as never, true)).toBe("onAcc");
  });
  it("the pill takes its sizes from the tokens (52 tall, dot 4) and PlanParts only re-exports the strip", () => {
    const ui = readFileSync(join(__dirname, "..", "src", "ui", "dayStrip.tsx"), "utf8");
    expect(ui).toMatch(/minHeight: pill\.h/);
    expect(ui).toMatch(/width: pill\.dot/);
    const plan = readFileSync(join(__dirname, "..", "src", "features", "PlanParts.tsx"), "utf8");
    expect(plan).toMatch(/export \{ DayCell, DayStrip, WeekStrip, stripDays \} from "@\/ui\/dayStrip"/);
    expect(plan).not.toMatch(/export function (DayCell|DayStrip|WeekStrip|stripDays)\b/);
  });
});
