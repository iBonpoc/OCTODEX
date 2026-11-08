/**
 * The client's advance (docs/specs/35-stripe.md §4г): a payment without an invoice — an online payment above the balance,
 * kept by the server for the owner (needs_review). The owner refunds it (the refund sheet, as any payment) or applies it
 * to an invoice of the same client — whole, never split (a payment's amount is immutable): above the balance, the
 * difference is refunded first. The server decides (public.advance_apply, trigger t41, T135); this shows the same rules.
 */
import { sumCents } from "@octo/estimating-engine";
import type { Advance, DB, Invoice, Payment } from "@/data/types";
import { mayRefund, refundable } from "./refund";

/** the server's word → the key of our text (mny.adv.err.*) */
export type AdvanceError =
  | "advance_other_client" | "advance_invoice_not_open" | "advance_not_applicable" | "advance_disputed"
  | "advance_refund_in_progress" | "advance_above_balance" | "advance_already_applied"
  | "not_allowed" | "company_closed" | "retry_later" | "offline" | "failed";
const KNOWN: AdvanceError[] = [
  "advance_other_client", "advance_invoice_not_open", "advance_not_applicable", "advance_disputed",
  "advance_refund_in_progress", "advance_above_balance", "advance_already_applied", "company_closed",
];
export const advanceError = (word: unknown): AdvanceError =>
  typeof word === "string" ? (KNOWN.find((k) => word.includes(k)) ?? "failed") : "failed";

/** who applies an advance: as who refunds — the owner or an admin (in the demo the director) */
export const mayApplyAdvance = mayRefund;

/** what an invoice may still take: its balance minus online payments on their way (app.invoice_online_balance) */
export function invoiceRoom(db: Pick<DB, "pendingPayments">, inv: Pick<Invoice, "id" | "totalCents" | "paidCents">): number {
  const onWay = sumCents((db.pendingPayments ?? []).filter((x) => x.invoiceId === inv.id).map((x) => x.amountCents));
  return inv.totalCents - inv.paidCents - onWay;
}

export interface AdvanceTargets {
  /** invoices of this client that take the whole advance */
  fits: Invoice[];
  /** invoices with a smaller balance: refund `refundFirst` first, then the rest fits */
  smaller: { invoice: Invoice; refundFirst: number }[];
}
/** where an advance can go: open invoices (the app has sent ones only) of the same client, by what they still owe */
export function advanceTargets(db: Pick<DB, "invoices" | "pendingPayments">, a: Pick<Advance, "customerId" | "amountCents">): AdvanceTargets {
  const mine = db.invoices.filter((i) => i.customerId === a.customerId).map((i) => ({ i, room: invoiceRoom(db, i) })).filter((x) => x.room > 0);
  return {
    fits: mine.filter((x) => x.room >= a.amountCents).map((x) => x.i),
    smaller: mine.filter((x) => x.room < a.amountCents).map((x) => ({ invoice: x.i, refundFirst: a.amountCents - x.room })),
  };
}

/** an advance can be applied now: nothing of it is on its way back (a refund in progress) and it still brings money */
export const applicable = (a: Pick<Advance, "amountCents" | "refundPendingCents">): boolean =>
  a.amountCents > 0 && !a.refundPendingCents && refundable(a) === a.amountCents;

/**
 * The demo's apply — the same rules as the database (T135): owner/admin, the same client, the whole advance ≤ what the
 * invoice still takes. The advance becomes a payment of that invoice; the owner is no longer asked (needsReview off).
 * Never in the cloud: there the server applies (cloud/advance.ts), then refresh().
 */
export function applyAdvance(
  db: Pick<DB, "payments" | "invoices" | "advances" | "pendingPayments">,
  advanceId: string,
  invoiceId: string,
  who: { mode: "cloud" | "demo"; serverRole?: string | null; appRole?: string },
): { ok: true; payments: Payment[]; invoices: Invoice[]; advances: Advance[] } | { ok: false; error: AdvanceError } {
  if (who.mode !== "demo" || !mayApplyAdvance(who.serverRole, who.mode, who.appRole)) return { ok: false, error: "not_allowed" };
  const advances = db.advances ?? [];
  const a = advances.find((x) => x.id === advanceId);
  if (!a) return { ok: false, error: "advance_already_applied" };
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.customerId !== a.customerId) return { ok: false, error: "advance_other_client" };
  if (!applicable(a)) return { ok: false, error: "advance_refund_in_progress" };
  if (a.amountCents > invoiceRoom(db, inv)) return { ok: false, error: "advance_above_balance" };
  const paid = sumCents([inv.paidCents, a.amountCents]);
  const payment: Payment = { ...a, invoiceId: inv.id, needsReview: undefined };
  return {
    ok: true,
    advances: advances.filter((x) => x.id !== a.id),
    payments: [payment, ...db.payments].sort((x, y) => y.at.localeCompare(x.at)),
    invoices: db.invoices.map((i) => (i.id === inv.id ? { ...i, paidCents: paid, paidAt: paid >= i.totalCents ? new Date().toISOString() : undefined, method: a.method } : i)),
  };
}
