import { describe, it, expect } from "vitest";
import { acceptPayment, contractStatement, progressAmount } from "../src/contract.js";

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
