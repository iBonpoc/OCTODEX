/**
 * Invoice status — the one place for it (docs/specs/06-list-cards.md; map §5: an invoice has no stored status,
 * it is derived from the balance). Balance only through @octo/estimating-engine (clientMoney).
 * Lists and the invoice screen take the chip from here; signs (overdue N days, due today / tomorrow) are listSigns.invoiceSigns.
 * Unit-tested in test/invoiceStatus.test.ts.
 */
import type { StatusName } from "@octo/design-tokens";
import { clientMoney } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";
import type { Invoice } from "@/data/types";

export type InvoiceState = "unpaid" | "partial" | "paid";
const VIEW: Record<InvoiceState, { s: StatusName; l: DictKey }> = {
  unpaid: { s: "info", l: "money.awaiting" },
  partial: { s: "info", l: "card.st.partial" },
  paid: { s: "ok", l: "st.paid" },
};

/** owes = total − paid, never below 0 (an overpayment owes nothing; the extra is the client's credit, PRD 18) */
export function invoiceBalance(i: Pick<Invoice, "totalCents" | "paidCents">): { owesCents: number; paidCents: number } {
  const { owesCents } = clientMoney([{ totalCents: i.totalCents, paidCents: i.paidCents }], []);
  return { owesCents, paidCents: i.paidCents };
}

export function invoiceState(i: Pick<Invoice, "totalCents" | "paidCents">): InvoiceState {
  const { owesCents } = invoiceBalance(i);
  if (owesCents === 0) return "paid";
  return i.paidCents > 0 ? "partial" : "unpaid";
}

/** status chip of an invoice: colour only from the status, always with a word */
export function invoiceStatusView(i: Pick<Invoice, "totalCents" | "paidCents">): { s: StatusName; l: DictKey; state: InvoiceState } {
  const state = invoiceState(i);
  return { ...VIEW[state], state };
}
