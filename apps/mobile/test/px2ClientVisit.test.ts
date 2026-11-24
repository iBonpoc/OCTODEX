/** visual v2 макеты 3–4 «Клиент» / «Выезд» (#2350): progress in words and the job's way «Смета ✓ · задаток ✓ · работа». */
import { describe, expect, it } from "vitest";
import type { Estimate, Invoice, Job } from "../src/data/types";
import { jobChain, workProgress } from "../src/features/client/nextStep";

const job = (o: Partial<Job> = {}): Job => ({ id: "j1", propertyId: "p", title: "j", status: "scheduled", amountCents: 342_000, estimateId: "e1", ...o }) as Job;
const est = (o: Partial<Estimate> = {}): Estimate => ({ id: "e1", status: "approved", customerId: "c", propertyId: "p", title: "Bathroom remodel", totalCents: 342_000, ...o }) as Estimate;
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: "i", customerId: "c", jobId: "j1", kind: "deposit", totalCents: 34_200, paidCents: 34_200, dueDate: "2026-11-12", ...o }) as Invoice;

describe("workProgress: «3 из 5 · 60 %» of the job's visits", () => {
  it("counts the ticked items of all the job's checklists", () => {
    const v = (done: boolean[]) => ({ step: "working", checklist: done.map((d) => ({ done: d })) });
    expect(workProgress([v([true, true, false]), v([true, false])])).toEqual({ done: 3, total: 5, pct: 60 });
  });
  it("no checklist — the visits closed of all", () => {
    expect(workProgress([{ step: "paid", checklist: [] }, { step: "scheduled", checklist: [] }])).toEqual({ done: 1, total: 2, pct: 50 });
  });
  it("nothing to count — null (no «0 из 0»)", () => expect(workProgress([])).toBeNull());
});

describe("jobChain: «Смета ✓ · задаток ✓ · работа»", () => {
  it("approved estimate, paid deposit, work not done", () => {
    expect(jobChain(job(), est(), [inv()])).toEqual([
      { key: "estimate", done: true },
      { key: "deposit", done: true },
      { key: "work", done: false },
    ]);
  });
  it("an unpaid deposit is not ✓; a void one does not count", () => {
    expect(jobChain(job(), est(), [inv({ paidCents: 0 })])[1]).toEqual({ key: "deposit", done: false });
    expect(jobChain(job(), est(), [inv({ status: "void" } as Partial<Invoice>)]).map((x) => x.key)).toEqual(["estimate", "work"]);
  });
  it("the estimate asks a deposit not billed yet — the link is there, not passed", () => {
    expect(jobChain(job(), est({ depositCents: 34_200 }), [])[1]).toEqual({ key: "deposit", done: false });
  });
  it("a job without an estimate: the work alone", () => {
    expect(jobChain(job({ estimateId: undefined, status: "done" }), undefined, [])).toEqual([{ key: "work", done: true }]);
  });
});
