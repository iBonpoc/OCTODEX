/**
 * engine:millicents — the exact cost of a unit in thousandths of a cent (#1926, spec 53 §8а.12, variant (а″)).
 * A supplier prices «$22.50 for 100»: the unit costs 22.5 ¢, which whole cents cannot hold. The cost is kept as 22 500
 * thousandths of a cent; whole cents stay the old input (old builds, the mirror) and give exactly the old results.
 * The same file test/fixtures/catalogPrice.json is read by T450 (supabase/tests/core_rls.sql, app.item_price_millicents).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogCost,
  catalogPrice,
  centsToMillicents,
  costWithoutTax,
  costWithoutTaxMillicents,
  dec,
  exactUnitCost,
  lineTotal,
  millicentsToCents,
  roundCents,
  unitCostDec,
} from "../src/index.js";

type Case = { cost: number; taxBps: number; markupBps: number; price: number };
type MCase = { costMillicents: number; taxBps: number; markupBps: number; price: number; note?: string };
type LineCase = { qty: number; costMillicents: number; taxBps: number; markupBps: number; unitPrice: number; lineTotal: number; lineCost: number };
const fixture = JSON.parse(readFileSync(new URL("./fixtures/catalogPrice.json", import.meta.url), "utf8")) as {
  cases: Case[];
  millicents: MCase[];
  line: LineCase;
};

describe("engine:millicents — the old input in cents does not change (guard of #1926)", () => {
  it("the old examples of #1807 are exactly the ones they were (nobody edits an expected price to make a test green)", () => {
    const sha = createHash("sha256").update(JSON.stringify(fixture.cases)).digest("hex");
    expect(fixture.cases.length).toBe(20);
    expect(sha).toBe("279d4f48ac1d3fb0872f19ff3ade2c5c59ef145cb29a024ac90bbfa66c0a8ad8");
  });
  for (const c of fixture.cases)
    it(`${c.cost} ¢ — in cents and as ${c.cost * 1000} thousandths: the same ${c.price} ¢`, () => {
      expect(catalogPrice(c.cost, c.taxBps, c.markupBps)).toBe(c.price);
      expect(catalogPrice({ millicents: centsToMillicents(c.cost) }, c.taxBps, c.markupBps)).toBe(c.price);
      expect(catalogCost({ millicents: centsToMillicents(c.cost) }, c.taxBps)).toBe(catalogCost(c.cost, c.taxBps));
    });
});

describe("engine:millicents — the price from the exact cost (the shared set, T450)", () => {
  it("has the examples of #1926 and the bound", () => {
    expect(fixture.millicents.length).toBeGreaterThanOrEqual(10);
    expect(fixture.millicents.some((c) => c.costMillicents === 22500 && c.markupBps === 1000 && c.price === 25)).toBe(true);
    expect(fixture.millicents.some((c) => c.costMillicents === 100_000_000_000)).toBe(true);
  });
  for (const c of fixture.millicents)
    it(`${c.costMillicents} m¢ · tax ${c.taxBps} · markup ${c.markupBps} → ${c.price} ¢${c.note ? ` (${c.note})` : ""}`, () => {
      expect(catalogPrice({ millicents: c.costMillicents }, c.taxBps, c.markupBps)).toBe(c.price);
    });
  it("the price counts from the exact cost, not from its mirror: 1.499 ¢ + 100 % = 3 ¢, the mirror 1 ¢ would give 2 ¢", () => {
    expect(catalogPrice({ millicents: 1499 }, 0, 10000)).toBe(3);
    expect(catalogPrice(millicentsToCents(1499), 0, 10000)).toBe(2);
  });
});

describe("engine:millicents — exactUnitCost: the line's total ÷ its quantity", () => {
  it("$2.25 for 10 pcs (printed «0.23 for 100») → 22 500; $10.30 for 250 → 4 120", () => {
    expect(exactUnitCost(225, 10)).toBe(22500);
    expect(exactUnitCost(1030, 250)).toBe(4120);
  });
  it("$1.00 for 3 → 33 333 (the error is under 0.001 ¢ a unit); 2 for 3 → 666 667 (half up)", () => {
    expect(exactUnitCost(100, 3)).toBe(33333);
    expect(Math.abs(33333 / 1000 - 100 / 3)).toBeLessThan(0.001);
    expect(exactUnitCost(2000, 3)).toBe(666667);
  });
  it("a fractional quantity (12.5 ft) and a decimal string", () => {
    expect(exactUnitCost(1000, 12.5)).toBe(80000);
    expect(exactUnitCost(1000, "12.5")).toBe(80000);
  });
  it("no quantity, a negative total, a fraction of a cent in the total — refused, not guessed", () => {
    expect(() => exactUnitCost(225, 0)).toThrow();
    expect(() => exactUnitCost(225, -1)).toThrow();
    expect(() => exactUnitCost(-225, 10)).toThrow();
    expect(() => exactUnitCost(2.5, 10)).toThrow();
  });
});

describe("engine:millicents — the mirror and the way back", () => {
  it("the mirror is half up, as all money: 22 500 → 23, 22 499 → 22, 4 120 → 4, 500 → 1", () => {
    expect(millicentsToCents(22500)).toBe(23);
    expect(millicentsToCents(22499)).toBe(22);
    expect(millicentsToCents(4120)).toBe(4);
    expect(millicentsToCents(500)).toBe(1);
    expect(millicentsToCents(0)).toBe(0);
  });
  it("cents → thousandths are exact; a cost that is not whole is refused (never a JS fraction in, #1926 Ж6)", () => {
    expect(centsToMillicents(23)).toBe(23000);
    expect(() => centsToMillicents(22.5)).toThrow();
    expect(() => catalogPrice({ millicents: 22500.5 }, 0, 0)).toThrow();
  });
  it("a cost with the supplier's tax in it, without the tax, in thousandths: $1.08 at 8 % → 100 000; 24.35625 ¢ at 8.25 % → 22 500", () => {
    expect(costWithoutTaxMillicents({ millicents: 108000 }, 800)).toBe(100000);
    expect(costWithoutTaxMillicents({ millicents: 24356 }, 825)).toBe(22500);
    // the old function in cents keeps its answer
    expect(costWithoutTax(108, 800)).toBe(100);
    expect(costWithoutTaxMillicents(108, 800)).toBe(100000);
  });
});

describe("engine:millicents — the line of #1926 (37 pcs, $22.50 for 100, 10 %)", () => {
  const l = fixture.line;
  it("unit price 25 ¢ (whole), the client's line 925 ¢, our cost 833 ¢ — not 851 ¢ from the rounded 23 ¢", () => {
    const unit = catalogPrice({ millicents: l.costMillicents }, l.taxBps, l.markupBps);
    expect(unit).toBe(l.unitPrice);
    expect(lineTotal({ quantity: l.qty, unitPriceCents: unit } as never)).toBe(l.lineTotal);
    expect(roundCents(dec(l.qty).mul(unitCostDec({ millicents: l.costMillicents })))).toBe(l.lineCost);
    expect(roundCents(dec(l.qty).mul(unitCostDec(millicentsToCents(l.costMillicents))))).toBe(851);
  });
});
