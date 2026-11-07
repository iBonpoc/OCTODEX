/**
 * «Требует внимания» as people (docs/specs/06-list-cards.md, decision 5; specs/05 §8): one card per client with all
 * their reasons; a lead without a client is always its own card (CLAUDE.md). Works with ANY attention reason (kind-agnostic):
 * the client is found from the record the reason points to (refId), never from the name (a «late» reason is named after the tech).
 * Pure function; unit-tested in test/attentionPeople.test.ts.
 */
import { visitContext } from "@/data/selectors";
import type { DB, ID } from "@/data/types";
import type { AttentionItem } from "./attention";
import { invoiceBalance } from "./invoiceStatus";

export interface AttentionPerson {
  /** customer:<id> | lead:<id> | item:<id> (the record could not be found) */
  key: string;
  customerId?: ID;
  leadId?: ID;
  items: AttentionItem[];
  /** most urgent first */
  score: number;
  /** what the client owes on OVERDUE invoices only (balance through the engine); other amounts stay on their own reason */
  debtCents: number;
}

/** who a reason is about: walks the record the reason points to (invoice, estimate, job, visit, lead) */
export function subjectOf(db: DB, it: Pick<AttentionItem, "refId">): { customerId?: ID; leadId?: ID } {
  const id = it.refId;
  const inv = db.invoices.find((x) => x.id === id);
  if (inv) return { customerId: inv.customerId };
  const est = db.estimates.find((x) => x.id === id);
  if (est) return { customerId: est.customerId };
  const job = db.jobs.find((x) => x.id === id);
  if (job) return { customerId: db.properties.find((p) => p.id === job.propertyId)?.customerId };
  const visit = db.visits.find((x) => x.id === id);
  if (visit) {
    const c = visitContext(db, visit).customer?.id;
    return c ? { customerId: c } : visit.leadId ? subjectOfLead(db, visit.leadId) : {};
  }
  const lead = db.leads.find((x) => x.id === id);
  if (lead) return subjectOfLead(db, lead.id);
  // a task's subject (taskOrphan, docs/specs/22 §2): a client or a property of a client
  if (db.customers.some((c) => c.id === id)) return { customerId: id };
  const prop = db.properties.find((x) => x.id === id);
  if (prop?.customerId) return { customerId: prop.customerId };
  return {};
}
const subjectOfLead = (db: DB, leadId: ID) => {
  const l = db.leads.find((x) => x.id === leadId);
  return l?.customerId ? { customerId: l.customerId } : { leadId };
};

export function attentionPeople(db: DB, items: AttentionItem[]): AttentionPerson[] {
  const by = new Map<string, AttentionPerson>();
  for (const it of items) {
    const s = subjectOf(db, it);
    const key = s.customerId ? `customer:${s.customerId}` : s.leadId ? `lead:${s.leadId}` : `item:${it.id}`;
    const p = by.get(key) ?? { key, customerId: s.customerId, leadId: s.leadId, items: [], score: 0, debtCents: 0 };
    p.items.push(it);
    p.score = Math.max(p.score, it.score);
    const inv = db.invoices.find((x) => x.id === it.refId);
    if (inv && it.kind === "overdue") p.debtCents += invoiceBalance(inv).owesCents;
    by.set(key, p);
  }
  for (const p of by.values()) p.items.sort((a, b) => b.score - a.score);
  return [...by.values()].sort((a, b) => b.score - a.score);
}
