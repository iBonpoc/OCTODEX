/**
 * Visit and Plan rules (docs/specs/03-visit-and-plan.md §4, §8; story map S4, S4a, S9, S9a). Core, niche-free, pure —
 * tested in test/schedule.test.ts. The database holds the same transitions (app.status_transitions, migration
 * 20261105280000) and the same rights (tech guard).
 */
import { visitContext, visitPropertyId } from "@/data/selectors";
import { VISIT_STEPS, type DB, type ID, type Lead, type Member, type Role, type Visit, type VisitStep } from "@/data/types";
import { dayKeyIn, dayNumber, getZone, keyOfNumber, minuteIn, wallToInstant, weekdayOf, type DayKey } from "./zone";
import { BUSINESS_HOURS_DEFAULT, dayIn, hoursOn, SCHEDULE_SETTINGS_DEFAULT, type BusinessHours } from "./scheduleSettings";

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
/** the people of the company as the visit rules need them: who is at work (`pending` — invited, switched off or deleted) */
export type People = readonly Pick<Member, "id" | "pending">[];
/** whom an assignment may keep: only people at work (the server assigns only active members — a switched-off or deleted
 *  person left on the list would make assign_visit refuse the whole change, stuck in the outbox) */
export function keepableAssignees(ids: readonly ID[], members: People): ID[] {
  const off = new Set(members.filter((m) => m.pending).map((m) => m.id));
  return off.size ? ids.filter((id) => !off.has(id)) : [...ids];
}
/**
 * The people who can still come (wave 7а-2b, S22): someone switched off or who deleted their account is not on the
 * visit any more — a visit with only them is «Не назначено» everywhere (the Plan's columns, «Требует внимания», the
 * card, the chip), never «опаздывает: <them>». The same set as the Plan's columns and the assign sheet (`!pending`).
 * An id that is not in `members` at all (old data) still counts.
 */
export const liveAssignees = (v: Pick<Visit, "techId" | "assigneeIds">, members: People): ID[] => keepableAssignees(assigneesOf(v), members);
/** the people on the visit who are not at work any more: a new assignment takes them off (the toast names them) */
export function hiddenAssignees(v: Pick<Visit, "techId" | "assigneeIds">, members: People): ID[] {
  const live = new Set(liveAssignees(v, members));
  return assigneesOf(v).filter((id) => !live.has(id));
}
/** «План»: a card dragged from one person's column onto another — that person is replaced, the others at work stay;
 *  from the «Не назначено» column ("none") — only the new person (wave П3a; S22) */
export function moveAssignee(v: Pick<Visit, "techId" | "assigneeIds">, from: ID | "none", to: ID, members: People): ID[] {
  if (from === "none") return [to];
  return [...liveAssignees(v, members).filter((x) => x !== from && x !== to), to];
}

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

/** a new visit is never in the past, except earlier today of the company ("I already went", noted in the feed) */
export function startAllowed(startIso: string, now: number = Date.now(), tz: string = getZone()): boolean {
  const t = new Date(startIso).getTime();
  if (Number.isNaN(t)) return false;
  if (t >= now) return true;
  return dayKeyIn(t, tz) === dayKeyIn(now, tz);
}

/** visits of the same person that overlap [start, start + duration) — by time, not "how many that day" */
export function overlaps(db: Pick<DB, "visits">, techId: ID | ID[] | null, startIso: string, durationMin: number, exceptId?: ID, allDay = false): Visit[] {
  const people = Array.isArray(techId) ? techId : techId ? [techId] : [];
  if (!people.length) return [];
  const a = new Date(startIso).getTime();
  const b = a + durationMin * 60_000;
  return db.visits.filter((v) => {
    if (v.id === exceptId || !people.some((p) => isAssigned(v, p)) || !isOpenVisit(v)) return false;
    // «Весь день» (17-job §11.1) has no hours: it clashes only with another all-day visit of the person on that day
    if (!!v.allDay !== allDay) return false;
    const s = new Date(v.start).getTime();
    const e = s + (v.durationMin || 0) * 60_000;
    return s < b && a < e;
  });
}

/** why a visit is late: the tech is on the way, or has not left yet (docs/specs/03 П3c) */
export type LateKind = "en_route" | "not_left";

/**
 * П3c, one rule for the list sign, the "Needs attention" item and the office notice: the start + lateAfterMin has passed,
 * someone is on the visit, and nobody is on site yet. «On the way» does not clear it (founder, 05.11); only «on site»
 * (and any later step), a closed visit or the first ticked checklist item do. Computed, never stored.
 */
export function lateKind(
  v: Pick<Visit, "start" | "step" | "closed" | "checklist" | "techId" | "assigneeIds"> & { allDay?: boolean },
  members: People,
  now: number = Date.now(),
  lateAfterMin: number = SCHEDULE_SETTINGS_DEFAULT.lateAfterMin,
): LateKind | null {
  if (v.closed || (v.step !== "scheduled" && v.step !== "en_route")) return null;
  // a whole-day visit has no start hour to be late for (17-job §11.1)
  if (v.allDay) return null;
  // nobody who can come: «Не назначено», not «опаздывает» (S22)
  if (!liveAssignees(v, members).length || v.checklist?.some((c) => c.done)) return null;
  const t = new Date(v.start).getTime();
  if (Number.isNaN(t) || now < t + lateAfterMin * 60_000) return null;
  return v.step === "en_route" ? "en_route" : "not_left";
}
export const visitLate = (v: Parameters<typeof lateKind>[0], members: People, now: number = Date.now(), lateAfterMin?: number): boolean =>
  lateKind(v, members, now, lateAfterMin) !== null;

/**
 * П3c, the office side (the item in «Требует внимания» and the notice): the same rule, for visits that touch today —
 * they start today or are planned to run past the company's midnight into today (an 11:50 PM visit is still late at
 * 12:10 AM: the tech is late whatever the date; decided 06.11). An older visit that never started is a matter of «Работы»
 * (step 7), not «running late» for ever. One window for both. «Today» is the company's calendar day (П4a), the
 * threshold the company's setting.
 */
export const lateToday = (
  v: Parameters<typeof lateKind>[0] & { durationMin?: number }, members: People, now: number = Date.now(),
  s: { lateAfterMin: number } = SCHEDULE_SETTINGS_DEFAULT, tz: string = "America/Los_Angeles",
): LateKind | null => (touchesTodayIn(v, now, s.lateAfterMin, tz) ? lateKind(v, members, now, s.lateAfterMin) : null);

/** the visit's planned time (at least up to the moment it becomes late) reaches the company's today */
function touchesTodayIn(v: { start: string; durationMin?: number }, now: number, lateAfterMin: number, tz: string): boolean {
  const a = new Date(v.start).getTime();
  if (Number.isNaN(a)) return false;
  const today = dayIn(now, tz);
  const end = a + Math.max(v.durationMin || 0, lateAfterMin) * 60_000;
  return dayIn(a, tz) <= today && dayIn(end - 1, tz) >= today;
}

/** the same calendar day in a time zone (the company's) — not the phone's */
export const sameDayIn = (a: string | number, b: string | number, tz: string) =>
  dayIn(new Date(a).getTime(), tz) === dayIn(new Date(b).getTime(), tz);
/** whole calendar days from `now` to `t` in a time zone: 0 today, 1 tomorrow, −1 yesterday */
export const dayDiffIn = (t: string | number, now: number, tz: string) => dayIn(new Date(t).getTime(), tz) - dayIn(now, tz);

/** who the office reads on a visit item: the client (or the lead of an inspection without a client yet) and the first person */
export function visitWho(db: DB, v: Visit): { client: string; tech: string } {
  const { customer } = visitContext(db, v);
  // the first person who can still come (S22: a deleted account is not «the tech» of a late item)
  const first = db.members.find((m) => m.id === liveAssignees(v, db.members)[0]);
  const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
  return { client: customer?.name ?? lead?.name ?? "", tech: first?.name ?? "" };
}

/**
 * The next step of a visit as the store writes it: «on the way» carries the phone time (kept on a repeat), so the
 * offline queue does not move it to the sync time (П3c, решение 3; server: visits.en_route_at).
 */
export function stepChange(v: Visit | undefined, nowIso: string): { step: VisitStep; at?: string } {
  const step: VisitStep = v ? nextStep(v) : "en_route";
  return step === "en_route" ? { step, at: v?.enRouteAt ?? nowIso } : { step };
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

/**
 * What is not a company setting. The company's own numbers (hours, lengths, step, window, «late») live in
 * companies.schedule_settings / business_hours — features/scheduleSettings.ts (wave П4a); dayStartMin / dayEndMin /
 * stepMin here are the defaults of a day when no hours are given.
 */
export const SCHEDULE_DEFAULTS = {
  dayStartMin: 8 * 60, dayEndMin: 18 * 60, stepMin: SCHEDULE_SETTINGS_DEFAULT.stepMin,
  /** the form: days shown as chips (twice that with «Ещё неделя»), the range of «Другое время», length step and max */
  formDays: 7, earliestMin: 6 * 60, latestMin: 20 * 60, durationStepMin: 15, maxDurationMin: 12 * 60,
} as const;
/** the working day the form uses: start and end minute (a day off has none) and the slot step */
export type Hours = { dayStartMin: number; dayEndMin: number; stepMin: number; off?: boolean };
/** the hours of this day for the form: the company's hours of the weekday and its step; a day off is «off» (slots: none) */
export function formHours(hours: BusinessHours, stepMin: number, day: DayKey): Hours {
  const h = hoursOn(hours, day);
  return h ? { dayStartMin: h[0], dayEndMin: h[1], stepMin } : { dayStartMin: SCHEDULE_DEFAULTS.dayStartMin, dayEndMin: SCHEDULE_DEFAULTS.dayEndMin, stepMin, off: true };
}

/** a day of the company + minutes after its midnight, on the company's wall clock (10:00 in Los Angeles is 10:00 there
 *  whatever the phone's zone; across a clock change — zone.ts wallToInstant) */
export function atMinute(day: DayKey, minute: number, tz: string = getZone()): string {
  return wallToInstant(day, minute, tz);
}
/** a visit moved (S9a, «Перенести»): the new start and length; «Весь день» only when asked — a move to a time drops it */
export function rescheduled<V extends Pick<Visit, "start" | "durationMin" | "allDay">>(v: V, start: string, durationMin: number, allDay?: boolean): V {
  return { ...v, start, durationMin, allDay: allDay ? true : undefined };
}

/** the end of a visit (start + length) */
export const visitEnd = (v: Pick<Visit, "start" | "durationMin">): string => new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();

/**
 * How a visit's time reads everywhere (17-job §11.1): «Весь день» for an all-day visit — never «12:00 AM – 12:00 AM»;
 * otherwise «9:00 AM – 11:00 AM» (range) or «9:00 AM» (start only). `time` is the screen's formatter.
 */
export function visitWhen(v: Pick<Visit, "start" | "durationMin" | "allDay">, time: (iso: string) => string, allDayLabel: string, range = true): string {
  if (v.allDay) return allDayLabel;
  return range ? `${time(v.start)} – ${time(visitEnd(v))}` : time(v.start);
}

/** «Весь день» (17-job §11.1): the company's day from its midnight to the next one — 23 or 25 hours on a DST day, so the
 *  server keeps the flag (t03_visit_all_day) */
export function wholeDay(day: string): { start: string; durationMin: number } {
  const start = atMinute(day, 0);
  return { start, durationMin: Math.round((Date.parse(atMinute(keyOfNumber(dayNumber(day) + 1), 0)) - Date.parse(start)) / 60_000) };
}

/** open visits of a person on that day of the company, by start (the row "2 visits · 10:00–12:00, 14:00–15:00") */
export function dayVisits(db: Pick<DB, "visits">, techId: ID, day: DayKey, exceptId?: ID, tz: string = getZone()): Visit[] {
  return db.visits
    .filter((v) => v.id !== exceptId && isAssigned(v, techId) && isOpenVisit(v) && dayKeyIn(v.start, tz) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** start minutes the person is free for `durationMin`, inside working hours, on the step; never in the past today */
export function freeSlots(
  db: Pick<DB, "visits">, techId: ID | ID[] | null, day: DayKey, durationMin: number,
  opts: { exceptId?: ID; now?: number; hours?: Hours; tz?: string } = {},
): number[] {
  const h: Hours = opts.hours ?? SCHEDULE_DEFAULTS;
  const now = opts.now ?? Date.now();
  const out: number[] = [];
  // a day off: no slots, «Другое время» still works (with the warning «Вне рабочих часов»)
  if (h.off) return out;
  for (let m = h.dayStartMin; m + durationMin <= h.dayEndMin; m += h.stepMin) {
    const start = atMinute(day, m, opts.tz);
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
  db: Pick<DB, "visits">, f: { techId: ID | ID[] | null; start: string; durationMin: number; exceptId?: ID; allDay?: boolean },
  opts: { now?: number; hours?: Hours; tz?: string } = {},
): FormWarning[] {
  const h: Hours = opts.hours ?? SCHEDULE_DEFAULTS;
  const out: FormWarning[] = [];
  const busy = overlaps(db, f.techId, f.start, f.durationMin, f.exceptId, !!f.allDay);
  if (busy.length) out.push({ key: "busy", visits: busy });
  if (f.allDay) {
    // «Весь день»: no hours to be out of; «past» only when the whole day is over (today is fine)
    const end = new Date(new Date(f.start).getTime() + f.durationMin * 60_000).toISOString();
    if ((opts.now ?? Date.now()) >= Date.parse(end)) out.push({ key: "past" });
    return out;
  }
  // minutes on the company's clock (the slot the form shows), not the phone's
  const s = minuteIn(f.start, opts.tz);
  if (h.off || s < h.dayStartMin || s + f.durationMin > h.dayEndMin) out.push({ key: "outOfHours" });
  if (!startAllowed(f.start, opts.now, opts.tz)) out.push({ key: "past" });
  return out;
}

/* ---------- the Plan tab (docs/specs/03 §7.2, wave П3b) ---------- */

/** «Ждут даты»: jobs without a date — status "unscheduled" and no open visit; the oldest first (signed longest ago). */
export function waitingJobs(db: Pick<DB, "jobs" | "visits" | "estimates">): { job: DB["jobs"][number]; since?: string }[] {
  return db.jobs
    .filter((j) => j.status === "unscheduled" && !db.visits.some((v) => v.jobId === j.id && isOpenVisit(v)))
    .map((job) => {
      const e = job.estimateId ? db.estimates.find((x) => x.id === job.estimateId) : undefined;
      return { job, since: e?.approval?.at ?? e?.approvedAt };
    })
    .sort((a, b) => (a.since ?? "9999").localeCompare(b.since ?? "9999") || a.job.title.localeCompare(b.job.title));
}

/** whole days since an ISO time (0 = today), for «подписал N дн назад» */
export function daysSince(iso: string | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86_400_000));
}

/**
 * «Не назначено» (docs/specs/03 П3c, decision 7): open visits of the company's today (0) and tomorrow (1) with nobody on
 * them. One rule for «Требует внимания» (attention.ts) and the block on top of the Plan (wave 5). Today first, by time.
 */
export function unassignedSoon(db: Pick<DB, "visits" | "members">, now: number = Date.now(), tz: string = getZone()): { v: Visit; dd: 0 | 1 }[] {
  const out: { v: Visit; dd: 0 | 1 }[] = [];
  for (const v of db.visits) {
    // only a deleted account on it (S22) is nobody too
    if (!isOpenVisit(v) || liveAssignees(v, db.members).length) continue;
    const dd = dayDiffIn(v.start, now, tz);
    if (dd === 0 || dd === 1) out.push({ v, dd });
  }
  return out.sort((a, b) => a.dd - b.dd || a.v.start.localeCompare(b.v.start));
}

/** «Чей план»: "all", "me" or a person id; a tech always sees only his own */
export type PlanWho = "all" | "me" | ID;
export function planFilter(v: Visit, who: PlanWho, me: ID): boolean {
  if (who === "all") return true;
  return isAssigned(v, who === "me" ? me : who);
}

/** a working day of the company: its hours of that weekday (default Monday–Saturday, §6.1; «Компания → Расписание», П4a) */
export const isWorkday = (d: DayKey, hours: BusinessHours = BUSINESS_HOURS_DEFAULT) => hoursOn(hours, d) !== null;

/**
 * Quick dates of the move form (13 §3.6, 17-job §7.4): «Позже сегодня (18:00) · Завтра утром (9:00) · В понедельник
 * (9:00)», on the company's calendar and clock. «Later today» only before 18:00; «Monday» is the next one (on a Monday —
 * a week later). Not called «Отложить»: that word is the lead's snooze.
 */
export type QuickStartKey = "laterToday" | "tomorrow" | "monday";
export function quickStarts(today: DayKey, nowMinute: number): { key: QuickStartKey; day: DayKey; minute: number }[] {
  const out: { key: QuickStartKey; day: DayKey; minute: number }[] = [];
  if (nowMinute < 18 * 60) out.push({ key: "laterToday", day: today, minute: 18 * 60 });
  const n = dayNumber(today);
  out.push({ key: "tomorrow", day: keyOfNumber(n + 1), minute: 9 * 60 });
  const toMonday = ((8 - weekdayOf(today)) % 7) || 7;
  out.push({ key: "monday", day: keyOfNumber(n + toMonday), minute: 9 * 60 });
  return out;
}
