/**
 * «Связано» (docs/specs/13-app-structure.md §2.7, 15-flows §2, 17-job §7): one list of the PARENTS of a document —
 * lead, client, property, estimate, job, invoice — the same on every screen (job, visit; estimate, invoice and receipt
 * plug in later: waves С and 8). Children (visits of a job, invoices…) are rows and lists of the screen, not here.
 * Rights: a link the role may not open (routeRoles) is dropped; the technician gets no estimate (company money,
 * 13 §2.7 «мастеру — без денег»). Cancelled jobs are still found (findJob).
 */
import type { DB, Role } from "@/data/types";
import { findJob, jobOfEstimate } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { canOpen } from "@/nav/roles";

export type RelatedKind = "lead" | "customer" | "property" | "estimate" | "job" | "invoice";
export interface RelatedLink {
  kind: RelatedKind;
  id: string;
  href: string;
  /** what the link shows after the kind word: a number (JOB-0012), a name or an address; "" = only the kind word */
  text: string;
}
export type RelatedOf =
  | { type: "job"; id: string }
  | { type: "visit"; id: string }
  | { type: "estimate"; id: string }
  | { type: "invoice"; id: string }
  | { type: "receipt"; id: string };

type D = Pick<DB, "jobs" | "cancelledJobs" | "visits" | "leads" | "customers" | "properties" | "estimates" | "invoices" | "payments">;

const HREF: Record<RelatedKind, string> = { lead: "/lead/", customer: "/client/", property: "/property/", estimate: "/estimate/", job: "/job/", invoice: "/invoice/" };

export function relatedOf(db: D, of: RelatedOf, role: Role): RelatedLink[] {
  const out: RelatedLink[] = [];
  const add = (kind: RelatedKind, id: string | undefined) => {
    if (!id || out.some((l) => l.kind === kind)) return;
    const text = label(db, kind, id);
    if (text === null) return; // not in the data the role has: no dead link
    out.push({ kind, id, href: `${HREF[kind]}${id}`, text });
  };
  const fromJob = (jobId: string | undefined) => {
    const j = findJob(db, jobId);
    if (!j) return;
    const est = j.estimateId ? db.estimates.find((e) => e.id === j.estimateId) : undefined;
    add("lead", est?.leadId);
    add("customer", j.customerId ?? db.properties.find((p) => p.id === j.propertyId)?.customerId);
    add("property", j.propertyId);
    add("estimate", j.estimateId);
  };

  switch (of.type) {
    case "job":
      fromJob(of.id);
      break;
    case "visit": {
      const v = db.visits.find((x) => x.id === of.id);
      if (!v) break;
      add("job", findJob(db, v.jobId)?.id);
      add("lead", v.leadId);
      const pid = visitPropertyId(db, v) ?? (v.jobId ? findJob(db, v.jobId)?.propertyId : undefined);
      add("customer", db.properties.find((p) => p.id === pid)?.customerId ?? (v.leadId ? db.leads.find((l) => l.id === v.leadId)?.customerId : undefined));
      add("property", pid);
      break;
    }
    case "estimate": {
      const e = db.estimates.find((x) => x.id === of.id);
      if (!e) break;
      add("lead", e.leadId);
      add("customer", e.customerId);
      add("property", e.propertyId);
      add("job", jobOfEstimate(db, e.id)?.id);
      break;
    }
    case "invoice": {
      const i = db.invoices.find((x) => x.id === of.id);
      if (!i) break;
      add("job", findJob(db, i.jobId)?.id);
      add("estimate", findJob(db, i.jobId)?.estimateId);
      add("customer", i.customerId);
      break;
    }
    case "receipt": {
      const p = db.payments.find((x) => x.id === of.id);
      if (!p) break;
      const i = db.invoices.find((x) => x.id === p.invoiceId);
      add("invoice", i?.id);
      add("job", findJob(db, i?.jobId)?.id);
      add("customer", p.customerId);
      break;
    }
  }
  // the technician: no estimate (company money) and no lead behind a job (its estimates); the lead of an inspection
  // he is on stays (15-flows §2 «Выезд → Лид у осмотра»)
  return out.filter((l) => canOpen(role, l.href) && !(role === "tech" && (l.kind === "estimate" || (l.kind === "lead" && of.type !== "visit"))));
}

function label(db: D, kind: RelatedKind, id: string): string | null {
  switch (kind) {
    case "lead": {
      const l = db.leads.find((x) => x.id === id);
      return l ? (l.number ?? l.name) : null;
    }
    case "customer": {
      const c = db.customers.find((x) => x.id === id);
      return c ? c.name : null;
    }
    case "property": {
      const p = db.properties.find((x) => x.id === id);
      return p ? p.address : null;
    }
    case "estimate": {
      const e = db.estimates.find((x) => x.id === id);
      return e ? (e.number ?? "") : null;
    }
    case "job": {
      const j = findJob(db, id);
      return j ? (j.number ?? j.title) : null;
    }
    case "invoice": {
      const i = db.invoices.find((x) => x.id === id);
      return i ? (i.number ?? "") : null;
    }
  }
}
