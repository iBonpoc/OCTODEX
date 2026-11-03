import { describe, it, expect } from "vitest";
import {
  computeOption, computeDeposit, depositTaxPart, refundAllocation, pretaxFromInclusive, purchaseTax,
  ValidationError, type Line, type TaxContext,
} from "../src/estimate.js";

const NO_TAX: TaxContext = { mode: "added_on_top", enabled: false, rateBps: 0 };
const L = (quantity: string | number, unitPriceCents: number, extra: Partial<Line> = {}): Line =>
  ({ name: "line", quantity: String(quantity), unitPriceCents, ...extra });

// Shared set used by T5, T18, TX1, TX5, TX6, TX12
const T5_LINES = [L(150, 600, { taxable: true }), L(150, 800, { taxable: false })];
const T5_DISC = { kind: "fixed", cents: 10000 } as const;

describe("PRD 05 §7.3 — estimate totals", () => {
  it("T1: 148 LF × $10.00", () => {
    const r = computeOption([L(148, 1000)], NO_TAX);
    expect(r.lineTotals[0]).toBe(148000);
    expect(r.total).toBe(148000);
  });
  it("T2: 148.625 LF × $12.50 rounds half up to $1,857.81", () => {
    expect(computeOption([L("148.625", 1250)], NO_TAX).total).toBe(185781);
  });
  it("T3: 2.5 ea × $0.33 = 82.5¢ → $0.83", () => {
    expect(computeOption([L("2.5", 33)], NO_TAX).total).toBe(83);
  });
  it("T4: discount 10%, no tax", () => {
    const r = computeOption([L(150, 1200), L(40, 1100), L(1, 15000)], NO_TAX, { kind: "pct", value: "0.10" });
    expect([r.subtotal, r.discount, r.total]).toEqual([239000, 23900, 215100]);
  });
  it("T5: manual tax 9.75%, fixed discount spread to taxable part", () => {
    const r = computeOption(T5_LINES, { mode: "added_on_top", enabled: true, rateBps: 975 }, T5_DISC);
    expect([r.subtotal, r.taxableDisc, r.tax, r.net, r.total]).toEqual([210000, 4286, 8357, 200000, 208357]);
  });
  it("T6: optional add-on not selected vs selected", () => {
    const base = L(1, 300000);
    expect(computeOption([base, L(150, 1400, { isOptional: true })], NO_TAX).total).toBe(300000);
    expect(computeOption([base, L(150, 1400, { isOptional: true, selected: true })], NO_TAX).total).toBe(510000);
  });
  it("T7: hidden BOM adds cost, not price; margin 62.3%", () => {
    const r = computeOption([L(150, 1200, { unitCostCents: 410 }), L(75, 0, { unitCostCents: 85, clientVisible: false })], NO_TAX);
    expect([r.total, r.cost, r.margin, r.marginPct]).toEqual([180000, 67875, 112125, "62.3"]);
  });
  it("T8 / T8b: CA deposit cap", () => {
    expect(computeDeposit(208357, { kind: "pct", value: "0.5" }).deposit).toBe(20836);
    expect(computeDeposit(1500000, { kind: "pct", value: "0.1" }).deposit).toBe(100000);
  });
  it("T9: fixed discount larger than subtotal is capped, total $0 with warning", () => {
    const r = computeOption([L(1, 40000)], NO_TAX, { kind: "fixed", cents: 50000 });
    expect([r.discount, r.total]).toEqual([40000, 0]);
    expect(r.warnings).toContain("Итог $0");
  });
  it("T10: 7.5% of $2,217.00 = 16627.5¢ → $166.28", () => {
    const r = computeOption([L(1, 221700)], NO_TAX, { kind: "pct", value: "0.075" });
    expect([r.discount, r.total]).toEqual([16628, 205072]);
  });
  it("T11: optional taxable add-on", () => {
    const tax: TaxContext = { mode: "added_on_top", enabled: true, rateBps: 975 };
    expect(computeOption([L(1, 100000), L(1, 20000, { taxable: true, isOptional: true })], tax).total).toBe(100000);
    const r = computeOption([L(1, 100000), L(1, 20000, { taxable: true, isOptional: true, selected: true })], tax);
    expect([r.tax, r.total]).toEqual([1950, 121950]);
  });
  it("T16: change order adds to job amount", () => {
    const co = computeOption([L(12, 1800)], NO_TAX).total;
    expect(321575 + co).toBe(343175);
  });
  it("T17: hidden line with a price is a validation error", () => {
    expect(() => computeOption([L(1, 500, { clientVisible: false })], NO_TAX)).toThrow(ValidationError);
  });
  it("T18: same as T5 but tax disabled", () => {
    const r = computeOption(T5_LINES, { mode: "added_on_top", enabled: false, rateBps: 975 }, T5_DISC);
    expect([r.tax, r.total]).toEqual([0, 200000]);
  });
});

describe("PRD 18 §K — tax modes", () => {
  it("TX1: included_in_price ignores taxable flags", () => {
    const r = computeOption(T5_LINES, { mode: "included_in_price", enabled: true, rateBps: 975 }, T5_DISC);
    expect([r.tax, r.total]).toEqual([0, 200000]);
  });
  it("TX4: purchase tax goes into cost without rounding the unit cost", () => {
    const r = computeOption([L(147, 0, { unitCostCents: 140, unitMaterialCostCents: 140, purchaseTaxBps: 1025, clientVisible: false })],
      { mode: "included_in_price", enabled: false, rateBps: 0 });
    expect(r.cost).toBe(22689);
  });
  it("TX5 / TX6: added_on_top on and off", () => {
    expect(computeOption(T5_LINES, { mode: "added_on_top", enabled: true, rateBps: 975 }, T5_DISC).total).toBe(208357);
    expect(computeOption(T5_LINES, { mode: "added_on_top", enabled: false, rateBps: 975 }, T5_DISC).total).toBe(200000);
  });
  it("TX7: tax is rounded once per document, not per line", () => {
    const r = computeOption([L(1, 5, { taxable: true }), L(1, 5, { taxable: true }), L(1, 5, { taxable: true })],
      { mode: "added_on_top", enabled: true, rateBps: 950 });
    expect(r.tax).toBe(1);
  });
  it("TX9: Mexico IVA 16% included in price", () => {
    const r = computeOption([L(10, 11600, { taxable: true }), L(1, 50000)], { mode: "tax_inclusive_display", enabled: true, rateBps: 1600 });
    expect([r.total, r.tax, r.revenue]).toEqual([166000, 16000, 150000]);
  });
  it("TX10: IVA on $99.99", () => {
    const r = computeOption([L(1, 9999, { taxable: true })], { mode: "tax_inclusive_display", enabled: true, rateBps: 1600 });
    expect([r.tax, r.revenue]).toEqual([1379, 8620]);
  });
  it("TX11: IVA with 10% discount", () => {
    const r = computeOption([L(10, 11600, { taxable: true }), L(1, 50000)],
      { mode: "tax_inclusive_display", enabled: true, rateBps: 1600 }, { kind: "pct", value: "0.10" });
    expect([r.discount, r.taxableDisc, r.tax, r.total, r.revenue]).toEqual([16600, 11600, 14400, 149400, 135000]);
  });
  it("TX12: exempt profile never taxes", () => {
    expect(computeOption(T5_LINES, { mode: "exempt", enabled: true, rateBps: 975 }, T5_DISC).total).toBe(200000);
  });
  it("TX13–TX16: refund allocation by mode", () => {
    expect(refundAllocation(10000, 208357, 8357, "added_on_top")).toEqual({ tax: 401, revenue: 9599 });
    expect(refundAllocation(16600, 166000, 16000, "tax_inclusive_display")).toEqual({ tax: 1600, revenue: 15000 });
    expect(refundAllocation(20000, 200000, 0, "included_in_price")).toEqual({ tax: 0, revenue: 20000 });
    expect(refundAllocation(20000, 200000, 0, "exempt")).toEqual({ tax: 0, revenue: 20000 });
  });
  it("TX17 / TX17b: deposit and tax", () => {
    const dep = computeDeposit(208357, { kind: "pct", value: "0.1" }).deposit;
    expect(dep).toBe(20836);
    expect(200000 + 8357 - dep).toBe(187521); // in_final
    const depTax = depositTaxPart(dep, 8357, 208357);
    expect(depTax).toBe(836);
    expect(8357 - depTax).toBe(7521);
  });
  it("TX19: pre-tax price from a tax-inclusive shelf tag", () => {
    expect(pretaxFromInclusive(1103, 1025)).toBe(1000);
  });
  it("TX21: purchase tax on a PO", () => {
    expect(purchaseTax(20580, 1025)).toBe(2109);
  });
});

describe("Deposits by contract type (LEG-05)", () => {
  it("Service & Repair blocks deposits", () => {
    expect(computeDeposit(60000, { kind: "pct", value: "0.1", contractType: "ca_service_repair" }).deposit).toBe(0);
  });
  it("Non-HIC is not capped", () => {
    expect(computeDeposit(500000, { kind: "pct", value: "0.5", contractType: "non_hic" }).deposit).toBe(250000);
  });
});
