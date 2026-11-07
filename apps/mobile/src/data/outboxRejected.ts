/**
 * A money change the server refused (docs/specs/23 §3, decision of the director 07.11): after MAX_TRIES refusals the
 * op leaves the outbox (the server said «no» — sending it again changes nothing), but a deposit, an invoice, a payment
 * or an expense the phone showed as done must not vanish silently. It is kept here, by owner, until the person says
 * «Понятно»: a card in «Профиль и аккаунт» and an item in «Требует внимания» that opens the estimate / invoice / job / visit.
 * Money — the same rule as the confirmation of «Отменить изменение…» (outboxDeps.isMoneyOp): a money kind, or an op
 * that makes an invoice or a payment (the client's approval with its deposit invoice, the company's countersign).
 * The key starts with «octo.cloud.v1.» — company data: the account deletion wipes it with the caches.
 * Pure: test/outboxRejected.test.ts.
 */
import type { Op } from "@/cloud/ops";
import { isMoneyOp } from "./outboxDeps";
import type { Owner, OwnedItem } from "./outboxOwner";
import { MONEY_KINDS } from "./syncLink";

export const REJECTED_KEY = "octo.cloud.v1.rejected";

export type RejectedWhat = "deposit" | "invoice" | "payment" | "expense";
export interface RejectedOp {
  /** the outbox item's id */
  id: string;
  owner?: Owner;
  kind: Op["k"];
  what: RejectedWhat;
  /** where it opens: the record the change was about */
  href: string;
  amountCents?: number;
  /** the server's text, kept for support; never shown (our own words on the card, review #259) */
  error: string;
  at: string;
}

/** a refused op → what to keep about it; null when it is not money */
export function rejectedOf(item: OwnedItem, error: string, now: number): RejectedOp | null {
  if (!isMoneyOp(item, MONEY_KINDS)) return null;
  const op = item.op;
  const base = { id: item.id, ...(item.owner ? { owner: item.owner } : {}), kind: op.k, error, at: new Date(now).toISOString() };
  switch (op.k) {
    case "estimate.deposit": return { ...base, what: "deposit", href: `/estimate/${op.id}`, amountCents: op.depositCents };
    // the client's approval / the company's countersign that makes the deposit invoice: the estimate it was about
    case "estimate.approve": case "estimate.countersign": return { ...base, what: "deposit", href: `/estimate/${op.id}` };
    case "invoice.issue": return { ...base, what: "invoice", href: `/job/${op.jobId}`, amountCents: op.totalCents };
    case "invoice.pay": return { ...base, what: "payment", href: `/invoice/${op.invoiceId}`, amountCents: op.amountCents };
    case "payment.record": return { ...base, what: "payment", href: `/invoice/${op.invoiceId}`, amountCents: op.amountCents };
    case "visit.pay": return { ...base, what: "payment", href: `/visit/${op.visitId}`, amountCents: op.amountCents };
    case "expense.add": return { ...base, what: "expense", href: op.jobId ? `/job/${op.jobId}` : "/settings/profile", amountCents: op.amountCents };
    default: return null;
  }
}

/** the signed-in person's, in this company (an old one without an owner — the person's, as in the outbox) */
export const rejectedMine = (list: readonly RejectedOp[], who: Owner | null): RejectedOp[] =>
  who ? list.filter((r) => !r.owner || (r.owner.userId === who.userId && r.owner.companyId === who.companyId)) : [];
