/**
 * Refund allocation (step 20д, docs/specs/35-stripe.md §4в; PRD 19 §7.9, PRD 18 TX13–TX16): the same numbers the database
 * keeps in refunds.tax_cents / net_cents (app.refund_tax_part, T133) — proportional and half up for added_on_top /
 * tax_inclusive_display, 0 for included_in_price / exempt; the parts always sum to the refund.
 */
import { describe, it, expect } from "vitest";
import { refundAllocation, type TaxMode } from "../src";

describe("refundAllocation — the database's parity (T133)", () => {
  it("TX13 as T133: $100.00 of $2,083.57 with $83.57 tax", () => {
    expect(refundAllocation(10000, 208357, 8357, "added_on_top")).toEqual({ tax: 401, revenue: 9599 });
    expect(refundAllocation(40000, 208357, 8357, "added_on_top")).toEqual({ tax: 1604, revenue: 38396 });
  });
  it("half up, like round() of Postgres for positive cents", () => {
    expect(refundAllocation(1, 100, 50, "added_on_top")).toEqual({ tax: 1, revenue: 0 });
    expect(refundAllocation(1, 300, 100, "tax_inclusive_display")).toEqual({ tax: 0, revenue: 1 });
  });
  it("a full refund gives back all the tax", () => {
    expect(refundAllocation(208357, 208357, 8357, "added_on_top")).toEqual({ tax: 8357, revenue: 200000 });
  });
  it("no tax part without a total, or in included / exempt", () => {
    expect(refundAllocation(5000, 0, 0, "added_on_top")).toEqual({ tax: 0, revenue: 5000 });
    for (const m of ["included_in_price", "exempt"] as TaxMode[]) expect(refundAllocation(5000, 20000, 900, m)).toEqual({ tax: 0, revenue: 5000 });
  });
  it("the parts always sum to the refund", () => {
    for (let r = 1; r <= 208357; r += 7919) {
      const a = refundAllocation(r, 208357, 8357, "added_on_top");
      expect(a.tax + a.revenue).toBe(r);
      expect(a.tax).toBeGreaterThanOrEqual(0);
    }
  });
});
