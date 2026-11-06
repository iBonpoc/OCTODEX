import { describe, it, expect } from "vitest";
import { jobLineQty, jobLinesTotals, taxModeFor } from "../src/jobLines.js";

// The same numbers are checked in the database (supabase/tests/core_rls.sql T41, app.job_lines_totals). Test prices.
const JOB_LINES_CASE = {
  lines: [
    { quantity: "2.5", unitPriceCents: 1999, taxable: true }, // 4997.5 → 4998
    { quantity: "3", unitPriceCents: 4500, taxable: false }, // 13500
    { quantity: "0.3333", unitPriceCents: 1000, taxable: true }, // 333.3 → 333
  ],
  rateBps: 1025,
};

describe("job lines (a job without an estimate)", () => {
  it("line totals half up, subtotal, tax on taxable lines only, total", () => {
    const r = jobLinesTotals(JOB_LINES_CASE.lines, { enabled: true, rateBps: JOB_LINES_CASE.rateBps });
    expect(r.lineTotals).toEqual([4998, 13500, 333]);
    expect(r.subtotal).toBe(18831);
    // taxable 5331 × 10.25% = 546.4275 → 546
    expect(r.tax).toBe(546);
    expect(r.total).toBe(19377);
  });
  it("tax off: total = subtotal", () => {
    expect(jobLinesTotals(JOB_LINES_CASE.lines, { enabled: false, rateBps: 1025 })).toMatchObject({ tax: 0, total: 18831 });
  });
  it("the quantity counts as stored (4 places, half up): 1.00004 × $125.00 = $125.00", () => {
    expect(jobLinesTotals([{ quantity: "1.00004", unitPriceCents: 12500 }], { enabled: false, rateBps: 0 }).total).toBe(12500);
    expect(jobLineQty("1.00005")).toBe("1.0001");
    expect(jobLineQty("2.5")).toBe("2.5");
  });
  it("half a cent of tax rounds up", () => {
    // 100 × 5% = 5.0; 10 × 5% = 0.5 → 1
    expect(jobLinesTotals([{ quantity: "1", unitPriceCents: 10, taxable: true }], { enabled: true, rateBps: 500 }).tax).toBe(1);
  });
  it("no lines: all zero", () => {
    expect(jobLinesTotals([], { enabled: true, rateBps: 1025 })).toEqual({ subtotal: 0, tax: 0, total: 0, lineTotals: [] });
  });
  it("tax mode of a client", () => {
    expect(taxModeFor(true)).toBe("exempt");
    expect(taxModeFor(false)).toBe("added_on_top");
    expect(taxModeFor(undefined)).toBe("added_on_top");
  });
});
