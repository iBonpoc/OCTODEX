import { describe, it, expect } from "vitest";
import { acceptPayment, clientMoney, contractStatement, progressAmount } from "../src/contract.js";

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
