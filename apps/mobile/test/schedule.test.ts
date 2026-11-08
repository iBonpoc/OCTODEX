/** Visit and Plan rules (docs/specs/03 §4, §8; story map S4, S4a, S9a). Same transitions as db:T32. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { normalizeDB } from "../src/data/normalize";
import { visitPropertyId } from "../src/data/selectors";
import type { DB, Job, Lead, Visit } from "../src/data/types";
import { canCancel, canPlan, canReschedule, hasPlannedInspection, isInspectionOf, isOpenVisit, jobRollsBack, leadRollsBack, overlaps, SCHEDULE_DEFAULTS, lateKind, startAllowed, visitLate } from "../src/features/schedule";

import { SCHEDULE_SETTINGS_DEFAULT } from "../src/features/scheduleSettings";

const LA = "America/Los_Angeles";
const NOW = new Date("2026-11-05T18:00:00.000Z").getTime(); // 10:00 AM in LA
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const base: Visit = { id: "v", techId: "m1", start: at(2), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 };
const V = (p: Partial<Visit>): Visit => ({ ...base, ...p });
const lead = (p: Partial<Lead> = {}) => ({ id: "L", status: "booked", propertyId: "p1", ...p }) as Lead;
const job = (p: Partial<Job> = {}): Job => ({ id: "J", propertyId: "p1", title: "Install", status: "scheduled", amountCents: 0, ...p });
const db = (p: Partial<DB>) => ({ visits: [], jobs: [], leads: [], ...p }) as unknown as DB;

describe("visit: what can happen to it", () => {
  it("move or cancel only before the tech is on site; finished ones are closed", () => {
    expect(canCancel(V({ step: "scheduled" }))).toBe(true);
    expect(canReschedule(V({ step: "en_route" }))).toBe(true);
    for (const step of ["on_site", "working", "signed", "paid", "done"] as const) expect(canCancel(V({ step }))).toBe(false);
    expect(canCancel(V({ closed: true }))).toBe(false);
    expect(isOpenVisit(V({ step: "done" }))).toBe(false);
  });
  it("the office plans; a tech does not", () => {
    expect(canPlan(["director"])).toBe(true);
    expect(canPlan(["dispatcher"])).toBe(true);
    expect(canPlan(["tech"])).toBe(false);
  });
  it("a new visit is never in the past, except earlier today", () => {
    expect(startAllowed(at(1), NOW, LA)).toBe(true);
    expect(startAllowed(at(-1), NOW, LA)).toBe(true);
    expect(startAllowed(at(-30), NOW, LA)).toBe(false);
    expect(startAllowed("not a date", NOW, LA)).toBe(false);
    // «earlier today» is the company's today: 1:00 AM in LA is today there (09:00Z), whatever the phone says
    expect(startAllowed("2026-11-05T09:00:00.000Z", NOW, LA)).toBe(true);
    // 11:30 PM yesterday in LA (07:30Z today) is already the past, though it is «today» in UTC
    expect(startAllowed("2026-11-05T07:30:00.000Z", NOW, LA)).toBe(false);
  });
  it("late (П3c): start + 15 min passed and nobody on site; «on the way» does not clear it", () => {
    const min = (m: number) => new Date(NOW - m * 60_000).toISOString();
    const sec = (s: number) => new Date(NOW - s * 1000).toISOString();
    expect(SCHEDULE_SETTINGS_DEFAULT.lateAfterMin).toBe(15);
    expect(lateKind(V({ start: sec(14 * 60 + 59) }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(15) }), [], NOW)).toBe("not_left");
    expect(lateKind(V({ start: min(40), step: "en_route" }), [], NOW)).toBe("en_route");
    expect(visitLate(V({ start: min(40), step: "en_route" }), [], NOW)).toBe(true);
    for (const step of ["on_site", "working", "signed", "paid", "done"] as const) expect(lateKind(V({ start: min(40), step }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(40), checklist: [{ id: "c", label: "x", done: true }] }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(40), checklist: [{ id: "c", label: "x", done: false }] }), [], NOW)).toBe("not_left");
    // step 14 (docs/specs/08 §11.5 №28): a skip or a photo on an item says the tech is there too
    expect(lateKind(V({ start: min(40), checklist: [{ id: "c", label: "x", done: false, na: { at: "2026-11-08T10:00:00Z" } }] }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(40), checklist: [{ id: "c", label: "x", done: false, kind: "photo", photoIds: ["p1"] }] }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(40), checklist: [{ id: "c", label: "x", done: false, photoIds: [] }] }), [], NOW)).toBe("not_left");
    expect(lateKind(V({ start: min(40), techId: null, assigneeIds: [] }), [], NOW)).toBeNull(); // nobody on it: «Не назначено»
    expect(lateKind(V({ start: min(40), techId: null, assigneeIds: ["m2"] }), [], NOW)).toBe("not_left");
    expect(lateKind(V({ start: min(40), closed: true }), [], NOW)).toBeNull();
    expect(lateKind(V({ start: min(40), kind: "inspection" }), [], NOW)).toBe("not_left");
    expect(lateKind(V({ start: min(40) }), [], NOW, 60)).toBeNull(); // the threshold is a parameter (setting — П4)
    expect(visitLate(V({ start: at(1) }), [], NOW)).toBe(false);
  });
  it("overlaps by time for the same person, not by count per day", () => {
    const d = db({ visits: [V({ id: "a", start: at(2), durationMin: 60 }), V({ id: "b", start: at(5), durationMin: 60 }), V({ id: "c", techId: "m2", start: at(2) })] });
    expect(overlaps(d, "m1", at(2.5), 30).map((v) => v.id)).toEqual(["a"]);
    expect(overlaps(d, "m1", at(4), 120).map((v) => v.id)).toEqual(["b"]);
    expect(overlaps(d, "m1", at(3), 60)).toEqual([]); // back to back is fine
    expect(overlaps(d, "m1", at(2), 60, "a")).toEqual([]); // moving the visit itself
    expect(overlaps(d, null, at(2), 60)).toEqual([]);
  });
});

describe("inspection: a visit of the lead at the property, no job (S4)", () => {
  it("found by its lead; old data by an 'estimate' job at the lead's property", () => {
    const l = lead();
    expect(isInspectionOf(db({}), V({ leadId: "L" }), l)).toBe(true);
    expect(isInspectionOf(db({}), V({ leadId: "X" }), l)).toBe(false);
    const legacy = db({ jobs: [{ ...job({ id: "old" }), status: "estimate" as never }] });
    expect(isInspectionOf(legacy, V({ jobId: "old" }), l)).toBe(true);
    expect(isInspectionOf(db({ jobs: [job()] }), V({ jobId: "J" }), l)).toBe(false);
  });
  it("one planned inspection at a time", () => {
    expect(hasPlannedInspection(db({ visits: [V({ leadId: "L", start: at(24) })] }), lead(), NOW)).toBe(true);
    expect(hasPlannedInspection(db({ visits: [V({ leadId: "L", start: at(-24) })] }), lead(), NOW)).toBe(false);
  });
  it("its property is its own; a job visit's is the job's", () => {
    expect(visitPropertyId(db({}), V({ propertyId: "p9" }))).toBe("p9");
    expect(visitPropertyId(db({ jobs: [job()] }), V({ jobId: "J" }))).toBe("p1");
  });
});

describe("cancel rolls back only when nothing open is left (S4a, S9a)", () => {
  it("S4a: the last open inspection → lead booked → replied; a second one keeps it booked", () => {
    const one = db({ leads: [lead()], visits: [V({ id: "i1", leadId: "L" })] });
    expect(leadRollsBack(one, "i1")).toBe("L");
    const two = db({ leads: [lead()], visits: [V({ id: "i1", leadId: "L" }), V({ id: "i2", leadId: "L", start: at(48) })] });
    expect(leadRollsBack(two, "i1")).toBeNull();
    expect(leadRollsBack(db({ leads: [lead({ status: "estimate_sent" })], visits: [V({ id: "i1", leadId: "L" })] }), "i1")).toBeNull();
  });
  it("S9a: the last open visit of a scheduled job → job unscheduled; a second one keeps it", () => {
    const one = db({ jobs: [job()], visits: [V({ id: "w1", jobId: "J" })] });
    expect(jobRollsBack(one, "w1")).toBe("J");
    const two = db({ jobs: [job()], visits: [V({ id: "w1", jobId: "J" }), V({ id: "w2", jobId: "J" })] });
    expect(jobRollsBack(two, "w1")).toBeNull();
    expect(jobRollsBack(db({ jobs: [job({ status: "in_progress" })], visits: [V({ id: "w1", jobId: "J" })] }), "w1")).toBeNull();
    expect(jobRollsBack(db({ visits: [V({ id: "i", leadId: "L" })] }), "i")).toBeNull();
  });
});

describe("old saved data", () => {
  it("an inspection kept as an 'estimate' job becomes a visit of the lead without a job", () => {
    const d = structuredClone(makeSeed()) as unknown as DB;
    d.jobs = [...d.jobs, { id: "jold", propertyId: "p2", title: "Estimate visit", status: "estimate" as never, amountCents: 0 }];
    d.visits = [...d.visits, { ...base, id: "vold", jobId: "jold" }];
    d.leads = d.leads.map((l, i) => (i === 0 ? { ...l, propertyId: "p2" } : l));
    const n = normalizeDB(d, "demo");
    const v = n.visits.find((x) => x.id === "vold")!;
    expect(v.jobId).toBeUndefined();
    expect(v.propertyId).toBe("p2");
    expect(v.kind).toBe("inspection");
    expect(v.leadId).toBe(d.leads[0]!.id);
    expect(n.jobs.some((j) => j.id === "jold")).toBe(false);
  });
  it("the demo has its inspection as a visit without a job", () => {
    const v = makeSeed().visits.find((x) => x.id === "v6")!;
    expect(v.jobId).toBeUndefined();
    expect(v.kind).toBe("inspection");
    expect(v.propertyId).toBe("p7");
  });
});

describe("S10: an inspection ends with done", () => {
  it("inspection: on site → done; a job visit: on site → working", async () => {
    const { nextStep } = await import("../src/features/schedule");
    expect(nextStep({ step: "scheduled", kind: "inspection" })).toBe("en_route");
    expect(nextStep({ step: "on_site", kind: "inspection" })).toBe("done");
    expect(nextStep({ step: "done", kind: "inspection" })).toBe("done");
    expect(nextStep({ step: "on_site", kind: "install" })).toBe("working");
    expect(nextStep({ step: "on_site" })).toBe("working");
    expect(isOpenVisit(V({ step: "done", kind: "inspection" }))).toBe(false);
  });
});

describe("visit form: slots, load, warnings (§7.1)", () => {
  it("free slots skip a busy person's visits, the past and the end of the day", async () => {
    const { freeSlots, atMinute, SCHEDULE_DEFAULTS } = await import("../src/features/schedule");
    const day = "2026-11-06"; // tomorrow of the company (LA)
    const busy = V({ id: "b", techId: "m1", start: atMinute(day, 10 * 60, LA), durationMin: 60 });
    const d = db({ visits: [busy] });
    const now = new Date("2026-11-05T12:00:00-08:00").getTime();
    const slots = freeSlots(d, "m1", day, 45, { now, tz: LA });
    expect(slots[0]).toBe(SCHEDULE_DEFAULTS.dayStartMin);
    expect(slots).not.toContain(10 * 60); // busy
    expect(slots).not.toContain(9 * 60 + 30); // would run into 10:00
    expect(slots).toContain(11 * 60);
    expect(slots.at(-1)! + 45).toBeLessThanOrEqual(SCHEDULE_DEFAULTS.dayEndMin);
    expect(freeSlots(d, "m1", day, 45, { exceptId: "b", now, tz: LA })).toContain(10 * 60); // moving that very visit
    expect(freeSlots(d, null, day, 45, { now, tz: LA })).toContain(10 * 60); // nobody yet: every slot
    // never in the past: noon in LA, slots of today start at 12:00 of the company's clock
    expect(freeSlots(db({}), "m1", "2026-11-05", 45, { now, tz: LA })).toEqual(expect.arrayContaining([12 * 60]));
    expect(freeSlots(db({}), "m1", "2026-11-05", 45, { now, tz: LA }).every((m) => m >= 12 * 60)).toBe(true);
  });
  it("a person's day load and the form warnings", async () => {
    const { dayVisits, formWarnings, atMinute } = await import("../src/features/schedule");
    const day = "2026-11-06";
    const d = db({ visits: [V({ id: "a", techId: "m1", start: atMinute(day, 14 * 60, LA) }), V({ id: "b", techId: "m1", start: atMinute(day, 10 * 60, LA) }), V({ id: "c", techId: "m2", start: atMinute(day, 10 * 60, LA) })] });
    expect(dayVisits(d, "m1", day, undefined, LA).map((v) => v.id)).toEqual(["b", "a"]);
    const now = new Date("2026-11-05T12:00:00-08:00").getTime();
    const opts = { now, tz: LA };
    expect(formWarnings(d, { techId: "m1", start: atMinute(day, 10 * 60 + 30, LA), durationMin: 45 }, opts).map((w) => w.key)).toEqual(["busy"]);
    expect(formWarnings(d, { techId: "m1", start: atMinute(day, 19 * 60, LA), durationMin: 45 }, opts).map((w) => w.key)).toEqual(["outOfHours"]);
    expect(formWarnings(d, { techId: null, start: "2026-11-01T15:00:00.000Z", durationMin: 45 }, opts).map((w) => w.key)).toContain("past");
    expect(formWarnings(d, { techId: "m1", start: atMinute(day, 8 * 60, LA), durationMin: 45 }, opts)).toEqual([]);
  });
});

describe("several people on a visit (wave П3a, S9 / S9b; db:T35)", () => {
  it("old saved data has only techId: it is the list", async () => {
    const { assigneesOf, isAssigned } = await import("../src/features/schedule");
    expect(assigneesOf(V({ techId: "m1" }))).toEqual(["m1"]);
    expect(assigneesOf(V({ techId: null }))).toEqual([]);
    expect(assigneesOf(V({ techId: "m1", assigneeIds: ["m1", "m2"] }))).toEqual(["m1", "m2"]);
    expect(isAssigned(V({ techId: "m1", assigneeIds: ["m1", "m2"] }), "m2")).toBe(true);
    expect(isAssigned(V({ techId: "m1" }), null)).toBe(false);
  });
  it("withAssignees: techId is the first, no doubles, [] = nobody", async () => {
    const { withAssignees } = await import("../src/features/schedule");
    expect(withAssignees(V({}), ["m2", "m1", "m2"])).toMatchObject({ techId: "m2", assigneeIds: ["m2", "m1"] });
    expect(withAssignees(V({}), [])).toMatchObject({ techId: null, assigneeIds: [] });
  });
  it("the second person's visits count for overlaps and free slots", async () => {
    const { freeSlots, atMinute } = await import("../src/features/schedule");
    const day = "2026-11-06";
    // m2 is the second person on a 10:00 visit
    const d = db({ visits: [V({ id: "b", techId: "m1", assigneeIds: ["m1", "m2"], start: atMinute(day, 10 * 60, LA), durationMin: 60 })] });
    expect(overlaps(d, "m2", atMinute(day, 10 * 60 + 30, LA), 30)).toHaveLength(1);
    expect(overlaps(d, ["m3", "m2"], atMinute(day, 10 * 60, LA), 30)).toHaveLength(1);
    expect(overlaps(d, ["m3"], atMinute(day, 10 * 60, LA), 30)).toHaveLength(0);
    // a slot is free only when everyone picked is free
    expect(freeSlots(d, ["m3", "m2"], day, 30, { now: NOW, tz: LA })).not.toContain(10 * 60);
    expect(freeSlots(d, ["m3"], day, 30, { now: NOW, tz: LA })).toContain(10 * 60);
  });
});

describe("the Plan (wave П3b, S8b / S9a on the screen)", () => {
  it("«Ждут даты»: unscheduled jobs without an open visit, signed longest ago first", async () => {
    const { waitingJobs } = await import("../src/features/schedule");
    const d = {
      jobs: [
        job({ id: "a", status: "unscheduled", estimateId: "e1", title: "A" }),
        job({ id: "b", status: "unscheduled", estimateId: "e2", title: "B" }),
        job({ id: "c", status: "unscheduled", title: "C" }), // no estimate: last
        job({ id: "d", status: "unscheduled", title: "D" }), // has an open visit: not waiting
        job({ id: "e", status: "scheduled", title: "E" }),
      ],
      visits: [V({ id: "vd", jobId: "d" }), V({ id: "vc", jobId: "c", step: "paid" })],
      estimates: [
        { id: "e1", approval: { at: "2026-11-03T10:00:00.000Z" } },
        { id: "e2", approvedAt: "2026-11-01T10:00:00.000Z" },
      ],
    } as unknown as DB;
    expect(waitingJobs(d).map((x) => x.job.id)).toEqual(["b", "a", "c"]);
  });
  it("days since a signature; the person filter", async () => {
    const { daysSince, planFilter, isWorkday } = await import("../src/features/schedule");
    expect(daysSince(new Date(NOW - 2 * 86_400_000 - 1000).toISOString(), NOW)).toBe(2);
    expect(daysSince(undefined, NOW)).toBeNull();
    const v = V({ techId: "m1", assigneeIds: ["m1", "m2"] });
    expect(planFilter(v, "all", "m9")).toBe(true);
    expect(planFilter(v, "me", "m2")).toBe(true);
    expect(planFilter(v, "m3", "m2")).toBe(false);
    expect(isWorkday("2026-11-07")).toBe(true); // a Saturday: Mon–Sat by default (§6.1, П4a)
    expect(isWorkday("2026-11-08")).toBe(false); // a Sunday
    expect(isWorkday("2026-11-09")).toBe(true);
  });
});
