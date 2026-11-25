/**
 * Whose work a technician may open (#868, Q-40, Q-41; 13 §4 «Мастер — только своё»). The mirror of the database's
 * row rules — keep them together when either changes:
 *   visits_select / is_visit_assignee — T22, T35;   jobs_select / is_job_assignee — T22, T35;
 *   invoices_select (the tech's job) — T22;
 *   estimates_select (created_by = him, or app.is_property_assignee: a visit of his that counts at the property) — T33;
 *   estimates_insert (a tech: a property he works at) — T33;
 *   catalog_items_update / insert — staff only — T99.
 * In the cloud the server already gave the phone only what the person may see (RLS): every rule here says «yes» there,
 * so nothing the tech made offline (his own draft, not on the server yet) is ever hidden by the phone. The rules matter
 * in the demo, where the phone holds the whole company. Pure, unit-tested: test/access.test.ts.
 */
import type { DB, ID, Lead, Role } from "@/data/types";
import type { Mode } from "@/data/store";
import { techVisitCounts } from "./comms/comms";
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
export function canSeeInvoice(db: Pick<DB, "visits" | "invoices" | "voidInvoices">, w: Who, invoiceId: ID): boolean {
  if (free(w)) return true;
  // a voided one (В1-5) the same: the tech's job's only
  const inv = db.invoices.find((x) => x.id === invoiceId) ?? (db.voidInvoices ?? []).find((x) => x.id === invoiceId);
  return !!inv && canSeeJob(db, w, inv.jobId);
}
/** an estimate is the tech's as the server's estimates_select says (T33): made by him (created_by), or on a property where
 *  he has a visit that counts (app.is_property_assignee → tech_visit_counts: his, not cancelled / no-show, its job not
 *  done, within the last 14 days — features/comms techVisitCounts), an inspection without a job included. Not through a
 *  lead assigned to him: the server does not show it that way (director's review of #1134 Б1). */
export function canSeeEstimate(db: Pick<DB, "visits" | "jobs" | "estimates" | "leads">, w: Who, estimateId: ID): boolean {
  if (free(w)) return true;
  const e = db.estimates.find((x) => x.id === estimateId);
  return !!e && (e.createdBy === w.me || isPropertyAssignee(db, w, e.propertyId));
}
/** the server's app.is_property_assignee: a visit of his that counts, at this property — the visit's own, else its job's,
 *  else its lead's (the server's t04_visit_property fills it the same way, #1138) */
export function isPropertyAssignee(db: Pick<DB, "visits" | "jobs" | "leads">, w: Who, propertyId: ID | undefined, now = Date.now()): boolean {
  if (!propertyId) return false;
  return db.visits.some(
    (v) =>
      (v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId ?? (v.leadId ? db.leads.find((l) => l.id === v.leadId)?.propertyId : undefined)) === propertyId &&
      techVisitCounts({ me: w.me, jobs: db.jobs }, v, now),
  );
}
/** the property a lead's estimate is made at (the store's leadTarget): the lead's own, else its client's first; none —
 *  a new one is made for it (then nobody has a visit there yet) */
export function leadEstimatePropertyId(db: Pick<DB, "properties">, l: Pick<Lead, "propertyId" | "customerId">): ID | undefined {
  return l.propertyId ?? (l.customerId ? db.properties.find((p) => p.customerId === l.customerId)?.id : undefined);
}
/** a tech saves a new estimate only where the server lets him (estimates_insert: a property he works at, #1138) */
export const canMakeEstimateAt = (db: Pick<DB, "visits" | "jobs" | "leads">, w: Who, propertyId: ID | undefined): boolean => free(w) || isPropertyAssignee(db, w, propertyId);
/** #2674 Б2′: «Сделать копию» из отказа — новая смета, и мастер делает её только там, где он назначен. В облаке `canMakeEstimateAt`
 *  у мастера всегда true (`free`: сервер решает сам), а карточки отказа бывают только в облаке — поэтому для окна проверяется назначение напрямую */
export const canCopyRejectedEstimate = (db: Pick<DB, "visits" | "jobs" | "leads">, w: Who, propertyId: ID | undefined, now = Date.now()): boolean => w.role === "tech" ? isPropertyAssignee(db, w, propertyId, now) : true;
/** the price list is the office's to change (catalog_items_update — staff); the tech only reads it */
export const canEditCatalog = (role: Role) => role !== "tech";

/**
 * #1837 (spec 54 §4 №5): who sees our costs — the server's app.can_view_costs (19 §9) is the only truth; screens, the
 * store and the features ask these functions, never db.costsVisible itself (guard: test/seeCosts.test.ts).
 * - roleSeesCosts — the table of app.can_view_costs: owner, admin, office — yes; tech, subcontractor — no; sales — only
 *   with view_costs; a membership that is not active (invited, disabled, deleted) — no; a deleted one is not loaded at all
 *   (cloud/repo.ts costsVisibleFor; db T364). A role the phone does not know — no (the server would let it with
 *   view_costs; its check constraint has none — the phone errs towards «no»).
 * - serverSaysCosts — what the last load said (DB.costsVisible). Not known yet in the cloud (an old cache, before the
 *   first load) — no: nothing is counted or written on a guess; the demo (no server) — yes.
 * - seeCosts — what a screen SHOWS: the server's «yes», and never in the tech view (spec 06 §7.6 — an owner who switched
 *   to «Мастер» shows no cost or margin on site either).
 * - keepCosts — what a WRITE carries on: the costs the phone holds go on unless the server said «no» (the phone holds
 *   only what the server gave it: an unknown flag must not drop a template's or an order's costs for good — review №1).
 */
export function roleSeesCosts(role: string, viewCosts: boolean, active = true): boolean {
  if (!active) return false;
  if (role === "owner" || role === "admin" || role === "office") return true;
  if (role === "sales") return viewCosts;
  return false;
}
export function serverSaysCosts(db: Pick<DB, "costsVisible">, mode: Mode): boolean {
  if (typeof db.costsVisible === "boolean") return db.costsVisible;
  return mode !== "cloud";
}
export const seeCosts = (db: Pick<DB, "costsVisible">, role: Role, mode: Mode): boolean => role !== "tech" && serverSaysCosts(db, mode);
export const keepCosts = (db: Pick<DB, "costsVisible">): boolean => db.costsVisible !== false;
