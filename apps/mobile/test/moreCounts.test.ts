/**
 * Counters on «Ещё» (spec 25): the same numbers as «Требует внимания», the role's rights in, zero → no counter,
 * only overdue invoices are a status (bad). My tasks «for today» — overdue or due/starting today, not done.
 */
import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { jobsCountLabel, moreCounts } from "../src/features/moreCounts";
import { makeSeed } from "../src/data/seed";
import type { DB, Job, Task, Visit } from "../src/data/types";

const noon = new Date(); noon.setHours(12, 0, 0, 0);
const NOW = noon.getTime();
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const iso = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

describe("moreCounts", () => {
  const db = makeSeed();
  it("director: equals «Требует внимания» by kind; invoices are the only bad one", () => {
    const att = buildAttention(db, "director", NOW);
    const by = (ks: string[]) => att.filter((a) => ks.includes(a.kind)).length;
    const m = moreCounts(db, "director", NOW, TZ);
    expect(m.leads?.n ?? 0).toBe(by(["lead", "leadBack", "leadNoStep", "leadIdle", "leadOrphan"]));
    expect(m.invoices?.n ?? 0).toBe(by(["overdue"]));
    expect(m.estimates?.n ?? 0).toBe(by(["estimateSign"]));
    expect(m.jobs?.n ?? 0).toBe(by(["schedule", "jobDone"]));
    expect(m.invoices?.n).toBeGreaterThan(0); // the demo has an overdue invoice
    for (const [k, v] of Object.entries(m)) expect(!!v!.bad).toBe(k === "invoices");
  });
  it("zero → no counter at all", () => {
    const empty = { ...db, leads: [], invoices: [], estimates: [], jobs: [], tasks: [], visits: [] } as DB;
    expect(moreCounts(empty, "director", NOW, TZ)).toEqual({});
  });
  it("tech: no counter on a section the tech does not have (Счета — sections.ts); no overdue invoices for him at all", () => {
    expect(buildAttention(db, "tech", NOW).some((a) => a.kind === "overdue")).toBe(false);
    const m = moreCounts(db, "tech", NOW, TZ);
    expect(m.invoices).toBeUndefined();
  });
  it("tech: «Лиды» counts his own leads only (13 §2.3) — none of his waiting, no counter", () => {
    const mine = moreCounts(db, "tech", NOW, TZ).leads?.n ?? 0;
    expect(mine).toBe(moreCounts(db, "director", NOW, TZ).leads?.n ?? 0); // demo «me» (Alex) has every lead
    const others: DB = { ...db, leads: db.leads.map((l) => ({ ...l, assigneeId: "m-ivan", createdBy: "m-ivan" })) };
    expect(moreCounts(others, "director", NOW, TZ).leads?.n ?? 0).toBeGreaterThan(0);
    expect(moreCounts(others, "tech", NOW, TZ).leads).toBeUndefined();
  });
  it("dispatcher (office) keeps Счета and Лиды", () => {
    const m = moreCounts(db, "dispatcher", NOW, TZ);
    expect(m.invoices?.n).toBeGreaterThan(0);
  });
  it("my tasks for today: overdue and today count; tomorrow, done and other people's do not", () => {
    const T = (id: string, p: Partial<Task>): Task => ({ id, title: id, assigneeId: db.me, createdAt: iso(-3), ...p }) as Task;
    const tasks = [
      T("over", { dueAt: iso(-2) }),
      T("today", { dueAt: iso(0) }),
      T("tomorrow", { dueAt: iso(1) }),
      T("done", { dueAt: iso(0), doneAt: iso(0) }),
      T("other", { dueAt: iso(0), assigneeId: "someone-else" }),
    ];
    expect(moreCounts({ ...db, tasks } as DB, "director", NOW, TZ).tasks?.n).toBe(2);
  });
  // #2060: the «Работы» counter says what it counts
  describe("«Работы»: the word says what is counted (#2060)", () => {
    const base = { ...db, leads: [], invoices: [], estimates: [], tasks: [] } as DB;
    const job = (id: string, status: Job["status"]): Job => ({ ...db.jobs[0], id, status }) as Job;
    const visit = (id: string, jobId: string): Visit => ({ ...db.visits[0], id, jobId, step: "paid", closed: false }) as Visit;
    const plan = (n: number) => Array.from({ length: n }, (_, i) => job(`plan${i}`, "unscheduled"));
    const check = (n: number) => Array.from({ length: n }, (_, i) => job(`check${i}`, "in_progress"));
    const visits = (n: number) => Array.from({ length: n }, (_, i) => visit(`v${i}`, `check${i}`));
    it("С1 only jobs to schedule → «К плану: N»", () => {
      const m = moreCounts({ ...base, jobs: plan(2), visits: [] } as DB, "director", NOW, TZ);
      expect(m.jobs).toEqual({ n: 2, label: "fix.more.jobs" });
    });
    it("С2 only done jobs that wait for the office → «Проверить: N», not «К плану»", () => {
      const m = moreCounts({ ...base, jobs: check(3), visits: visits(3) } as DB, "director", NOW, TZ);
      expect(m.jobs).toEqual({ n: 3, label: "fix.more.jobsCheck" });
    });
    it("С3 both → «Требуют внимания: N», the sum", () => {
      const m = moreCounts({ ...base, jobs: [...plan(1), ...check(2)], visits: visits(2) } as DB, "director", NOW, TZ);
      expect(m.jobs).toEqual({ n: 3, label: "fix.more.jobsAll" });
    });
    it("the rule itself", () => {
      expect(jobsCountLabel(1, 0)).toBe("fix.more.jobs");
      expect(jobsCountLabel(0, 1)).toBe("fix.more.jobsCheck");
      expect(jobsCountLabel(2, 5)).toBe("fix.more.jobsAll");
    });
  });
});
