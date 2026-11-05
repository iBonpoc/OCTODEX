/**
 * Visit and Plan rules (docs/specs/03-visit-and-plan.md §4, §8; story map S4, S4a, S9, S9a). Core, niche-free, pure —
 * tested in test/schedule.test.ts. The database holds the same transitions (app.status_transitions, migration
 * 20261105280000) and the same rights (tech guard).
 */
import { visitPropertyId } from "@/data/selectors";
import type { DB, ID, Lead, Role, Visit } from "@/data/types";

type Db = Pick<DB, "visits" | "jobs" | "leads">;

/** an inspection of this lead: its own lead link, or (data before wave П1) an "estimate" job at the lead's property */
export function isInspectionOf(db: Pick<DB, "jobs">, v: Visit, l: Pick<Lead, "id" | "propertyId">): boolean {
  if (v.leadId) return v.leadId === l.id;
  if (!l.propertyId || !v.jobId) return false;
  const j = db.jobs.find((x) => x.id === v.jobId);
  // old saved data: the job status was "estimate" (normalize moves it; kept for a cache read before that)
  return !!j && (j.status as string) === "estimate" && j.propertyId === l.propertyId;
}

/** not finished and not closed: it can still happen */
export const isOpenVisit = (v: Visit) => !v.closed && v.step !== "paid" && v.step !== "done";

/** the office moves or cancels a visit only before the tech is on site (§4.1 "Запреты") */
export const canReschedule = (v: Visit) => isOpenVisit(v) && (v.step === "scheduled" || v.step === "en_route");
export const canCancel = canReschedule;

/** who may plan, move, cancel or assign (§8.1): director and dispatcher; a tech only walks the steps */
export const canPlan = (roles: Role[]) => roles.includes("director") || roles.includes("dispatcher");

/** a new visit is never in the past, except earlier today ("I already went", noted in the feed) */
export function startAllowed(startIso: string, now: number = Date.now()): boolean {
  const t = new Date(startIso).getTime();
  if (Number.isNaN(t)) return false;
  if (t >= now) return true;
  return new Date(t).toDateString() === new Date(now).toDateString();
}

/** visits of the same person that overlap [start, start + duration) — by time, not "how many that day" */
export function overlaps(db: Pick<DB, "visits">, techId: ID | null, startIso: string, durationMin: number, exceptId?: ID): Visit[] {
  if (!techId) return [];
  const a = new Date(startIso).getTime();
  const b = a + durationMin * 60_000;
  return db.visits.filter((v) => {
    if (v.id === exceptId || v.techId !== techId || !isOpenVisit(v)) return false;
    const s = new Date(v.start).getTime();
    const e = s + (v.durationMin || 0) * 60_000;
    return s < b && a < e;
  });
}

/** late: the start has passed and the tech is not on site yet (computed, not stored) */
export function visitLate(v: Visit, now: number = Date.now()): boolean {
  return isOpenVisit(v) && (v.step === "scheduled" || v.step === "en_route") && new Date(v.start).getTime() < now;
}

/** S4a: after this visit is cancelled, does its lead go back from "booked" to "replied"? (no other open inspection) */
export function leadRollsBack(db: Db, cancelledId: ID): ID | null {
  const v = db.visits.find((x) => x.id === cancelledId);
  if (!v) return null;
  const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : db.leads.find((l) => isInspectionOf(db, v, l));
  if (!lead || lead.status !== "booked") return null;
  const other = db.visits.some((x) => x.id !== cancelledId && isOpenVisit(x) && isInspectionOf(db, x, lead));
  return other ? null : lead.id;
}

/** S9a: after this visit is cancelled, does its job go back from "scheduled" to "unscheduled"? (no other open visit) */
export function jobRollsBack(db: Db, cancelledId: ID): ID | null {
  const v = db.visits.find((x) => x.id === cancelledId);
  if (!v?.jobId) return null;
  const job = db.jobs.find((j) => j.id === v.jobId);
  if (!job || job.status !== "scheduled") return null;
  const other = db.visits.some((x) => x.id !== cancelledId && x.jobId === job.id && isOpenVisit(x));
  return other ? null : job.id;
}

/** one planned inspection of a lead at a time (double tap, second booking): reschedule lives in the Plan */
export function hasPlannedInspection(db: Db, l: Pick<Lead, "id" | "propertyId">, now: number = Date.now()): boolean {
  return db.visits.some((v) => isOpenVisit(v) && new Date(v.start).getTime() > now && isInspectionOf(db, v, l));
}

/** the property of a visit, re-exported for the screens of the Plan */
export { visitPropertyId };
