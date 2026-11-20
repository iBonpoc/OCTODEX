import { describe, expect, it } from "vitest";
import { canStartExpense, expenseJobOptions } from "../src/features/expenseJobs";

const db = {
  jobs: [{ id: "j1", number: "JOB-0001", title: "Gutters", propertyId: "p1", status: "scheduled", amountCents: 0 }],
  properties: [],
  customers: [],
} as unknown as Parameters<typeof expenseJobOptions>[0];

describe("a new expense: what it may be tied to (Р-8a)", () => {
  it("the office, sales, a tech: today's jobs and «Общий расход»", () => {
    const o = expenseJobOptions(db, [{ jobId: "j1" }, { jobId: null }], false);
    expect(o.allowNone).toBe(true);
    expect(o.jobs.map((j) => j.key)).toEqual(["j1"]);
    expect(canStartExpense(expenseJobOptions(db, [], false))).toBe(true);
  });
  it("a subcontractor: only a real job of his today — no «none», no inspection's in-memory job", () => {
    const o = expenseJobOptions(db, [{ jobId: "insp-v9" }, { jobId: "j1" }, { jobId: null }], true);
    expect(o.allowNone).toBe(false);
    expect(o.jobs.map((j) => j.key)).toEqual(["j1"]);
    expect(canStartExpense(o)).toBe(true);
  });
  it("a subcontractor without a job today (or only an inspection): no expense to start", () => {
    expect(canStartExpense(expenseJobOptions(db, [], true))).toBe(false);
    expect(canStartExpense(expenseJobOptions(db, [{ jobId: "insp-v9" }, { jobId: null }], true))).toBe(false);
  });
});
