/**
 * unit:refundApp — the refund sheet's rules (step 20д, docs/specs/35-stripe.md §4в; features/payments/refund.ts):
 * who may (owner/admin; the demo's «director»), Stripe or a record, tax by the invoice's mode (TX13 = T133), the demo's
 * refund with the database's limits, our words for the server's refusals — and the demo mutation never runs in the cloud.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { applyRefund, mayRefund, refundError, refundSplit, refundable, viaStripe } from "../src/features/payments/refund";
import type { Invoice, Payment } from "../src/data/types";

const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: "i1", customerId: "c1", jobId: "j1", totalCents: 208357, paidCents: 50000, dueDate: "2026-11-01", taxCents: 8357, taxMode: "added_on_top", ...o });
const pay = (o: Partial<Payment> = {}): Payment => ({ id: "p1", invoiceId: "i1", customerId: "c1", amountCents: 50000, method: "cash", at: "2026-11-02T18:00:00Z", ...o });
const DEMO = { mode: "demo" as const, appRole: "director" };

describe("unit:refundApp — who and how", () => {
  it("owner/admin in the cloud; the director in the demo; nobody else", () => {
    expect([mayRefund("owner", "cloud"), mayRefund("admin", "cloud"), mayRefund("office", "cloud"), mayRefund("tech", "cloud"), mayRefund(null, "cloud")]).toEqual([true, true, false, false, false]);
    expect([mayRefund(null, "demo", "director"), mayRefund(null, "demo", "tech"), mayRefund("owner", "demo", "sales")]).toEqual([true, false, false]);
  });
  it("only a payment Stripe took goes through Stripe; a card from the contractor's own terminal is a record", () => {
    expect(viaStripe({ method: "card", reference: "pi_3Abc" })).toBe(true);
    expect(viaStripe({ method: "ach", reference: "pi_3Abc" })).toBe(true);
    expect(viaStripe({ method: "card", reference: "1234" })).toBe(false);
    expect(viaStripe({ method: "card" })).toBe(false);
    expect(viaStripe({ method: "cash", reference: "pi_3Abc" })).toBe(false);
  });
  it("tax by the invoice's mode — the database's numbers (TX13, T133)", () => {
    expect(refundSplit(10000, inv())).toEqual({ tax: 401, revenue: 9599 });
    expect(refundSplit(10000, inv({ taxMode: "exempt" }))).toEqual({ tax: 0, revenue: 10000 });
    expect(refundSplit(10000, inv({ taxCents: undefined }))).toEqual({ tax: 0, revenue: 10000 });
    expect(refundSplit(10000, undefined)).toEqual({ tax: 0, revenue: 10000 });
    expect(refundSplit(10000, inv({ taxMode: undefined }))).toEqual({ tax: 401, revenue: 9599 });
  });
  it("the server's words → ours; anything else is «failed»", () => {
    expect(refundError("refund_above_available")).toBe("refund_above_available");
    expect(refundError("P0001: refund_disputed")).toBe("refund_disputed");
    expect(refundError("boom")).toBe("failed");
    expect(refundError(undefined)).toBe("failed");
  });
});

describe("unit:refundApp — the demo's refund (applyRefund)", () => {
  const db = { payments: [pay(), pay({ id: "p2", amountCents: 1000 })], invoices: [inv()] };
  it("never in the cloud, never by a tech", () => {
    expect(applyRefund(db, "p1", 100, { mode: "cloud", serverRole: "owner" })).toEqual({ ok: false, error: "not_allowed" });
    expect(applyRefund(db, "p1", 100, { mode: "demo", appRole: "tech" })).toEqual({ ok: false, error: "not_allowed" });
  });
  it("1 … what the payment still brings", () => {
    for (const a of [0, -5, 50001, 1.5]) expect(applyRefund(db, "p1", a, DEMO)).toEqual({ ok: false, error: "refund_above_available" });
    expect(applyRefund(db, "nope", 100, DEMO)).toEqual({ ok: false, error: "refund_not_refundable" });
  });
  it("partly: the payment is net of it (the cloud's shape), refunded grows, the invoice owes it again", () => {
    const r = applyRefund(db, "p1", 10000, DEMO);
    if (!r.ok) throw new Error(r.error);
    expect(r.payments.find((p) => p.id === "p1")).toMatchObject({ amountCents: 40000, refundedCents: 10000 });
    expect(r.invoices[0].paidCents).toBe(40000);
    const again = applyRefund({ ...db, payments: r.payments, invoices: r.invoices }, "p1", 40001, DEMO);
    expect(again).toEqual({ ok: false, error: "refund_above_available" });
    expect(refundable(r.payments[0])).toBe(40000);
  });
  it("all of it: the payment brings nothing and leaves the list, as in the cloud", () => {
    const r = applyRefund(db, "p2", 1000, DEMO);
    if (!r.ok) throw new Error(r.error);
    expect(r.payments.map((p) => p.id)).toEqual(["p1"]);
    expect(r.invoices[0].paidCents).toBe(49000);
  });
});

describe("unit:refundApp — the demo mutation stays in the demo", () => {
  it("refundPaymentDemo is called only from the receipt, behind mode === \"demo\"", () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) && files.push(join(d, f))));
    walk(join(__dirname, "../src"));
    const callers = files.filter((f) => !f.endsWith("store.tsx") && readFileSync(f, "utf8").includes("refundPaymentDemo"));
    expect(callers.map((f) => f.replace(/.*src\//, ""))).toEqual(["app/receipt/[id].tsx"]);
    const src = readFileSync(callers[0], "utf8");
    expect(src).toMatch(/if \(store\.mode === "demo"\) \{\s*const e = store\.refundPaymentDemo/);
  });
});
