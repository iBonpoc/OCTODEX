/**
 * Visit and Plan rules (docs/specs/03-visit-and-plan.md §4, §8; story map S4, S4a, S9, S9a). Core, niche-free, pure —
 * tested in test/schedule.test.ts. The database holds the same transitions (app.status_transitions, migration
 * 20261105280000) and the same rights (tech guard).
 */
import { visitPropertyId } from "@/data/selectors";
import { VISIT_STEPS, type DB, type ID, type Lead, type Role, type Visit, type VisitStep } from "@/data/types";

type Db = Pick<DB, "visits" | "jobs" | "leads">;

/** an inspection of this lead: its own lead link, or (data before wave П1) an "estimate" job at the lead's property */
export function isInspectionOf(db: Pick<DB, "jobs">, v: Visit, l: Pick<Lead, "id" | "propertyId">): boolean {
  if (v.leadId) return v.leadId === l.id;
  if (!l.propertyId || !v.jobId) return false;
  const j = db.jobs.find((x) => x.id === v.jobId);
  // old saved data: the job status was "estimate" (normalize moves it; kept for a cache read before that)
  return !!j && (j.status as string) === "estimate" && j.propertyId === l.propertyId;
}

/** S10: the next step on site. An inspection ends with "done" after "on site" (no work, signature or payment, §4.1) */
export const INSPECTION_STEPS: VisitStep[] = ["scheduled", "en_route", "on_site", "done"];
export function nextStep(v: Pick<Visit, "step" | "kind">): VisitStep {
  const path = v.kind === "inspection" ? INSPECTION_STEPS : VISIT_STEPS;
  const i = path.indexOf(v.step);
  return path[Math.min(i < 0 ? 0 : i + 1, path.length - 1)]!;
}

/** everyone on a visit (old saved data has only techId) */
export const assigneesOf = (v: Pick<Visit, "techId" | "assigneeIds">): ID[] => (v.assigneeIds?.length ? v.assigneeIds : v.techId ? [v.techId] : []);
/** is this person on the visit (first or not) */
export const isAssigned = (v: Pick<Visit, "techId" | "assigneeIds">, id: ID | null | undefined): boolean => !!id && assigneesOf(v).includes(id);
/** a visit with these people: techId is the first, assigneeIds the list without doubles */
export function withAssignees<V extends Visit>(v: V, ids: ID[]): V {
  const list = [...new Set(ids.filter(Boolean))];
  return { ...v, techId: list[0] ?? null, assigneeIds: list };
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
export function overlaps(db: Pick<DB, "visits">, techId: ID | ID[] | null, startIso: string, durationMin: number, exceptId?: ID): Visit[] {
  const people = Array.isArray(techId) ? techId : techId ? [techId] : [];
  if (!people.length) return [];
  const a = new Date(startIso).getTime();
  const b = a + durationMin * 60_000;
  return db.visits.filter((v) => {
    if (v.id === exceptId || !people.some((p) => isAssigned(v, p)) || !isOpenVisit(v)) return false;
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

/* ---------- the visit form (docs/specs/03 §7.1, wave П2) ---------- */

/** defaults until "More → Company → Schedule" (wave П4) replaces them with the company's settings */
export const SCHEDULE_DEFAULTS = {
  dayStartMin: 8 * 60, dayEndMin: 18 * 60, stepMin: 30, inspectionMin: 45, jobMin: 120,
  /** the form: days shown as chips (twice that with «Ещё неделя»), the range of «Другое время», length step and max */
  formDays: 7, earliestMin: 6 * 60, latestMin: 20 * 60, durationStepMin: 15, maxDurationMin: 12 * 60,
} as const;
type Hours = Pick<typeof SCHEDULE_DEFAULTS, "dayStartMin" | "dayEndMin" | "stepMin">;

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** the start of a day + minutes (local time of the phone) */
export function atMinute(day: Date, minute: number): string {
  const d = new Date(day);
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.toISOString();
}

/** open visits of a person on that day, by start (the row "2 visits · 10:00–12:00, 14:00–15:00") */
export function dayVisits(db: Pick<DB, "visits">, techId: ID, day: Date, exceptId?: ID): Visit[] {
  return db.visits
    .filter((v) => v.id !== exceptId && isAssigned(v, techId) && isOpenVisit(v) && sameDay(new Date(v.start), day))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** start minutes the person is free for `durationMin`, inside working hours, on the step; never in the past today */
export function freeSlots(
  db: Pick<DB, "visits">, techId: ID | ID[] | null, day: Date, durationMin: number,
  opts: { exceptId?: ID; now?: number; hours?: Hours } = {},
): number[] {
  const h = opts.hours ?? SCHEDULE_DEFAULTS;
  const now = opts.now ?? Date.now();
  const out: number[] = [];
  for (let m = h.dayStartMin; m + durationMin <= h.dayEndMin; m += h.stepMin) {
    const start = atMinute(day, m);
    if (new Date(start).getTime() < now) continue;
    // several people: a slot is free when all of them are free
    if (overlaps(db, techId, start, durationMin, opts.exceptId).length) continue;
    out.push(m);
  }
  return out;
}

export type FormWarning = { key: "busy"; visits: Visit[] } | { key: "outOfHours" } | { key: "past" };

/** what the form warns about (status warn, with a word); saving stays possible except in the past */
export function formWarnings(
  db: Pick<DB, "visits">, f: { techId: ID | ID[] | null; start: string; durationMin: number; exceptId?: ID },
  opts: { now?: number; hours?: Hours } = {},
): FormWarning[] {
  const h = opts.hours ?? SCHEDULE_DEFAULTS;
  const out: FormWarning[] = [];
  const busy = overlaps(db, f.techId, f.start, f.durationMin, f.exceptId);
  if (busy.length) out.push({ key: "busy", visits: busy });
  const s = minuteOfDay(new Date(f.start));
  if (s < h.dayStartMin || s + f.durationMin > h.dayEndMin) out.push({ key: "outOfHours" });
  if (!startAllowed(f.start, opts.now)) out.push({ key: "past" });
  return out;
}
