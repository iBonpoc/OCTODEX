import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, formToInput, quickOptions } from "../src/features/quickEstimate";
import { DEMO_PRICE_BOOK } from "../src/data/priceBook";

describe("quick gutter estimate", () => {
  it("maps the paper form to engine input", () => {
    const i = formToInput({ ...DEFAULT_FORM, outsideCorners: 2, insideCorners: 1, downspouts: 3 });
    expect(i.runs).toHaveLength(1);
    expect(i.miters.filter((m) => m.kind === "out")).toHaveLength(2);
    expect(i.miters.filter((m) => m.kind === "in")).toHaveLength(1);
    expect(i.downspouts).toHaveLength(3);
  });

  it("returns Good < Better < Best with CA deposit cap", () => {
    const o = quickOptions({ ...DEFAULT_FORM, lengthFt: 130, stories: 2 }, DEMO_PRICE_BOOK);
    expect(o.map((x) => x.name)).toEqual(["Good", "Better", "Best"]);
    expect(o[0]!.totals.total).toBeLessThan(o[1]!.totals.total);
    expect(o[1]!.totals.total).toBeLessThan(o[2]!.totals.total);
    for (const x of o) expect(x.deposit).toBeLessThanOrEqual(Math.min(Math.round(x.totals.total * 0.1), 100000));
  });

  it("caps the deposit at $1,000 on large jobs", () => {
    const [good] = quickOptions({ ...DEFAULT_FORM, lengthFt: 1500, stories: 3 }, DEMO_PRICE_BOOK);
    expect(good!.totals.total).toBeGreaterThan(1_000_000);
    expect(good!.deposit).toBe(100000);
    expect(good!.depositCapped).toBe(true);
  });

  it("no options for zero length", () => {
    expect(quickOptions({ ...DEFAULT_FORM, lengthFt: 0 }, DEMO_PRICE_BOOK)).toEqual([]);
  });

  it("money is integer cents", () => {
    for (const x of quickOptions(DEFAULT_FORM, DEMO_PRICE_BOOK)) {
      expect(Number.isInteger(x.totals.total)).toBe(true);
      expect(Number.isInteger(x.deposit)).toBe(true);
    }
  });
});
