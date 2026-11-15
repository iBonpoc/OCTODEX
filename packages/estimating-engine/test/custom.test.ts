import { describe, it, expect } from "vitest";
import {
  computeCustomOption, computeAllOptional, catalogCost, catalogPrice, depositAmount, depositSettingFromRule, caDepositLimit, parseMoneyToCents, parsePctToBps, parseQty, partsCost, marginPctOf,
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
  it("Н1: a quantity with 5+ decimals counts as the server keeps it (numeric(14,4), half away from zero)", () => {
    // a $10,000.00 price shows the 5th decimal: 1.23455 → 1.2346 → $12,346.00 (raw: $12,345.50)
    const o = (q: string) => ({ id: "o", name: "o", lines: [L("material", q, 1000000)] });
    expect(computeCustomOption(o("1.23455"), S()).total).toBe(1234600); // raw: 1234550
    expect(computeCustomOption(o("2.00004"), S()).total).toBe(2000000); // raw: 2000040
    expect(computeCustomOption(o("0.00005"), S()).total).toBe(100); // raw: 50
    expect(computeCustomOption(o("1.2345"), S()).total).toBe(1234500); // 4 decimals as they are
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

describe("catalog card: kit cost and margin % (test prices)", () => {
  it("kit cost = Σ unit cost × qty, rounded once", () => {
    expect(partsCost([{ unitCostCents: 1103, qty: "12" }, { unitCostCents: 333, qty: "0.5" }])).toBe(13236 + 167);
    expect(partsCost([{ unitCostCents: 1, qty: "0.5" }, { unitCostCents: 1, qty: "0.5" }])).toBe(1); // no per-part rounding
    expect(partsCost([])).toBe(0);
  });
  it("unknown when any part has no cost or a bad quantity", () => {
    expect(partsCost([{ unitCostCents: 1000, qty: "1" }, { qty: "2" }])).toBeNull();
    expect(partsCost([{ unitCostCents: 1000, qty: "abc" }])).toBeNull();
  });
  it("margin: one decimal; negative below cost; null at price 0 or unknown cost", () => {
    expect(marginPctOf(12130, 11030)).toBe("9.1");
    expect(marginPctOf(10000, 10000)).toBe("0.0");
    expect(marginPctOf(9000, 10000)).toBe("-11.1");
    expect(marginPctOf(0, 500)).toBeNull();
    expect(marginPctOf(10000, null)).toBeNull();
  });
});

// #544: the quick estimate's rule {"kind":"pct","value":"0.1"} is 10 %, as app.estimate_option_totals (T162)
describe("depositSettingFromRule — the server's deposit rule", () => {
  it("the quick estimate's share 0.1 is 10 %: $99.99 → $10.00", () => {
    const r = depositSettingFromRule({ kind: "pct", value: "0.1", contractType: "ca_hic" });
    expect(r).toEqual({ kind: "pct", bps: 1000 });
    expect(depositAmount(9999, r)).toBe(1000);
    expect(depositAmount(123456, depositSettingFromRule({ kind: "pct", value: 0.1 }))).toBe(12346);
  });
  it("the share counts as whole bps, round half up; above 1 — the whole total", () => {
    expect(depositSettingFromRule({ kind: "pct", value: "0.12345" })).toEqual({ kind: "pct", bps: 1235 });
    expect(depositSettingFromRule({ kind: "pct", value: ".25" })).toEqual({ kind: "pct", bps: 2500 });
    expect(depositAmount(10000, depositSettingFromRule({ kind: "pct", value: "2" }))).toBe(10000);
  });
  it("bps wins over value; fixed by cents; anything else — no deposit", () => {
    expect(depositSettingFromRule({ kind: "pct", bps: 500, value: "0.1" })).toEqual({ kind: "pct", bps: 500 });
    expect(depositSettingFromRule({ kind: "pct", bps: "1000" })).toEqual({ kind: "pct", bps: 1000 });
    expect(depositSettingFromRule({ kind: "fixed", cents: 5000 })).toEqual({ kind: "fixed", cents: 5000 });
    for (const bad of [null, undefined, "x", [], {}, { kind: "pct", value: "ten" }, { kind: "pct", value: "-0.1" }, { kind: "pct" }, { kind: "none" }]) {
      expect(depositAmount(10000, depositSettingFromRule(bad))).toBe(0);
    }
    expect(depositSettingFromRule({ kind: "pct", bps: "ten" })).toEqual({ kind: "none" });
  });
});

// #1362 (DS §8.9): «Если клиент включит всё на выбор — итог $Y» — the engine's own totals with the add-ons ticked (К1)
describe("computeAllOptional: the total if the client ticks every add-on", () => {
  const base = {
    id: "o2",
    name: "Good",
    lines: [
      L("labor", "1", 100000, { name: "Install gutters" }),
      L("material", "2", 25000, { name: "Guards", optional: true }),
      L("service", "1", 10000, { name: "Haul away", optional: true }),
    ],
  };
  it("no add-ons (or all already in): no line — null", () => {
    expect(computeAllOptional({ ...base, lines: [base.lines[0]!] }, S())).toBeNull();
    expect(computeAllOptional({ ...base, lines: base.lines.map((l) => (l.optional ? { ...l, selected: true } : l)) }, S())).toBeNull();
  });
  it("add-ons + discount + tax + deposit: $Y is the estimate's total as if every add-on were in", () => {
    const s = S({ discount: { kind: "pct", value: "0.1" }, tax: { enabled: true, rateBps: 1025, groups: { service: true, labor: true, material: true } }, deposit: { kind: "pct", bps: 1000 } });
    const now = computeCustomOption(base, s);
    const all = computeAllOptional(base, s)!;
    const ticked = computeCustomOption({ ...base, lines: base.lines.map((l) => (l.optional ? { ...l, selected: true } : l)) }, s);
    // the estimate itself does not change: the add-ons stay out of its total
    expect(now.subtotal).toBe(100000);
    // the same engine with the add-ons ticked: $1,000 + $500 + $100 = $1,600; −10 % = $1,440; tax 10.25 % = $147.60 → $1,587.60
    expect(all.subtotal).toBe(160000);
    expect(all.discount).toBe(16000);
    expect(all.tax).toBe(14760);
    expect(all.total).toBe(158760);
    expect(all.total).toBe(ticked.total);
    expect(all.deposit).toBe(15876);
    expect(all.total).toBeGreaterThan(now.total);
  });
  it("one add-on already ticked by the client: only the other is added", () => {
    const one = { ...base, lines: base.lines.map((l, i) => (i === 1 ? { ...l, selected: true } : l)) };
    expect(computeCustomOption(one, S()).total).toBe(150000);
    expect(computeAllOptional(one, S())!.total).toBe(160000);
  });
  it("an add-on the client cannot tick or that adds nothing (hidden, $0) does not count as one", () => {
    expect(computeAllOptional({ ...base, lines: [base.lines[0]!, L("service", "1", 0, { name: "Free check", optional: true })] }, S())).toBeNull();
    expect(computeAllOptional({ ...base, lines: [base.lines[0]!, L("service", "1", 0, { name: "Haul", optional: true, clientVisible: false })] }, S())).toBeNull();
  });
  it("a priced add-on flagged hidden counts — the client sees it (hidden only at $0, as toLine)", () => {
    const o = { ...base, lines: [base.lines[0]!, L("material", "1", 30000, { name: "Guards", optional: true, clientVisible: false })] };
    expect(computeAllOptional(o, S())!.total).toBe(130000);
  });
  it("a negative add-on is no offer: «если включит» never lowers the total", () => {
    expect(computeAllOptional({ ...base, lines: [base.lines[0]!, L("service", "1", -5000, { name: "Credit", optional: true })] }, S())).toBeNull();
  });
  it("a fixed discount: the same engine, the discount clamped as for the estimate", () => {
    const s = S({ discount: { kind: "fixed", cents: 20000 } });
    expect(computeAllOptional(base, s)!.total).toBe(160000 - 20000);
    expect(computeAllOptional(base, s)!.total).toBe(computeCustomOption({ ...base, lines: base.lines.map((l) => ({ ...l, selected: true })) }, s).total);
  });
  it("tax on a part of the groups and a rate in ppm: the same engine", () => {
    const part = S({ tax: { enabled: true, rateBps: 1000, groups: { service: false, labor: false, material: true } } });
    // material: the $500 guards only (the $1,000 install is labor, the $100 haul is service) → 10 % of $500 = $50
    expect(computeAllOptional(base, part)!.tax).toBe(5000);
    expect(computeAllOptional(base, part)!.total).toBe(165000);
    const ppm = S({ tax: { enabled: true, rateBps: 888, ratePpm: 88750, groups: { service: true, labor: true, material: true } } });
    const ticked = { ...base, lines: base.lines.map((l) => ({ ...l, selected: true })) };
    expect(computeAllOptional(base, ppm)!.total).toBe(computeCustomOption(ticked, ppm).total);
    expect(computeAllOptional(base, ppm)!.tax).toBe(14200);
  });
  it("an add-on with a price and quantity 0: the sum does not change", () => {
    const o = { ...base, lines: [base.lines[0]!, L("material", "0", 25000, { name: "Guards", optional: true })] };
    expect(computeAllOptional(o, S())!.total).toBe(computeCustomOption(o, S()).total);
  });
  it("a blank add-on (no name, no price) does not count as one", () => {
    expect(computeAllOptional({ ...base, lines: [base.lines[0]!, L("service", "1", 0, { name: "", optional: true })] }, S())).toBeNull();
  });
});
