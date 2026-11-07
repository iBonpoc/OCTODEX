/** «Работы» on list cards (spec 06, PR8): which visit a job card shows, who is on it, the estimate number. */
import { describe, expect, it } from "vitest";
import { jobEstimateNumber, nextVisitOf, visitPeople } from "@/features/jobList";
import type { DB, Job, Visit } from "@/data/types";

const v = (id: string, start: string, step: Visit["step"], techId: string | null = null) =>
  ({ id, jobId: "j1", start, step, techId }) as unknown as Visit;

describe("nextVisitOf", () => {
  it("the earliest visit not finished yet, whatever the order in the store", () => {
    const db = { visits: [v("b", "2026-11-12T09:00", "scheduled"), v("a", "2026-11-03T09:00", "paid"), v("c", "2026-11-09T09:00", "scheduled")] };
    expect(nextVisitOf(db, "j1")?.id).toBe("c");
  });
  it("all visits finished → the latest one", () => {
    const db = { visits: [v("a", "2026-11-03T09:00", "paid"), v("b", "2026-11-05T09:00", "done")] };
    expect(nextVisitOf(db, "j1")?.id).toBe("b");
  });
  it("no visits → none (the card says «ждёт даты»)", () => expect(nextVisitOf({ visits: [] }, "j1")).toBeUndefined());
});

describe("visitPeople", () => {
  const members = [{ id: "m1", name: "Carlos" }, { id: "m2", name: "Dana" }] as DB["members"];
  it("an old visit with only techId: that tech", () => expect(visitPeople({ members }, v("a", "x", "scheduled", "m1")).map((m) => m.name)).toEqual(["Carlos"]));
  it("everyone in assigneeIds, in their order (after #105)", () => {
    const visit = { ...v("a", "x", "scheduled", "m1"), assigneeIds: ["m2", "m1"] } as Visit;
    expect(visitPeople({ members }, visit).map((m) => m.name)).toEqual(["Dana", "Carlos"]);
  });
  it("nobody assigned or no visit → empty", () => {
    expect(visitPeople({ members }, v("a", "x", "scheduled"))).toEqual([]);
    expect(visitPeople({ members }, undefined)).toEqual([]);
  });
});

describe("jobEstimateNumber", () => {
  const estimates = [{ id: "e1", number: "EST-0145" }] as DB["estimates"];
  it("from the job's estimate", () => expect(jobEstimateNumber({ estimates }, { estimateId: "e1" } as Job)).toBe("EST-0145"));
  it("a job without an estimate → none", () => expect(jobEstimateNumber({ estimates }, {} as Job)).toBeUndefined());
});

import { jobPeople, matchJob } from "@/features/jobList";

describe("jobPeople — «Мастер» in the filter of «Работы» (spec 31 §13)", () => {
  const members = [{ id: "m1", name: "Carlos" }, { id: "m2", name: "Dana" }] as DB["members"];
  const job = { id: "j1" } as Job;
  it("the people of the nearest open visit, not of a finished one", () => {
    const visits = [{ ...v("a", "2026-11-03T09:00", "paid"), assigneeIds: ["m1"] }, { ...v("b", "2026-11-09T09:00", "scheduled"), assigneeIds: ["m2"] }] as Visit[];
    expect(jobPeople({ visits, members }, job).map((m) => m.name)).toEqual(["Dana"]);
  });
  it("all visits finished → the people of the last one", () => {
    const visits = [{ ...v("a", "2026-11-03T09:00", "paid"), assigneeIds: ["m1"] }] as Visit[];
    expect(jobPeople({ visits, members }, job).map((m) => m.name)).toEqual(["Carlos"]);
  });
  it("no visit, or nobody on it → nobody («Не назначен»)", () => {
    expect(jobPeople({ visits: [], members }, job)).toEqual([]);
    expect(jobPeople({ visits: [v("a", "2026-11-03T09:00", "scheduled")], members }, job)).toEqual([]);
  });
});

describe("matchJob — the search of «Работы»", () => {
  const db = {
    customers: [{ id: "c1", name: "Sarah Mitchell" }],
    properties: [{ id: "p1", customerId: "c1", address: "1420 Oak Grove Ave", city: "Pasadena" }],
    estimates: [{ id: "e1", number: "EST-0145" }],
  } as unknown as DB;
  const j = { id: "j1", propertyId: "p1", title: "Bathroom remodel", number: "JOB-0001", estimateId: "e1" } as Job;
  it("by client, address, city, title, JOB and EST numbers, any case", () => {
    for (const q of ["mitchell", "oak grove", "PASADENA", "bathroom", "job-0001", "est-0145"]) expect(matchJob(db, j, q)).toBe(true);
  });
  it("empty search — everything; a miss — nothing", () => {
    expect(matchJob(db, j, "  ")).toBe(true);
    expect(matchJob(db, j, "zzz")).toBe(false);
  });
});
