import { describe, it, expect } from "vitest";
import { visitPayment, acceptPayment, canIssue, clientMoney, contractStatement, invoiceTaxShare, progressAmount } from "../src/contract.js";

describe("contract statement", () => {
  it("$3,400 contract, 10% deposit invoiced and paid", () => {
    const s = contractStatement(340000, [{ totalCents: 34000, paidCents: 34000 }]);
    expect(s).toEqual({ contract: 340000, invoiced: 34000, paid: 34000, toInvoice: 306000, due: 0, remaining: 306000 });
  });
  it("final balance invoice partially paid; void invoices ignored", () => {
    const s = contractStatement(340000, [
      { totalCents: 34000, paidCents: 34000 },
      { totalCents: 306000, paidCents: 100000 },
      { totalCents: 50000, paidCents: 0, void: true },
    ]);
    expect([s.invoiced, s.paid, s.toInvoice, s.due, s.remaining]).toEqual([340000, 134000, 0, 206000, 206000]);
  });
  it("progress invoice: 50% of $3,400 = $1,700, capped by what is left", () => {
    expect(progressAmount(340000, 34000, 5000)).toBe(170000);
    expect(progressAmount(340000, 300000, 5000)).toBe(40000);
    expect(progressAmount(333, 0, 3333)).toBe(111); // 110.99 → 111
  });
  it("payment can't exceed the balance", () => {
    expect(acceptPayment({ totalCents: 306000, paidCents: 100000 }, 300000)).toBe(206000);
    expect(acceptPayment({ totalCents: 1000, paidCents: 1000 }, 500)).toBe(0);
  });
});

describe("clientMoney (client card: owes / paid total)", () => {
  it("owes = unpaid part of live invoices; void invoices and overpaid ones add nothing", () => {
    const r = clientMoney(
      [
        { totalCents: 100_00, paidCents: 40_00 },
        { totalCents: 50_00, paidCents: 50_00 },
        { totalCents: 70_00, paidCents: 0, void: true },
        { totalCents: 20_00, paidCents: 25_00 },
      ],
      [40_00, 50_00, 25_00],
    );
    expect(r).toEqual({ owesCents: 60_00, paidTotalCents: 115_00, invoicedCents: 170_00 });
  });
  it("refunds are already netted into payments; the total never goes below zero", () => {
    expect(clientMoney([], [100_00, -30_00]).paidTotalCents).toBe(70_00);
    expect(clientMoney([], [-5_00]).paidTotalCents).toBe(0);
    expect(clientMoney([], [])).toEqual({ owesCents: 0, paidTotalCents: 0, invoicedCents: 0 });
  });
});

// the same numbers as supabase/tests/core_rls.sql T179–T180 (test prices)
describe("visitPayment (#757: B-02, B-05, A-17)", () => {
  it("no invoice yet: a new final invoice for the whole contract", () => {
    expect(visitPayment(50000, [])).toEqual({ amountCents: 50000, into: "new", overCents: 0 });
  });
  it("a deposit billed: the new final invoice takes the rest, not the whole contract", () => {
    expect(visitPayment(50000, [{ kind: "deposit", totalCents: 15000, paidCents: 15000 }])).toEqual({ amountCents: 35000, into: "new", overCents: 0 });
  });
  it("a final invoice issued: the payment goes into it, for its balance (no second final)", () => {
    expect(visitPayment(50000, [{ kind: "final", totalCents: 50000, paidCents: 20000 }])).toEqual({ amountCents: 30000, into: "final", overCents: 0 });
  });
  it("all paid: nothing to take", () => {
    expect(visitPayment(50000, [{ kind: "final", totalCents: 50000, paidCents: 50000 }])).toEqual({ amountCents: 0, into: "none", overCents: 0 });
  });
  it("a voided final does not count", () => {
    expect(visitPayment(50000, [{ kind: "final", totalCents: 50000, paidCents: 0, void: true }])).toEqual({ amountCents: 50000, into: "new", overCents: 0 });
  });
  it("a deposit billed but not paid: still off what the visit takes (the deposit is its own invoice)", () => {
    expect(visitPayment(50000, [{ kind: "deposit", totalCents: 15000, paidCents: 0 }])).toEqual({ amountCents: 35000, into: "new", overCents: 0 });
  });
  // T181: the money in the tech's hand
  it("less in hand than due: a partial payment of it", () => {
    expect(visitPayment(40000, [], 15000)).toEqual({ amountCents: 15000, into: "new", overCents: 0 });
  });
  it("more in hand than due: refused — nothing recorded, the office takes it", () => {
    expect(visitPayment(40000, [{ kind: "final", totalCents: 40000, paidCents: 15000 }], 50000)).toEqual({ amountCents: 0, into: "final", overCents: 25000 });
  });
  it("nothing due (the office closed it meanwhile) and money in hand: refused too", () => {
    expect(visitPayment(40000, [{ kind: "final", totalCents: 40000, paidCents: 40000 }], 12000)).toEqual({ amountCents: 0, into: "none", overCents: 12000 });
  });
});

describe("#865: invoices of a contract — never more than the contract, the tax split inside", () => {
  it("Σ invoices never more than the contract ($10,000: $14,001 refused); void ones do not count", () => {
    const inv = [{ totalCents: 100000, paidCents: 100000 }, { totalCents: 400000, paidCents: 0 }];
    expect(canIssue(1000000, inv, 500000)).toBe(true);
    expect(canIssue(1000000, inv, 500001)).toBe(false);
    expect(canIssue(1000000, [], 1400100)).toBe(false);
    expect(canIssue(1000000, [...inv, { totalCents: 500000, paidCents: 0, void: true }], 500000)).toBe(true);
    expect(canIssue(1000000, [], 0)).toBe(false);
  });
  it("$10,950 with $950 tax: deposit 10% → $109.50 tax inside; progress; the last takes the rest — Σ tax = $950", () => {
    const C = 1095000, T = 95000;
    const inv: { totalCents: number; paidCents: number; taxCents: number }[] = [];
    const issue = (a: number) => { const tax = invoiceTaxShare(C, T, inv, a); inv.push({ totalCents: a, paidCents: 0, taxCents: tax }); return tax; };
    expect(issue(109500)).toBe(9500);
    expect(issue(333333)).toBe(28919); // 333333 × 950 / 10950 = 28919.3 → 28919
    expect(issue(C - 109500 - 333333)).toBe(T - 9500 - 28919);
    expect(inv.reduce((s, i) => s + i.taxCents, 0)).toBe(T);
    expect(inv.reduce((s, i) => s + i.totalCents, 0)).toBe(C);
  });
  it("rounding of many small invoices never runs the tax over: the last one gets what is left", () => {
    const C = 1000, T = 95;
    const inv: { totalCents: number; paidCents: number; taxCents: number }[] = [];
    for (let k = 0; k < 9; k++) inv.push({ totalCents: 111, paidCents: 0, taxCents: invoiceTaxShare(C, T, inv, 111) });
    inv.push({ totalCents: 1, paidCents: 0, taxCents: invoiceTaxShare(C, T, inv, 1) });
    expect(inv.reduce((s, i) => s + i.taxCents, 0)).toBe(T);
    expect(inv.every((i) => i.taxCents >= 0 && i.taxCents <= i.totalCents)).toBe(true);
  });
  it("no tax, no contract, a void invoice: its tax comes back to the next ones", () => {
    expect(invoiceTaxShare(1000000, 0, [], 500000)).toBe(0);
    expect(invoiceTaxShare(0, 950, [], 500)).toBe(0);
    const voided = [{ totalCents: 547500, paidCents: 0, taxCents: 47500, void: true }];
    expect(invoiceTaxShare(1095000, 95000, voided, 1095000)).toBe(95000);
  });
});
