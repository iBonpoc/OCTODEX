/** unit:expenseForm — #2008: which jobs an expense may go on, the job it starts on, where it was bought, its day. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { expenseDay, expenseJobsFor, startJob, vendorChoices, USUAL_VENDORS } from "../src/features/expenseForm";

const db = (): DB => makeSeed() as DB;

describe("unit:expenseForm — #2008", () => {
  it("С4: the office picks any job of the company; a technician — the jobs he is on by any visit (not only today's)", () => {
    const d = db();
    const all = expenseJobsFor(d, "director").map((c) => c.key);
    expect(all.sort()).toEqual(d.jobs.map((j) => j.id).sort());
    expect(expenseJobsFor(d, "sales").length).toBe(d.jobs.length);
    const me = d.me;
    const mine = new Set(d.visits.filter((v) => (v.assigneeIds ?? [v.techId]).includes(me) && v.jobId).map((v) => v.jobId));
    expect(expenseJobsFor(d, "tech").map((c) => c.key).sort()).toEqual([...mine].sort());
  });
  it("a job is named by number and title, the client under it", () => {
    const d = db();
    const j = d.jobs.find((x) => x.number)!;
    const c = expenseJobsFor(d, "director").find((x) => x.key === j.id)!;
    expect(c.label).toBe([j.number, j.title].filter(Boolean).join(" · "));
  });
  it("С1: opened from job A, the expense starts on job A — not on today's visit's job", () => {
    const choices = [{ key: "A", label: "A" }, { key: "B", label: "B" }];
    expect(startJob(choices, "A", ["B"])).toBe("A");
    // a job of the link the person may not use: none — never today's other job
    expect(startJob(choices, "Z", ["B"])).toBe(null);
    // from home: the one job of today's visits; two different ones — none, the person picks
    expect(startJob(choices, undefined, ["B", "B"])).toBe("B");
    expect(startJob(choices, undefined, ["A", "B"])).toBe(null);
    expect(startJob(choices, undefined, [])).toBe(null);
  });
  it("С2: where it was bought — suppliers, the person's own recent vendors, the usual ones; each once; a typed one kept", () => {
    const d = db();
    d.suppliers = [{ id: "s1", name: "Gutter Supply Co", active: true } as never, { id: "s2", name: "Old one", active: false } as never];
    d.expenses = [
      { id: "e1", jobId: null, vendor: "corner store", category: "other", amountCents: 100, at: "2026-11-10T10:00:00Z", memberId: d.me },
      { id: "e2", jobId: null, vendor: "Someone else's", category: "other", amountCents: 100, at: "2026-11-11T10:00:00Z", memberId: "other" },
      { id: "e3", jobId: null, vendor: "home depot", category: "other", amountCents: 100, at: "2026-11-09T10:00:00Z", memberId: d.me },
    ];
    const v = vendorChoices(d, "My Own Shop");
    expect(v[0]).toBe("Gutter Supply Co");
    expect(v).not.toContain("Old one");
    expect(v).toContain("corner store");
    expect(v).not.toContain("Someone else's");
    expect(v.filter((x) => x.toLowerCase() === "home depot")).toHaveLength(1);
    for (const u of USUAL_VENDORS) expect(v.some((x) => x.toLowerCase() === u.toLowerCase())).toBe(true);
    expect(v).toContain("My Own Shop");
  });
  it("С3: the day of an expense — the receipt's day; an older expense without one — the company's day of when it was made", () => {
    expect(expenseDay({ date: "2026-11-16", at: "2026-11-18T03:00:00Z" })).toBe("2026-11-16");
    // 03:00 UTC on the 18th is the 17th in Los Angeles
    expect(expenseDay({ at: "2026-11-18T03:00:00Z" }, "America/Los_Angeles")).toBe("2026-11-17");
    expect(expenseDay({ date: "junk", at: "2026-11-18T20:00:00Z" }, "America/Los_Angeles")).toBe("2026-11-18");
  });
});
