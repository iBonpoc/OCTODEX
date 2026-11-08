/**
 * A refund of one payment (step 20д, docs/specs/35-stripe.md §4в) — the pure part of the sheet: who may, how much, how it
 * goes (Stripe or a record), what part is tax, and our words for the server's refusals. The server decides; this only
 * shows the same numbers before the person confirms (the database keeps them: app.refund_tax_part, T133).
 */
import { refundAllocation, sumCents, type TaxMode } from "@octo/estimating-engine";
import type { Invoice, Payment } from "@/data/types";

export type RefundKind = "rescission" | "cancellation" | "goodwill" | "other";
export const REFUND_KINDS: RefundKind[] = ["goodwill", "cancellation", "rescission", "other"];

/** the server's word → the key of our text (mny.refund.err.*) */
export type RefundError =
  | "refund_above_available" | "refund_disputed" | "refund_in_progress" | "refund_not_refundable" | "refund_not_stripe"
  | "refund_through_stripe" | "stripe_refused" | "retry_later" | "not_allowed" | "not_configured" | "live_refused" | "offline" | "failed";
const KNOWN: RefundError[] = [
  "refund_above_available", "refund_disputed", "refund_in_progress", "refund_not_refundable", "refund_not_stripe",
  "refund_through_stripe", "stripe_refused", "retry_later", "not_allowed", "not_configured", "live_refused", "offline",
];
/** a final «no» from the server: nothing was refunded under this key, a next try is a new refund (a new key). Anything
 *  else (no answer, «later», an unknown error) may have been kept: the next try sends the SAME key — never twice. */
export const FINAL_REFUSALS: RefundError[] = [
  "refund_above_available", "refund_disputed", "refund_not_refundable", "refund_through_stripe", "refund_not_stripe",
  "stripe_refused", "not_allowed", "not_configured", "live_refused",
];
export const refundError = (word: unknown): RefundError =>
  typeof word === "string" ? (KNOWN.find((k) => word.includes(k)) ?? "failed") : "failed";

/** only an owner or an admin of the company refunds (the server checks it again); in the demo — the «director» role */
export const mayRefund = (serverRole: string | null | undefined, mode: "cloud" | "demo", appRole?: string): boolean =>
  mode === "demo" ? appRole === "director" : serverRole === "owner" || serverRole === "admin";

/** a payment Stripe took (its reference is the PaymentIntent) goes back through Stripe; everything else is a record */
export const viaStripe = (p: Pick<Payment, "method" | "reference">): boolean =>
  (p.method === "card" || p.method === "ach") && /^pi_[A-Za-z0-9]+$/.test(p.reference ?? "");

/** what may still go back: what the payment brings now (amountCents is already net of refunds) */
export const refundable = (p: Pick<Payment, "amountCents">): number => Math.max(0, p.amountCents);

/** tax and revenue of the refund by the invoice's mode (19 §7.9); no invoice or no tax — all revenue */
export function refundSplit(amountCents: number, inv: Pick<Invoice, "totalCents" | "taxCents" | "taxMode"> | undefined) {
  if (!inv || !inv.taxCents || amountCents <= 0) return { tax: 0, revenue: Math.max(0, amountCents) };
  return refundAllocation(amountCents, inv.totalCents, inv.taxCents, (inv.taxMode ?? "added_on_top") as TaxMode);
}

/** a fresh key per confirmed refund: a double tap or a retry of the same refund sends the same key */
export const newRefundKey = (): string =>
  `rf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The demo's refund — the same rules as the database (public.refund_record, T133): owner/admin only, 1 … what the payment
 * still brings, the invoice owes it again. The payment keeps the cloud's shape (repo.ts): amountCents is NET of refunds,
 * refundedCents is the total refunded; a fully refunded payment brings nothing and leaves the list, as in the cloud.
 * Never in the cloud: there the server decides (a refund is never queued offline, PRD 16 §105).
 */
export function applyRefund(
  db: { payments: Payment[]; invoices: Invoice[] },
  paymentId: string,
  amountCents: number,
  who: { mode: "cloud" | "demo"; serverRole?: string | null; appRole?: string },
): { ok: true; payments: Payment[]; invoices: Invoice[] } | { ok: false; error: RefundError } {
  if (who.mode !== "demo") return { ok: false, error: "not_allowed" };
  if (!mayRefund(who.serverRole, who.mode, who.appRole)) return { ok: false, error: "not_allowed" };
  const p = db.payments.find((x) => x.id === paymentId);
  if (!p) return { ok: false, error: "refund_not_refundable" };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > refundable(p)) return { ok: false, error: "refund_above_available" };
  const net = sumCents([p.amountCents, -amountCents]);
  const refunded = sumCents([p.refundedCents ?? 0, amountCents]);
  const payments = net > 0
    ? db.payments.map((x) => (x.id === p.id ? { ...x, amountCents: net, refundedCents: refunded } : x))
    : db.payments.filter((x) => x.id !== p.id);
  const invoices = db.invoices.map((i) =>
    i.id === p.invoiceId ? { ...i, paidCents: Math.max(0, sumCents([i.paidCents, -amountCents])), paidAt: undefined } : i,
  );
  return { ok: true, payments, invoices };
}
