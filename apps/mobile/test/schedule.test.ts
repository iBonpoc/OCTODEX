/** Visit and Plan rules (docs/specs/03 §4, §8; story map S4, S4a, S9a). Same transitions as db:T32. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { normalizeDB } from "../src/data/normalize";
import { visitPropertyId } from "../src/data/selectors";
import type { DB, Job, Lead, Visit } from "../src/data/types";
import { canCancel, canPlan, canReschedule, hasPlannedInspection, isInspectionOf, isOpenVisit, jobRollsBack, leadRollsBack, overlaps, startAllowed, visitLate } from "../src/features/schedule";

const NOW = new Date("2026-11-05T18:00:00.000Z").getTime();
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
    expect(startAllowed(at(1), NOW)).toBe(true);
    expect(startAllowed(at(-1), NOW)).toBe(true);
    expect(startAllowed(at(-30), NOW)).toBe(false);
    expect(startAllowed("not a date", NOW)).toBe(false);
  });
  it("late: start passed and nobody on site; computed, not stored", () => {
    expect(visitLate(V({ start: at(-1) }), NOW)).toBe(true);
    expect(visitLate(V({ start: at(-1), step: "on_site" }), NOW)).toBe(false);
    expect(visitLate(V({ start: at(1) }), NOW)).toBe(false);
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
