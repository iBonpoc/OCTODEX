/** Invoice status from the balance (map §5: derived, never stored): every case. */
import { describe, expect, it } from "vitest";
import { invoiceBalance, invoiceState, invoiceStatusView } from "@/features/invoiceStatus";

describe("invoice status", () => {
  it("not paid → «Ждёт оплаты» (info)", () => {
    expect(invoiceStatusView({ totalCents: 10000, paidCents: 0 })).toEqual({ s: "info", l: "money.awaiting", state: "unpaid" });
  });
  it("partly paid → «Оплачен частично» (info)", () => {
    expect(invoiceStatusView({ totalCents: 10000, paidCents: 2500 })).toEqual({ s: "info", l: "card.st.partial", state: "partial" });
    expect(invoiceBalance({ totalCents: 10000, paidCents: 2500 }).owesCents).toBe(7500);
  });
  it("paid in full → «Оплачено» (ok)", () => {
    expect(invoiceStatusView({ totalCents: 10000, paidCents: 10000 })).toEqual({ s: "ok", l: "st.paid", state: "paid" });
  });
  it("overpaid → paid, owes 0 (the extra is the client's credit, not a negative debt)", () => {
    expect(invoiceState({ totalCents: 10000, paidCents: 12000 })).toBe("paid");
    expect(invoiceBalance({ totalCents: 10000, paidCents: 12000 }).owesCents).toBe(0);
  });
  it("zero amount → nothing to pay → paid", () => {
    expect(invoiceState({ totalCents: 0, paidCents: 0 })).toBe("paid");
    expect(invoiceBalance({ totalCents: 0, paidCents: 0 }).owesCents).toBe(0);
  });
  it("one cent left is still partial (integer cents)", () => {
    expect(invoiceState({ totalCents: 10000, paidCents: 9999 })).toBe("partial");
  });
});
