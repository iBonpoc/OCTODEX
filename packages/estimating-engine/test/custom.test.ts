import { describe, it, expect } from "vitest";
import {
  computeCustomOption, catalogCost, catalogPrice, depositAmount, caDepositLimit, parseMoneyToCents, parsePctToBps, parseQty,
  DEFAULT_TAX, type CustomLine, type CustomSettings,
} from "../src/custom.js";

let n = 0;
const L = (group: CustomLine["group"], quantity: string, unitPriceCents: number, extra: Partial<CustomLine> = {}): CustomLine => ({
  id: `l${n++}`, name: `${group} line`, group, quantity, unit: "ea", unitPriceCents, ...extra,
});
const S = (over: Partial<CustomSettings> = {}): CustomSettings => ({ discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" }, ...over });

// Handyman visit: haul trash, remove carpet, install railing, replace bulb (test prices).
const HANDYMAN = {
  id: "o1",
  name: "Good",
  lines: [
    L("service", "1", 15000, { name: "Haul away debris" }),
    L("labor", "120", 150, { name: "Remove carpet", unit: "sq ft" }),
    L("labor", "1", 25000, { name: "Install stair railing" }),
    L("material", "12", 1213, { name: "Railing bracket", unitCostCents: 1103 }),
    L("material", "1", 800, { name: "LED bulb" }),
    L("service", "1", 9000, { name: "Deep clean", optional: true }),
  ],
};

describe("universal estimate", () => {
  it("sums groups, tax off by default, add-on not included until selected", () => {
    const r = computeCustomOption(HANDYMAN, S());
    expect(r.groupSubtotals).toEqual({ service: 15000, labor: 43000, material: 15356 });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(73356);
  });
  it("selected add-on is included", () => {
    const o = { ...HANDYMAN, lines: HANDYMAN.lines.map((l) => (l.optional ? { ...l, selected: true } : l)) };
    expect(computeCustomOption(o, S()).total).toBe(82356);
  });
  it("tax only on materials (separate line, on top)", () => {
    const r = computeCustomOption(HANDYMAN, S({ tax: { enabled: true, rateBps: 950, groups: { service: false, labor: false, material: true } } }));
    expect(r.taxableSub).toBe(15356);
    expect(r.tax).toBe(1459); // 15356 × 9.5% = 1458.82
    expect(r.total).toBe(73356 + 1459);
  });
  it("tax switched on but no group selected → no tax", () => {
    const r = computeCustomOption(HANDYMAN, S({ tax: { enabled: true, rateBps: 950, groups: { service: false, labor: false, material: false } } }));
    expect(r.tax).toBe(0);
  });
  it("discount is spread to the taxable part proportionally", () => {
    const r = computeCustomOption(HANDYMAN, S({
      discount: { kind: "fixed", cents: 7336 },
      tax: { enabled: true, rateBps: 1000, groups: { service: true, labor: true, material: true } },
    }));
    expect(r.net).toBe(66020);
    expect(r.tax).toBe(6602);
  });
  it("margin uses cost incl. supplier tax", () => {
    const o = { id: "o", name: "x", lines: [L("material", "10", 1213, { unitCostCents: 1103 })] };
    const r = computeCustomOption(o, S());
    expect(r.cost).toBe(11030);
    expect(r.margin).toBe(1100);
  });
  it("blank lines are ignored", () => {
    const o = { id: "o", name: "x", lines: [L("labor", "1", 0, { name: " " }), L("labor", "1", 500)] };
    expect(computeCustomOption(o, S()).lineTotals).toHaveLength(1);
  });
});

describe("deposit", () => {
  it("percent: any 1–100%", () => {
    expect(depositAmount(200000, { kind: "pct", bps: 500 })).toBe(10000);
    expect(depositAmount(200000, { kind: "pct", bps: 10000 })).toBe(200000);
    expect(depositAmount(333, { kind: "pct", bps: 100 })).toBe(3); // 3.33 → 3
  });
  it("fixed amount is not more than the total", () => {
    expect(depositAmount(200000, { kind: "fixed", cents: 50000 })).toBe(50000);
    expect(depositAmount(20000, { kind: "fixed", cents: 50000 })).toBe(20000);
  });
  it("CA limit is a warning, not a cap", () => {
    expect(caDepositLimit(2000000)).toBe(100000);
    expect(caDepositLimit(50000)).toBe(5000);
    const r = computeCustomOption(HANDYMAN, S({ deposit: { kind: "pct", bps: 2000 }, caHic: true }));
    expect(r.deposit).toBe(14671);
    expect(r.depositOverCaLimit).toBe(true);
    expect(computeCustomOption(HANDYMAN, S({ deposit: { kind: "pct", bps: 1000 }, caHic: true })).depositOverCaLimit).toBe(false);
    expect(computeCustomOption(HANDYMAN, S({ deposit: { kind: "pct", bps: 2000 } })).depositOverCaLimit).toBe(false);
  });
});

describe("catalog price", () => {
  it("$10 at 10.25% supplier tax = $11.03 cost; +10% markup = $12.13", () => {
    expect(catalogCost(1000, 1025)).toBe(1103);
    expect(catalogPrice(1000, 1025, 1000)).toBe(1213);
    expect(catalogPrice(1000, 0, 0)).toBe(1000);
  });
});

describe("input parsing", () => {
  it("money", () => {
    expect(parseMoneyToCents("$1,234.5")).toBe(123450);
    expect(parseMoneyToCents("11.025")).toBe(1103);
    expect(parseMoneyToCents("abc")).toBeNull();
  });
  it("percent and qty", () => {
    expect(parsePctToBps("10.25")).toBe(1025);
    expect(parsePctToBps("10,25%")).toBe(1025);
    expect(parseQty("1,5")).toBe("1.5");
    expect(parseQty("-1")).toBeNull();
  });
});
