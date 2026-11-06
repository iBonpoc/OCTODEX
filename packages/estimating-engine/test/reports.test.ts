import { describe, expect, it } from "vitest";
import { agingBucket, owedByClient, sumCents, totalsBy } from "../src/index.js";

describe("sumCents", () => {
  it("adds integer cents", () => expect(sumCents([10825, 1, 0, 999999])).toBe(1010825));
  it("empty is 0", () => expect(sumCents([])).toBe(0));
  it("a fraction is a bug", () => expect(() => sumCents([100, 0.5])).toThrow());
});

describe("totalsBy", () => {
  it("sums and counts by key, biggest first, ties by key", () => {
    expect(
      totalsBy([
        { key: "zelle", cents: 5000 },
        { key: "cash", cents: 2500 },
        { key: "zelle", cents: 1000 },
        { key: "check", cents: 2500 },
      ]),
    ).toEqual([
      { key: "zelle", cents: 6000, count: 2 },
      { key: "cash", cents: 2500, count: 1 },
      { key: "check", cents: 2500, count: 1 },
    ]);
  });
  it("empty", () => expect(totalsBy([])).toEqual([]));
  it("a fraction is a bug", () => expect(() => totalsBy([{ key: "a", cents: 1.5 }])).toThrow());
});

describe("agingBucket — edges 0/1/30/31/60/61/90/91", () => {
  it.each([
    [-5, "current"], [0, "current"], [1, "d1_30"], [30, "d1_30"], [31, "d31_60"], [60, "d31_60"], [61, "d61_90"], [90, "d61_90"], [91, "d90p"], [400, "d90p"],
  ])("%i days → %s", (d, b) => expect(agingBucket(d)).toBe(b));
});

describe("owedByClient («Кто должен»)", () => {
  it("by client, by age, biggest debt first; paid and overpaid owe nothing", () => {
    const rows = owedByClient([
      { customerId: "a", totalCents: 10000, paidCents: 4000, daysOverdue: 12 },
      { customerId: "a", totalCents: 5000, paidCents: 0, daysOverdue: -3 },
      { customerId: "b", totalCents: 20000, paidCents: 0, daysOverdue: 95 },
      { customerId: "c", totalCents: 3000, paidCents: 3000, daysOverdue: 40 },
      { customerId: "d", totalCents: 3000, paidCents: 3500, daysOverdue: 40 },
    ]);
    expect(rows.map((r) => r.customerId)).toEqual(["b", "a"]);
    expect(rows[0]).toEqual({ customerId: "b", owesCents: 20000, overdueCents: 20000, maxDaysOverdue: 95, invoices: 1, buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 20000 } });
    expect(rows[1]).toEqual({ customerId: "a", owesCents: 11000, overdueCents: 6000, maxDaysOverdue: 12, invoices: 2, buckets: { current: 5000, d1_30: 6000, d31_60: 0, d61_90: 0, d90p: 0 } });
  });
  it("buckets add up to what is owed", () => {
    const [r] = owedByClient([
      { customerId: "x", totalCents: 101, paidCents: 0, daysOverdue: 31 },
      { customerId: "x", totalCents: 202, paidCents: 1, daysOverdue: 61 },
      { customerId: "x", totalCents: 303, paidCents: 0, daysOverdue: 0 },
    ]);
    expect(Object.values(r!.buckets).reduce((s, c) => s + c, 0)).toBe(r!.owesCents);
    expect(r!.owesCents).toBe(605);
  });
  it("empty", () => expect(owedByClient([])).toEqual([]));
});

import { centsToDecimal, salesFunnel } from "../src/index.js";

describe("salesFunnel («Продажи»)", () => {
  it("sent, signed, value of the signed only, share half up", () => {
    expect(
      salesFunnel([
        { sent: true, signed: true, cents: 120000 },
        { sent: true, signed: false, cents: 50000 },
        { sent: true, signed: false, cents: 1 },
        { sent: false, signed: true, cents: 30050 },
      ]),
    ).toEqual({ sent: 3, signed: 2, signedCents: 150050, signedPct: 67 });
  });
  it("1 of 8 = 12.5% → 13; nothing sent → 0", () => {
    expect(salesFunnel([{ sent: true, signed: true, cents: 0 }, ...Array.from({ length: 7 }, () => ({ sent: true, signed: false, cents: 0 }))]).signedPct).toBe(13);
    expect(salesFunnel([{ sent: false, signed: true, cents: 100 }]).signedPct).toBe(0);
    expect(salesFunnel([])).toEqual({ sent: 0, signed: 0, signedCents: 0, signedPct: 0 });
  });
});

describe("centsToDecimal (CSV)", () => {
  it.each([[0, "0.00"], [5, "0.05"], [184000, "1840.00"], [184050, "1840.50"], [-2500, "-25.00"], [-7, "-0.07"]])("%i → %s", (c, s) => expect(centsToDecimal(c)).toBe(s));
  it("a fraction is a bug", () => expect(() => centsToDecimal(1.5)).toThrow());
});

describe("T45 fixture — the same numbers as supabase/tests/core_rls.sql T45", () => {
  // zelle 10000 (owner), cash 5000 (office), zelle 4000 − 1000 refunded (office)
  const pays = [
    { method: "zelle", by: "owner", net: 10000 },
    { method: "cash", by: "office", net: 5000 },
    { method: "zelle", by: "office", net: 3000 },
  ];
  it("by method: zelle 13000 ×2, cash 5000 ×1", () =>
    expect(totalsBy(pays.map((p) => ({ key: p.method, cents: p.net })))).toEqual([{ key: "zelle", cents: 13000, count: 2 }, { key: "cash", cents: 5000, count: 1 }]));
  it("by person: owner 10000, office 8000", () =>
    expect(totalsBy(pays.map((p) => ({ key: p.by, cents: p.net }))).map((x) => x.cents)).toEqual([10000, 8000]));
  it("the invoice: paid 18000, owes 12000", () => {
    const [r] = owedByClient([{ customerId: "kim", totalCents: 30000, paidCents: sumCents(pays.map((p) => p.net)), daysOverdue: 9 }]);
    expect(r).toMatchObject({ owesCents: 12000, overdueCents: 12000, buckets: { d1_30: 12000 } });
  });
});
