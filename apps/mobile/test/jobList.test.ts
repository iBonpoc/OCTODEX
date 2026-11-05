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
  const members = [{ id: "m1", name: "Carlos" }] as DB["members"];
  it("the assigned tech", () => expect(visitPeople({ members }, v("a", "x", "scheduled", "m1")).map((m) => m.name)).toEqual(["Carlos"]));
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
