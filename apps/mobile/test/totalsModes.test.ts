// #2424-wave (MAP §12 п.8, founder 23.11): Скидка / Налог / Депозит — one line each, `[% · Выкл. · $]` right in the row
import { describe, expect, it } from "vitest";
import { depositFor, depositMode, discountFor, discountMode, MONEY_MODES, remember, TAX_MODES } from "../src/features/estimate/totalsModes";

describe("the totals' switch", () => {
  it("reads the setting", () => {
    expect(discountMode(null)).toBe("off");
    expect(discountMode({ kind: "pct", value: "0.1" })).toBe("pct");
    expect(discountMode({ kind: "fixed", cents: 500 })).toBe("fixed");
    expect(depositMode({ kind: "none" })).toBe("off");
    expect(depositMode({ kind: "pct", bps: 1000 })).toBe("pct");
    expect(depositMode({ kind: "fixed", cents: 0 })).toBe("fixed");
  });
  it("a press on another position starts it (a discount — empty, the person types it; a deposit % — the usual 10)", () => {
    expect(discountFor("pct", null)).toEqual({ kind: "pct", value: "0" });
    expect(discountFor("fixed", null)).toEqual({ kind: "fixed", cents: 0 });
    expect(discountFor("off", { kind: "pct", value: "0.1" })).toBeNull();
    expect(depositFor("pct", { kind: "none" })).toEqual({ kind: "pct", bps: 1000 });
    expect(depositFor("fixed", { kind: "pct", bps: 2500 })).toEqual({ kind: "fixed", cents: 0 });
    expect(depositFor("off", { kind: "fixed", cents: 100 })).toEqual({ kind: "none" });
  });
  it("a press on the position already chosen keeps the typed value", () => {
    const d = { kind: "pct" as const, value: "0.12" };
    expect(discountFor("pct", d)).toBe(d);
    const dep = { kind: "fixed" as const, cents: 7700 };
    expect(depositFor("fixed", dep)).toBe(dep);
  });
  it("«Выкл.» and back brings the typed value back (CRM review: a miss on «Выкл.» must not lose it)", () => {
    const typed = { kind: "fixed" as const, cents: 2500 };
    const memo = remember({}, typed);
    expect(discountFor("fixed", discountFor("off", typed, memo), memo)).toEqual(typed);
    expect(discountFor("pct", typed, memo)).toEqual({ kind: "pct", value: "0" });
    const dep = { kind: "pct" as const, bps: 2500 };
    const m2 = remember({}, dep);
    expect(depositFor("pct", { kind: "none" }, m2)).toEqual(dep);
    expect(remember(m2, { kind: "none" })).toBe(m2);
    expect(remember({}, null)).toEqual({});
  });
  it("the order: % · Выкл. · $ (Выкл. in the middle); the tax has no $ until the engine takes a tax sum (#2404)", () => {
    expect(MONEY_MODES).toEqual(["pct", "off", "fixed"]);
    expect(TAX_MODES).toEqual(["pct", "off"]);
  });
});
