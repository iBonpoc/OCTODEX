/**
 * «Искать везде» (docs/specs/15-flows.md §3.2, 13 v2 §2.2): one pure function over the local database, works offline.
 * Unit-tested in test/search.test.ts.
 *
 * - a number: the exact start (`EST-12`); bare digits (`12`) — any prefix (CLT, LEA, JOB, EST, INV, RCT);
 * - a phone: by digits, from 3, of every person of a client and a lead;
 * - a name, an address, an email: anywhere in it, any case;
 * - closed leads and archived clients are found too, below the open ones, marked;
 * - rights as in ☰ (13 §4): the technician finds only his own (his visits' clients and jobs, the leads he made),
 *   never invoices or payments.
 * Custom fields «search by this field» — with wave 7 (custom_fields).
 */
import type { DB, Person, Role } from "@/data/types";
import { leadPeopleOf, peopleOf } from "@/data/people";
import { isAssigned } from "./schedule";
import { isOpenLead } from "./leads";
import { statusOf, visibleClients } from "./clients";

export type SearchGroup = "clients" | "leads" | "properties" | "jobs" | "estimates" | "invoices" | "payments";
export const SEARCH_GROUPS: readonly SearchGroup[] = ["clients", "leads", "properties", "jobs", "estimates", "invoices", "payments"];

/** why it was found: shown on the card («телефон Mary») */
export type WhyKind = "name" | "number" | "phone" | "email" | "address" | "person" | "title" | "client";
export interface Why {
  kind: WhyKind;
  /** the person's name for phone / email / person of someone other than the main one */
  who?: string;
}
export interface Hit {
  group: SearchGroup;
  id: string;
  title: string;
  subtitle?: string;
  number?: string;
  href: string;
  why: Why;
  /** a closed lead or an archived client: below the open ones, marked */
  closed?: boolean;
}

/** a query of digits and phone punctuation only («555 12», «(626) 555») */
const numeric = (q: string) => /^[\d\s().+-]+$/.test(q);
const digitsOf = (s: string) => s.replace(/\D/g, "");

/** does a document number match: `EST-12` → the exact start; bare digits → the digits part of any prefix */
export function numberMatches(num: string | undefined, query: string): boolean {
  if (!num) return false;
  const n = num.toLowerCase().replace(/[\s-]/g, "");
  const q = query.trim().toLowerCase().replace(/[\s-]/g, "");
  if (!q) return false;
  if (/^[a-z]/.test(q)) {
    if (n.startsWith(q)) return true;
    // «EST-12» finds EST-0012: the same prefix, the digits without the leading zeros
    const qm = /^([a-z]+)(\d+)$/.exec(q);
    const nm = /^([a-z]+)(\d+)$/.exec(n);
    return !!qm && !!nm && qm[1] === nm[1] && nm[2]!.replace(/^0+/, "").startsWith(qm[2]!.replace(/^0+/, ""));
  }
  if (!/^\d+$/.test(q)) return false;
  return digitsOf(n).replace(/^0+/, "").startsWith(q.replace(/^0+/, ""));
}

/** a reason when the condition holds */
const why = (cond: boolean, kind: WhyKind): Why | undefined => (cond ? { kind } : undefined);

const has = (s: string | undefined, needle: string) => !!s && s.toLowerCase().includes(needle);

/** the first reason a set of people matches: a name, a phone (digits ≥ 3) or an email; `main` = the client/lead itself */
function peopleWhy(people: Person[], needle: string, digits: string, mainName: string): Why | undefined {
  for (const p of people) {
    const other = p.name && p.name !== mainName ? p.name : undefined;
    if (digits.length >= 3 && p.phones.some((x) => digitsOf(x.number).includes(digits))) return { kind: "phone", who: other };
    if (!numeric(needle) && p.emails.some((e) => has(e.address, needle))) return { kind: "email", who: other };
    if (!numeric(needle) && other && has(p.name, needle)) return { kind: "person", who: other };
  }
  return undefined;
}

/** «Искать везде»: hits by group, open before closed; empty query — nothing. */
export function searchAll(db: DB, query: string, role: Role): Record<SearchGroup, Hit[]> {
  const out: Record<SearchGroup, Hit[]> = { clients: [], leads: [], properties: [], jobs: [], estimates: [], invoices: [], payments: [] };
  const needle = query.trim().toLowerCase();
  if (!needle) return out;
  const num = numeric(needle);
  const digits = num ? digitsOf(needle) : "";
  const text = !num;
  const tech = role === "tech";

  const clients = visibleClients(db, role);
  const clientIds = new Set(clients.map((c) => c.id));
  const nameOf = (cid: string) => db.customers.find((c) => c.id === cid)?.name ?? "";
  const propOf = (pid: string) => db.properties.find((p) => p.id === pid);
  const addrOf = (pid: string) => {
    const p = propOf(pid);
    return p ? [p.address, p.city].filter(Boolean).join(", ") : undefined;
  };

  for (const c of clients) {
    const w: Why | undefined =
      why(text && has(c.name, needle), "name") ??
      why(numberMatches(c.number, needle), "number") ??
      why(digits.length >= 3 && digitsOf(c.phone).includes(digits), "phone") ??
      why(text && has(c.email, needle), "email") ??
      peopleWhy(peopleOf(c), needle, digits, c.name);
    if (w) out.clients.push({ group: "clients", id: c.id, title: c.name, subtitle: c.phone, number: c.number, href: `/client/${c.id}`, why: w, closed: statusOf(c) === "archived" });
  }

  for (const p of db.properties) {
    if (!clientIds.has(p.customerId) || !text) continue;
    if (!has(`${p.address} ${p.unit ?? ""} ${p.city} ${p.label ?? ""}`, needle)) continue;
    out.properties.push({ group: "properties", id: p.id, title: [p.address, p.city].filter(Boolean).join(", "), subtitle: nameOf(p.customerId), href: `/property/${p.id}`, why: { kind: "address" } });
  }

  // the technician: only the leads he made himself («лид от соседа», 13 §2.3)
  for (const l of db.leads.filter((x) => !tech || x.createdBy === db.me)) {
    const w: Why | undefined =
      why(text && has(l.name, needle), "name") ??
      why(numberMatches(l.number, needle), "number") ??
      why(digits.length >= 3 && [l.phone, l.phone2].some((ph) => !!ph && digitsOf(ph).includes(digits)), "phone") ??
      why(text && has(l.email, needle), "email") ??
      why(text && has(`${l.address ?? ""} ${l.city}`, needle), "address") ??
      peopleWhy(leadPeopleOf(l), needle, digits, l.name);
    if (w) out.leads.push({ group: "leads", id: l.id, title: l.name, subtitle: l.service ?? l.city, number: l.number, href: `/lead/${l.id}`, why: w, closed: !isOpenLead(l) });
  }

  // jobs: by number (JOB-0001), title, client and address; the tech — jobs of his visits
  const myJobs = new Set(db.visits.filter((v) => isAssigned(v, db.me)).map((v) => v.jobId));
  for (const j of db.jobs) {
    const p = propOf(j.propertyId);
    const cid = j.customerId ?? p?.customerId ?? "";
    if (!p || !clientIds.has(cid) || (tech && !myJobs.has(j.id))) continue;
    const w: Why | undefined =
      why(numberMatches(j.number, needle), "number") ??
      why(text && has(j.title, needle), "title") ??
      why(text && has(nameOf(cid), needle), "client") ??
      why(text && has(`${p.address} ${p.city}`, needle), "address");
    if (w) out.jobs.push({ group: "jobs", id: j.id, title: j.title, subtitle: `${nameOf(cid)} · ${addrOf(p.id) ?? ""}`, number: j.number, href: `/job/${j.id}`, why: w });
  }

  for (const e of db.estimates) {
    if (!clientIds.has(e.customerId)) continue;
    const w: Why | undefined = why(numberMatches(e.number, needle), "number") ?? why(text && has(e.title, needle), "title") ?? why(text && has(nameOf(e.customerId), needle), "client");
    if (w) out.estimates.push({ group: "estimates", id: e.id, title: e.title, subtitle: nameOf(e.customerId), number: e.number, href: `/estimate/${e.id}`, why: w });
  }

  // money documents: not for the technician (13 §4)
  if (!tech) {
    for (const i of db.invoices) {
      const w: Why | undefined = why(numberMatches(i.number, needle), "number") ?? why(text && has(nameOf(i.customerId), needle), "client") ?? why(text && has(i.title, needle), "title");
      if (w) out.invoices.push({ group: "invoices", id: i.id, title: i.title ?? i.number ?? "", subtitle: nameOf(i.customerId), number: i.number, href: `/invoice/${i.id}`, why: w });
    }
    for (const pay of db.payments) {
      const w: Why | undefined = why(numberMatches(pay.receiptNumber, needle), "number") ?? why(text && has(nameOf(pay.customerId), needle), "client");
      if (w) out.payments.push({ group: "payments", id: pay.id, title: pay.receiptNumber ?? "", subtitle: nameOf(pay.customerId), number: pay.receiptNumber, href: `/receipt/${pay.id}`, why: w });
    }
  }

  // open first, closed below (stable within each)
  for (const g of SEARCH_GROUPS) out[g] = [...out[g].filter((h) => !h.closed), ...out[g].filter((h) => h.closed)];
  return out;
}

export const hitCount = (r: Record<SearchGroup, Hit[]>) => SEARCH_GROUPS.reduce((n, g) => n + r[g].length, 0);
