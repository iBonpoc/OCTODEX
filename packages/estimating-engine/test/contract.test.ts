import { describe, it, expect } from "vitest";
import { visitPayment, acceptPayment, clientMoney, contractStatement, progressAmount } from "../src/contract.js";

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
