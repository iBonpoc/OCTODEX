/**
 * Whose work a technician may open (#868, Q-40, Q-41; 13 §4 «Мастер — только своё»). The mirror of the database's
 * row rules — keep them together when either changes:
 *   visits_select / is_visit_assignee — T22, T35;   jobs_select / is_job_assignee — T22, T35;
 *   invoices_select (the tech's job) — T22;          estimates_select (created by him or the property of his work) — T33;
 *   catalog_items_update / insert — staff only — T99.
 * In the cloud the server already gave the phone only what the person may see (RLS): every rule here says «yes» there,
 * so nothing the tech made offline (his own draft, not on the server yet) is ever hidden by the phone. The rules matter
 * in the demo, where the phone holds the whole company. Pure, unit-tested: test/access.test.ts.
 */
import type { DB, ID, Role } from "@/data/types";
import type { Mode } from "@/data/store";
import { canSeeLead } from "./leads";
import { isAssigned } from "./schedule";

type Who = { role: Role; mode: Mode; me: ID };
const free = (w: Who) => w.role !== "tech" || w.mode === "cloud";

export function canSeeVisit(db: Pick<DB, "visits">, w: Who, visitId: ID): boolean {
  if (free(w)) return true;
  const v = db.visits.find((x) => x.id === visitId);
  return !!v && isAssigned(v, w.me);
}
/** a job is the tech's when one of its visits is his */
export function canSeeJob(db: Pick<DB, "visits">, w: Who, jobId: ID | undefined): boolean {
  if (free(w)) return true;
  return !!jobId && db.visits.some((v) => v.jobId === jobId && isAssigned(v, w.me));
}
/** an invoice is the tech's when its job is */
export function canSeeInvoice(db: Pick<DB, "visits" | "invoices">, w: Who, invoiceId: ID): boolean {
  if (free(w)) return true;
  const inv = db.invoices.find((x) => x.id === invoiceId);
  return !!inv && canSeeJob(db, w, inv.jobId);
}
/** an estimate is the tech's when it is of his job, of a property he works at, or of his lead */
export function canSeeEstimate(db: Pick<DB, "visits" | "jobs" | "estimates" | "leads">, w: Who, estimateId: ID): boolean {
  if (free(w)) return true;
  const e = db.estimates.find((x) => x.id === estimateId);
  if (!e) return false;
  const lead = e.leadId ? db.leads.find((l) => l.id === e.leadId) : undefined;
  if (lead && canSeeLead(w.role, w.me, lead)) return true;
  return db.jobs.some((j) => (j.estimateId === e.id || j.propertyId === e.propertyId) && canSeeJob(db, w, j.id));
}
/** the price list is the office's to change (catalog_items_update — staff); the tech only reads it */
export const canEditCatalog = (role: Role) => role !== "tech";
