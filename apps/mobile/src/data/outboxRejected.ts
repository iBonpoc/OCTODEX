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
import { mineOf, REJECTED_KEY, sameOwner, type Owner, type OwnedItem } from "./outboxOwner";
import { MONEY_KINDS } from "./syncLink";

export { REJECTED_KEY };
/** a refused change older than this leaves the list by itself (review #263 №10) */
export const REJECTED_KEEP_MS = 30 * 24 * 3600_000;

/** module: a batch of an add-on module's changes the server refused because the module is not active (spec 33 П21.1);
 *  estimate: a send the server refused for a known reason (REJECT_REASONS) */
export type RejectedWhat = "deposit" | "invoice" | "payment" | "expense" | "module" | "estimate" | "merge";
/**
 * The server's refusals we can explain: its hint (a code we chose in a migration) → our own words. Only these: the
 * server's text is never shown (review #259). estimate_lines_mismatch — the lock check of a version (migration
 * 20261108190000, Н1 of spec 33 П23.9).
 */
export const REJECT_REASONS = {
  estimate_lines_mismatch: "sync.stuck.reason.estimateLines",
  // step 17 C3 (migration 20261109120000): the merge of two clients
  merge_payment_in_flight: "clientDup.rej.inFlight",
  merge_already_merged: "clientDup.rej.merged",
  // an old phone's people / tags for a card merged meanwhile (save_customer_people, set_customer_tags)
  customer_merged: "clientDup.rej.cardMerged",
  // spec 37 (migration 20261110090000): purchase orders
  po_receiving: "po.rej.receiving",
  po_cancelled: "po.rej.cancelled",
  po_stale: "po.rej.stale",
  po_received_office: "po.rej.officeOnly",
  po_not_open: "po.rej.notOpen",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;
/** a refused signature (estimate.sign, estimate.approve): the client's signature was not kept — take it again (review #415 №4) */
const SIGNED_KINDS: readonly string[] = ["estimate.sign", "estimate.approve"];
export const rejectReasonKey = (reason: RejectReason, kind?: string) =>
  kind && SIGNED_KINDS.includes(kind) ? ("sync.stuck.reason.estimateLinesSigned" as const) : REJECT_REASONS[reason];
export const rejectReasonOf = (hint: unknown): RejectReason | undefined =>
  typeof hint === "string" && Object.prototype.hasOwnProperty.call(REJECT_REASONS, hint) ? (hint as RejectReason) : undefined;
export interface RejectedOp {
  /** the outbox item's id */
  id: string;
  owner?: Owner;
  kind: Op["k"];
  what: RejectedWhat;
  /** where it opens: the record the change was about */
  href: string;
  amountCents?: number;
  /** what = module: which module, how many changes were not saved, its own text (ModuleDef.rejectedKey; params {count}) */
  module?: string;
  count?: number;
  labelKey?: string;
  /** a refusal we can explain (REJECT_REASONS): the card says why in our words */
  reason?: RejectReason;
  /** the server's text, kept for support; never shown (our own words on the card, review #259) */
  error: string;
  at: string;
}

/**
 * a refused op → what to keep about it; null when it is not money. Whose: the op's owner, else the person signed in
 * when it was refused (an op of an older version has none — never «everybody's», review #263 №6)
 */
export function rejectedOf(item: OwnedItem, error: string, now: number, who: Owner | null, hint?: unknown): RejectedOp | null {
  const op = item.op;
  const owner = item.owner ?? who ?? undefined;
  const base = { id: item.id, ...(owner ? { owner } : {}), kind: op.k, error, at: new Date(now).toISOString() };
  // a send refused for a reason we can explain: the estimate is back to a draft on the server, the card says why
  const reason = rejectReasonOf(hint);
  // (estimate.sign sends first: a quick estimate signed on site — the client's signature is not lost silently, review №1)
  // estimate.approve (the client signs on site / by link) sends first too (review #415 №3)
  if ((op.k === "estimate.send" || op.k === "estimate.sign" || op.k === "estimate.approve") && reason === "estimate_lines_mismatch") return { ...base, what: "estimate", href: `/estimate/${op.id}`, reason };
  // a merge of two clients the phone showed as done (step 17 C3): never back silently — the kept card, and why
  if ((op.k === "customer.people" || op.k === "customer.tags") && reason === "customer_merged") return { ...base, what: "merge", href: `/client/${op.id}`, labelKey: "clientDup.rej.cardMergedTitle", reason };
  if (op.k === "customer.merge") return { ...base, what: "merge", href: `/client/${op.keepId}`, ...(reason ? { reason } : {}) };
  if (!isMoneyOp(item, MONEY_KINDS)) return null;
  switch (op.k) {
    case "estimate.deposit": return { ...base, what: "deposit", href: `/estimate/${op.id}`, amountCents: op.depositCents };
    // the client's approval / the company's countersign that makes the deposit invoice: the estimate it was about
    // the client's signature on site / by link that the server did not keep: say it is the signature, not «a deposit» —
    // the client has to sign again (spec 35 §4д п.10: a tech's on-site signature was dropped this way)
    case "estimate.approve": return { ...base, what: "deposit", href: `/estimate/${op.id}`, labelKey: "est.rej.signatureLost" };
    case "estimate.countersign": return { ...base, what: "deposit", href: `/estimate/${op.id}` };
    case "invoice.issue": return { ...base, what: "invoice", href: `/job/${op.jobId}`, amountCents: op.totalCents };
    case "invoice.pay": return { ...base, what: "payment", href: `/invoice/${op.invoiceId}`, amountCents: op.amountCents };
    case "payment.record": return { ...base, what: "payment", href: `/invoice/${op.invoiceId}`, amountCents: op.amountCents };
    case "visit.pay": return { ...base, what: "payment", href: `/visit/${op.visitId}`, amountCents: op.amountCents };
    case "expense.add": return { ...base, what: "expense", href: op.jobId ? `/job/${op.jobId}` : "/settings/profile", amountCents: op.amountCents };
    default: return null;
  }
}

/** not older than REJECTED_KEEP_MS (a record without a readable time stays: never drop what cannot be dated) */
export const freshRejected = (list: readonly RejectedOp[], now: number): RejectedOp[] =>
  list.filter((r) => !(now - Date.parse(r.at) >= REJECTED_KEEP_MS));

/** the signed-in person's, in this company, not older than 30 days (one without an owner — the person's, as in the outbox) */
export const rejectedMine = (list: readonly RejectedOp[], who: Owner | null, now: number = Date.now()): RejectedOp[] =>
  who ? freshRejected(list, now).filter((r) => !r.owner || (r.owner.userId === who.userId && r.owner.companyId === who.companyId)) : [];

/** the account of `userId` is deleted: what stays — other people's (one without an owner goes, as in the outbox) */
export const rejectedOthers = (list: readonly RejectedOp[], userId: string | null): RejectedOp[] =>
  list.filter((r) => !!r.owner && r.owner.userId !== userId);

/** the stored text → the list (a broken value → none) */
export function parseRejected(raw: string | null): RejectedOp[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as RejectedOp[]) : [];
  } catch {
    return [];
  }
}

/**
 * The module is not active on the server (trial over, not paid — founder О2): every waiting change of this module of the
 * person sending goes at once (each would be refused five times and hold the queue — spec 33 П21.1). Other people's ops
 * and every other op (the core's: leads, payments…) stay as they are.
 */
export function dropModuleOps(items: readonly OwnedItem[], module: string, who: Owner | null): { kept: OwnedItem[]; gone: OwnedItem[] } {
  const mine = new Set(mineOf(items, who).map((x) => x.id));
  const isGone = (x: OwnedItem) => mine.has(x.id) && x.op.k === "module.op" && x.op.module === module;
  return { kept: items.filter((x) => !isGone(x)), gone: items.filter(isGone) };
}

/**
 * A module's settings refused as «changed by someone else first» (row_version_conflict): this write and every later
 * waiting settings write of the module go. Each later one was built on this one's base (the phone counts the version up
 * for its own writes), so sending it after the refusal would quietly overwrite the other person's change (review #372 №1).
 */
export function dropSettingsOps(items: readonly OwnedItem[], module: string, who: Owner | null): { kept: OwnedItem[]; gone: OwnedItem[] } {
  const mine = new Set(mineOf(items, who).map((x) => x.id));
  const isGone = (x: OwnedItem) => mine.has(x.id) && x.op.k === "module.saveSettings" && x.op.module === module;
  return { kept: items.filter((x) => !isGone(x)), gone: items.filter(isGone) };
}

/** the one card «settings not saved: someone else changed them» per module and person; a later batch adds to its count */
export function settingsRejected(prev: readonly RejectedOp[], module: string, count: number, error: string, now: number, who: Owner | null): RejectedOp[] {
  const id = `settings.${module}.${who?.userId ?? ""}.${who?.companyId ?? ""}`;
  const was = prev.find((x) => x.id === id && sameOwner(x.owner ?? null, who));
  const rec: RejectedOp = {
    id, ...(who ? { owner: who } : {}), kind: "module.saveSettings", what: "module", href: "/company/modules", module, count: (was?.count ?? 0) + count,
    labelKey: "mod.settingsConflict", error, at: new Date(now).toISOString(),
  };
  return [...freshRejected(prev, now).filter((x) => x.id !== id), rec];
}

/** the one card «not saved: the trial is over» per module and person; a later batch adds to its count */
export function moduleRejected(prev: readonly RejectedOp[], module: string, count: number, error: string, now: number, who: Owner | null, labelKey?: string): RejectedOp[] {
  const id = `module.${module}.${who?.userId ?? ""}.${who?.companyId ?? ""}`;
  const was = prev.find((x) => x.id === id && sameOwner(x.owner ?? null, who));
  const rec: RejectedOp = {
    id, ...(who ? { owner: who } : {}), kind: "module.op", what: "module", href: "/company/modules", module, count: (was?.count ?? 0) + count,
    ...(labelKey ? { labelKey } : {}), error, at: new Date(now).toISOString(),
  };
  return [...freshRejected(prev, now).filter((x) => x.id !== id), rec];
}
