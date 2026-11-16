import { describe, it, expect } from "vitest";
import { jobLineQty, jobLinesTotals, taxModeFor } from "../src/jobLines.js";
import { dec } from "../src/decimal.js";
import { lineTotal } from "../src/estimate.js";

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

// #817 (founder 11.11, release plan §8.1 п.3, G-15): a gutter's length in the estimate as on the drawing, within 1/16″ —
// four places of a foot (numeric(14,4)); the line's cents are qty × price, half up, the same as the server's
// floor(quantity * unit_price_cents + 0.5)
describe("#817 a length in feet to four places, and its cents", () => {
  it("40′ 5″ → 40.4167 ft (not 40.42 = 40′ 5 1/16″); 19′ 2″ → 19.1667", () => {
    expect(jobLineQty(dec(485).div(12))).toBe("40.4167");
    expect(jobLineQty(dec(230).div(12))).toBe("19.1667");
  });
  it("the line: 40.4167 × $12.34 = $498.74 (49874.2078¢ → 49874); 19.1667 × $11.99 → 22981 (it was 19.17 → 22985)", () => {
    expect(lineTotal({ name: "Gutter", quantity: jobLineQty(dec(485).div(12)), unitPriceCents: 1234 })).toBe(49874);
    expect(lineTotal({ name: "Gutter", quantity: jobLineQty(dec(230).div(12)), unitPriceCents: 1199 })).toBe(22981);
  });
  it("half a cent goes up, as on the server", () => {
    expect(lineTotal({ name: "x", quantity: "0.0005", unitPriceCents: 1000 })).toBe(1); // 0.5¢ → 1
    expect(lineTotal({ name: "x", quantity: "0.0004", unitPriceCents: 1000 })).toBe(0); // 0.4¢ → 0
  });
});
