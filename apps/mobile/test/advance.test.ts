/**
 * unit:advance — the client's advance (docs/specs/35-stripe.md §4г; features/payments/advance.ts, collected.ts,
 * cloud/repo.ts paymentsFromRows, cloud/advance.ts): a payment without an invoice is its own list, never in «collected»
 * while the switch is off; it goes whole to an invoice of the same client with room for it (as T135); our words for the
 * server's answers; refunds on their way are not refundable twice (as app.refund_available); Stripe's fee reaches the app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../src/cloud/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import { advanceApply } from "../src/cloud/advance";
import { paymentsFromRows } from "../src/cloud/repo";
import { advanceError, advanceTargets, applicable, applyAdvance, invoiceRoom } from "../src/features/payments/advance";
import { ADVANCES_COLLECTED, collectedPayments } from "../src/features/payments/collected";
import { paymentsIn } from "../src/features/moneyLists";
import { applyRefund, refundable } from "../src/features/payments/refund";
import type { Advance, Invoice, Payment } from "../src/data/types";

const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: "i1", customerId: "c1", jobId: "j1", totalCents: 12000, paidCents: 0, dueDate: "2026-11-01", number: "INV-1", ...o });
const adv = (o: Partial<Advance> = {}): Advance => ({ id: "a1", invoiceId: null, customerId: "c1", amountCents: 5000, method: "card", at: "2026-11-08T18:00:00Z", needsReview: true, ...o });
const pay = (o: Partial<Payment> = {}): Payment => ({ id: "p1", invoiceId: "i1", customerId: "c1", amountCents: 2000, method: "cash", at: "2026-11-07T18:00:00Z", ...o });
const DEMO = { mode: "demo" as const, appRole: "director" };

beforeEach(() => rpc.mockReset());

describe("unit:advance — from the cloud's rows", () => {
  const row = (o: Record<string, unknown>) => ({ id: "p", customer_id: "c1", method: "card", status: "succeeded", amount_cents: 5000, refunded_cents: 0, received_at: "2026-11-08T18:00:00Z", fee_cents: 0, ...o });
  it("a payment without an invoice is an advance, not a payment; Stripe's fee comes along", () => {
    const r = paymentsFromRows([row({ id: "p1", invoice_id: "i1", fee_cents: 175 }), row({ id: "a1", invoice_id: null, needs_review: true })]);
    expect(r.payments.map((x) => [x.id, x.invoiceId, x.feeCents])).toEqual([["p1", "i1", 175]]);
    expect(r.advances.map((x) => [x.id, x.invoiceId, x.needsReview, x.feeCents])).toEqual([["a1", null, true, undefined]]);
  });
  it("not money yet or no money left — in neither list (pending ACH, failed, fully refunded)", () => {
    const r = paymentsFromRows([row({ id: "a1", invoice_id: null, status: "pending" }), row({ id: "a2", invoice_id: null, status: "failed" }),
      row({ id: "a3", invoice_id: null, status: "refunded", refunded_cents: 5000 })]);
    expect([r.payments.length, r.advances.length]).toEqual([0, 0]);
  });
  it("refunds on their way: amount − greatest(refunded, Σ pending + succeeded rows), as app.refund_available", () => {
    const rows = [row({ id: "p1", invoice_id: "i1", amount_cents: 10000, refunded_cents: 2000, status: "partially_refunded" })];
    // a manual refund of $20 (succeeded, in refunded) and one of $30 not at Stripe yet (pending, not in refunded)
    const refunds = [{ payment_id: "p1", amount_cents: 2000, status: "succeeded" }, { payment_id: "p1", amount_cents: 3000, status: "pending" },
      { payment_id: "p1", amount_cents: 900, status: "failed" }];
    const p = paymentsFromRows(rows, refunds).payments[0]!;
    expect([p.amountCents, p.refundedCents, p.refundPendingCents, refundable(p)]).toEqual([8000, 2000, 3000, 5000]);
    // Stripe accepted it (pending with its id is already in refunded_cents): nothing extra held back
    const q = paymentsFromRows([{ ...rows[0], refunded_cents: 5000 }], refunds).payments[0]!;
    expect([q.refundPendingCents, refundable(q)]).toEqual([undefined, 5000]);
  });
});

describe("unit:advance — where it goes", () => {
  const db = { invoices: [inv(), inv({ id: "i2", number: "INV-2", totalCents: 3000 }), inv({ id: "i3", customerId: "c2", totalCents: 90000 }), inv({ id: "i4", paidCents: 12000 })],
    pendingPayments: [] as { id: string; invoiceId: string; amountCents: number; method: "ach"; at: string }[] };
  it("invoices of the same client that take it whole; smaller ones say how much to refund first", () => {
    const t = advanceTargets(db, adv());
    expect(t.fits.map((i) => i.id)).toEqual(["i1"]);
    expect(t.smaller.map((x) => [x.invoice.id, x.refundFirst])).toEqual([["i2", 2000]]);
  });
  it("ACH on its way takes room on the invoice (app.invoice_online_balance)", () => {
    const d = { ...db, pendingPayments: [{ id: "x", invoiceId: "i1", amountCents: 8000, method: "ach" as const, at: "" }] };
    expect(invoiceRoom(d, db.invoices[0]!)).toBe(4000);
    expect(advanceTargets(d, adv()).fits).toEqual([]);
  });
  it("not while a refund of it is on its way", () => {
    expect([applicable(adv()), applicable(adv({ refundPendingCents: 1000 }))]).toEqual([true, false]);
  });
  it("the demo applies it with the database's rules: the invoice owes less, the owner is not asked any more", () => {
    const d = { payments: [pay({ invoiceId: "i9" })], advances: [adv()], ...db };
    expect(applyAdvance(d, "a1", "i3", DEMO)).toEqual({ ok: false, error: "advance_other_client" });
    expect(applyAdvance(d, "a1", "i2", DEMO)).toEqual({ ok: false, error: "advance_above_balance" });
    expect(applyAdvance(d, "a1", "i1", { mode: "demo", appRole: "tech" })).toEqual({ ok: false, error: "not_allowed" });
    expect(applyAdvance(d, "a1", "i1", { mode: "cloud", serverRole: "owner" })).toEqual({ ok: false, error: "not_allowed" });
    const r = applyAdvance(d, "a1", "i1", DEMO);
    if (!r.ok) throw new Error(r.error);
    expect(r.advances).toEqual([]);
    expect(r.payments.find((x) => x.id === "a1")).toMatchObject({ invoiceId: "i1", amountCents: 5000, needsReview: undefined });
    expect(r.invoices.find((i) => i.id === "i1")!.paidCents).toBe(5000);
  });
  it("the demo refunds an advance: only the advance changes (no invoice owes it)", () => {
    const d = { payments: [pay()], advances: [adv()], invoices: [inv()] };
    const r = applyRefund(d, "a1", 2000, DEMO);
    if (!r.ok) throw new Error(r.error);
    expect(r.advances[0]).toMatchObject({ amountCents: 3000, refundedCents: 2000 });
    expect(r.invoices).toEqual(d.invoices);
    expect(r.payments).toEqual(d.payments);
  });
});

describe("unit:advance — collected (one switch)", () => {
  const db = { payments: [pay()], advances: [adv()] };
  it("off for now: an advance is not «collected» in «Оплаты» or the reports", () => {
    expect(ADVANCES_COLLECTED).toBe(false);
    expect(collectedPayments(db).map((x) => x.id)).toEqual(["p1"]);
    expect(paymentsIn(db, "all").totalCents).toBe(2000);
  });
  it("on: advances count, with no invoice", () => {
    expect(collectedPayments(db, true).map((x) => [x.id, x.invoiceId])).toEqual([["p1", "i1"], ["a1", ""]]);
  });
});

describe("unit:advance — the server's answers (cloud/advance.ts)", () => {
  it("applied → the invoice's balance", async () => {
    rpc.mockResolvedValue({ data: { balance_cents: 7000 }, error: null });
    expect(await advanceApply("a1", "i1")).toEqual({ ok: true, balanceCents: 7000 });
    expect(rpc).toHaveBeenCalledWith("advance_apply", { p_payment_id: "a1", p_invoice_id: "i1" });
  });
  it("our words: the rules, the role, a closed company; no answer → tap again (a repeat is the same answer)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "advance_above_balance" } });
    expect(await advanceApply("a1", "i1")).toEqual({ ok: false, error: "advance_above_balance" });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "only owner/admin can apply an advance" } });
    expect(await advanceApply("a1", "i1")).toEqual({ ok: false, error: "not_allowed" });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "the company is closed" } });
    expect(await advanceApply("a1", "i1")).toEqual({ ok: false, error: "company_closed" });
    rpc.mockResolvedValue({ data: null, error: { code: "", message: "Failed to fetch" } });
    expect(await advanceApply("a1", "i1")).toEqual({ ok: false, error: "retry_later" });
    rpc.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    expect(await advanceApply("a1", "i1")).toEqual({ ok: false, error: "retry_later" });
    expect([advanceError("x advance_disputed"), advanceError("boom"), advanceError(null)]).toEqual(["advance_disputed", "failed", "failed"]);
  });
});
