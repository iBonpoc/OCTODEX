/**
 * The one switch (spec 35 §4г, the founder's question): does a client's advance — money without an invoice, waiting for the
 * owner — count as «collected» in «Оплаты» and the reports before it is applied to an invoice? For now NO: it is «to check»,
 * like the server's needs_review. Flip ADVANCES_COLLECTED and every sum of received money follows (unit collected).
 */
import type { DB, Payment } from "@/data/types";

export const ADVANCES_COLLECTED = false;

/** the received money that counts: payments of invoices, and advances only when the switch says so (an advance has no
 *  invoice: invoiceId "" — no invoice is found by it, the lists show it without one) */
export const collectedPayments = (db: Pick<DB, "payments" | "advances">, withAdvances: boolean = ADVANCES_COLLECTED): Payment[] =>
  withAdvances ? [...db.payments, ...(db.advances ?? []).map((a) => ({ ...a, invoiceId: "" }))] : db.payments;
