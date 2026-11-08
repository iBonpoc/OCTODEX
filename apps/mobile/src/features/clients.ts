/**
 * Client card logic (docs/specs/04-clients-and-properties.md §4, §7): status label, tags, money, search, history,
 * who sees what. Pure — tested in test/clients.test.ts.
 */
import type { StatusName } from "@octo/design-tokens";
import { clientMoney } from "@octo/estimating-engine";
import { peopleOf } from "@/data/people";
import { daysOverdue, isOverdue, visitPropertyId } from "@/data/selectors";
import type { Customer, CustomerStatus, DB, ID, Role, Tag } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";
import { isAssigned } from "@/features/schedule";
import { getZone, minuteIn } from "@/features/zone";

/** Status label: colour + icon + word (CLAUDE.md rule 2). */
export const clientStatusChip: Record<CustomerStatus, { s: StatusName; l: DictKey }> = {
  prospect: { s: "info", l: "client.st.prospect" },
  active: { s: "ok", l: "client.st.active" },
  archived: { s: "neutral", l: "client.st.archived" },
  do_not_service: { s: "bad", l: "client.st.doNotService" },
};
export const statusOf = (c: Customer): CustomerStatus => c.status ?? "active";

/**
 * «Do not service» (docs/specs/04 §12): nothing new for the client — no job, estimate, visit, no sending of an old draft.
 * The server refuses the same (trigger t44_no_service_guard, db T44); the open stays. No client (a new lead) = can serve.
 * Used by the client and property screens, the estimate client picker and the job form («Работы и выезды»).
 */
export function canServe(db: Pick<DB, "customers">, customerId: ID | undefined | null): boolean {
  if (!customerId) return true;
  const c = db.customers.find((x) => x.id === customerId);
  return !c || statusOf(c) !== "do_not_service";
}
/** Only the director and the office set or lift «do not service» (server: t45_customer_dns_who, db T58); sales do not. */
export const canMarkNoService = (role: Role) => role === "director" || role === "dispatcher";
/**
 * The statuses the client's status menu offers this role: prospect → archive / do not service; otherwise active ⇄
 * archive ⇄ do not service. Without the right to the mark it is not offered, and a marked client cannot be moved at all.
 */
export function statusChoices(cur: CustomerStatus, role: Role): CustomerStatus[] {
  const all: CustomerStatus[] = cur === "prospect" ? ["prospect", "archived", "do_not_service"] : ["active", "archived", "do_not_service"];
  if (canMarkNoService(role)) return all;
  return cur === "do_not_service" ? [] : all.filter((s) => s !== "do_not_service");
}
/** Clients among these that are marked «do not service» (a new lead with their phone gets the red mark, 04 §4). */
export const notServed = (cs: readonly Customer[]): Customer[] => cs.filter((c) => statusOf(c) === "do_not_service");

/** System tags are shown in the user's language; the company's own tags as typed. */
const SYSTEM_TAG: Record<string, DictKey> = {
  vip: "tag.vip",
  regular: "tag.regular",
  favorite: "tag.favorite",
  "no calls after 6 pm": "tag.noLateCalls",
};
export function tagLabel(tag: Tag, t: (k: DictKey) => string): string {
  const k = tag.system ? SYSTEM_TAG[tag.name.toLowerCase()] : undefined;
  return k ? t(k) : tag.name;
}
/** Tags of the client in the company's order (hidden tags still show on clients that have them). */
export function tagsOf(db: DB, c: Customer): Tag[] {
  const ids = new Set(c.tagIds ?? []);
  return db.tags.filter((x) => ids.has(x.id)).sort((a, b) => a.position - b.position);
}

/** Money on the card: what the client owes now and what they paid over all time (engine, integer cents). */
export function clientMoneyOf(db: DB, customerId: ID) {
  return clientMoney(
    db.invoices.filter((i) => i.customerId === customerId),
    db.payments.filter((p) => p.customerId === customerId).map((p) => p.amountCents),
  );
}

/**
 * Overdue money of a client for the list card sign (founder 07.11): the unpaid rest of every overdue invoice
 * and the oldest overdue in calendar days of the company (not the phone's) — «Просрочено $1,400 · 12 дн».
 */
export function clientOverdueOf(db: Pick<DB, "invoices">, customerId: ID, now = Date.now(), tz: string = getZone()): { cents: number; days: number } | null {
  const late = db.invoices.filter((i) => i.customerId === customerId && i.paidCents < i.totalCents && !!i.dueDate && isOverdue(i.dueDate, now, tz));
  // money only through the engine (rule 8): the owed rest of the overdue invoices, whole cents
  const cents = clientMoney(late, []).owesCents;
  if (cents <= 0) return null;
  return { cents, days: Math.max(...late.map((i) => daysOverdue(i.dueDate, now, tz))) };
}

/** Money on the card: director and office see it, the tech does not (docs/specs/04 §8). */
export const canSeeClientMoney = (role: Role) => role !== "tech";
/** Tech sees only clients of their own visits; office sees everyone. */
export function visibleClients(db: DB, role: Role): Customer[] {
  // a card merged into another (step 17 C3, docs/specs/04 §13) is no longer a client: its old link shows «Слито с …»
  if (role !== "tech") return db.customers.filter((c) => !c.mergedIntoId);
  const mine = new Set(
    db.visits
      .filter((v) => isAssigned(v, db.me))
      .map((v) => db.properties.find((p) => p.id === db.jobs.find((j) => j.id === v.jobId)?.propertyId)?.customerId)
      .filter(Boolean),
  );
  return db.customers.filter((c) => mine.has(c.id) && !c.mergedIntoId);
}

/** Search: name, number, any phone or email of any person, address of any property, number of any document. */
export function matchClient(db: DB, c: Customer, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  const people = peopleOf(c);
  if (c.name.toLowerCase().includes(needle) || (c.number ?? "").toLowerCase().includes(needle)) return true;
  if (people.some((p) => p.name.toLowerCase().includes(needle) || p.emails.some((e) => e.address.toLowerCase().includes(needle)))) return true;
  if (digits.length >= 3 && people.some((p) => p.phones.some((x) => x.number.replace(/\D/g, "").includes(digits)))) return true;
  if (db.properties.some((p) => p.customerId === c.id && `${p.address} ${p.city}`.toLowerCase().includes(needle))) return true;
  const docNumbers = [
    ...db.estimates.filter((e) => e.customerId === c.id).map((e) => e.number),
    ...db.invoices.filter((i) => i.customerId === c.id).map((i) => i.number),
    ...db.payments.filter((p) => p.customerId === c.id).map((p) => p.receiptNumber),
    ...db.leads.filter((l) => l.customerId === c.id).map((l) => l.number),
  ];
  return docNumbers.some((n) => !!n && n.toLowerCase().includes(needle));
}

export type HistoryKind = "talk" | "docs" | "money";
export interface HistoryItem {
  id: string;
  at: string;
  kind: HistoryKind;
  icon: IconKey;
  title: DictKey;
  detail?: string;
  href?: string;
  /** amount shown on the right (money events, office only) */
  cents?: number;
}

/**
 * One history of the client: their leads, estimates (sent / signed), jobs and visits, invoices, payments, notes,
 * tasks done, calls and messages — newest first. Money lines are left out for roles that don't see money.
 */
export function clientHistory(db: DB, customerId: ID, role: Role): HistoryItem[] {
  const out: HistoryItem[] = [];
  const money = canSeeClientMoney(role);
  const leadIds = new Set(db.leads.filter((l) => l.customerId === customerId).map((l) => l.id));
  for (const l of db.leads.filter((x) => x.customerId === customerId)) {
    out.push({ id: `lead-${l.id}`, at: l.receivedAt, kind: "talk", icon: "inbox", title: "client.h.lead", detail: l.service ?? l.number, href: `/lead/${l.id}` });
  }
  for (const e of db.estimates.filter((x) => x.customerId === customerId)) {
    if (e.sentAt) out.push({ id: `est-sent-${e.id}`, at: e.sentAt, kind: "docs", icon: "send", title: "client.h.estimateSent", detail: e.title, href: `/estimate/${e.id}`, cents: money ? e.totalCents : undefined });
    if (e.approvedAt) out.push({ id: `est-ok-${e.id}`, at: e.approvedAt, kind: "docs", icon: "signature", title: "client.h.estimateSigned", detail: e.title, href: `/estimate/${e.id}`, cents: money ? e.totalCents : undefined });
  }
  const propIds = new Set(db.properties.filter((p) => p.customerId === customerId).map((p) => p.id));
  for (const v of db.visits.filter((x) => propIds.has(visitPropertyId(db, x) ?? ""))) {
    const job = v.jobId ? db.jobs.find((j) => j.id === v.jobId) : undefined;
    out.push({ id: `visit-${v.id}`, at: v.start, kind: "docs", icon: "route", title: "client.h.visit", detail: job?.title, href: `/visit/${v.id}` });
  }
  if (money) {
    for (const i of db.invoices.filter((x) => x.customerId === customerId && x.sentAt)) {
      out.push({ id: `inv-${i.id}`, at: i.sentAt!, kind: "money", icon: "invoice", title: "client.h.invoice", detail: [i.number, i.title].filter(Boolean).join(" · "), href: `/invoice/${i.id}`, cents: i.totalCents });
    }
    for (const p of db.payments.filter((x) => x.customerId === customerId)) {
      out.push({ id: `pay-${p.id}`, at: p.at, kind: "money", icon: "dollar", title: "client.h.payment", detail: p.receiptNumber, href: `/receipt/${p.id}`, cents: p.amountCents });
    }
  }
  for (const n of db.notes.filter((x) => (x.subjectType === "customer" && x.subjectId === customerId) || (x.subjectType === "lead" && leadIds.has(x.subjectId)))) {
    if (n.visibility === "private" && n.authorId !== db.me) continue;
    out.push({ id: `note-${n.id}`, at: n.at, kind: "talk", icon: "note", title: "client.h.note", detail: n.body });
  }
  for (const a of db.activities.filter((x) => (x.subjectType === "customer" && x.subjectId === customerId) || (x.subjectType === "lead" && leadIds.has(x.subjectId)))) {
    if (!["call", "sms", "email"].includes(a.kind)) continue;
    const icon: IconKey = a.kind === "call" ? "phone" : a.kind === "sms" ? "sms" : "mail";
    out.push({ id: `act-${a.id}`, at: a.at, kind: "talk", icon, title: `client.h.${a.kind}` as DictKey, detail: a.body });
  }
  for (const t of db.tasks.filter((x) => x.subjectType === "customer" && x.subjectId === customerId && x.doneAt)) {
    out.push({ id: `task-${t.id}`, at: t.doneAt!, kind: "talk", icon: "check", title: "client.h.taskDone", detail: t.title });
  }
  return out.filter((x) => !!x.at).sort((a, b) => b.at.localeCompare(a.at));
}

/** "No calls after 6 pm" tag is on the client and it is 6 pm or later now on the company's clock (П4b; the client is
 *  local to the company, not to the phone) */
export function noLateCallsNow(db: DB, c: Customer, now = new Date(), tz: string = getZone()): boolean {
  if (minuteIn(now.getTime(), tz) < 18 * 60) return false;
  return tagsOf(db, c).some((x) => x.system && x.name.toLowerCase() === "no calls after 6 pm");
}
