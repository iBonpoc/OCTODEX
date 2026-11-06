/** S10 «Работа выполнена» (features/jobDone.ts, attention «jobDone»; docs/specs/17-job.md §4; server T46). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { completeBlock, jobAwaitingClose, jobStatusAfterSchedule, jobStatusAfterStep, visitFinished, withJobDone } from "../src/features/jobDone";
import { buildAttention, attentionHref } from "../src/features/attention";
import type { DB, Visit } from "../src/data/types";

const V = (p: Partial<Visit>): Visit => ({ id: "v", jobId: "J", techId: null, start: "2026-11-06T17:00:00.000Z", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });

describe("job status by its visits", () => {
  it("«На месте» starts a scheduled job; other steps and other statuses do not move it", () => {
    expect(jobStatusAfterStep("scheduled", "on_site")).toBe("in_progress");
    expect(jobStatusAfterStep("scheduled", "en_route")).toBe("scheduled");
    expect(jobStatusAfterStep("in_progress", "paid")).toBe("in_progress");
    expect(jobStatusAfterStep("done", "on_site")).toBe("done");
  });
  it("a second visit does not take a going job back to «scheduled» (failed before: scheduleJob always set scheduled)", () => {
    expect(jobStatusAfterSchedule("in_progress")).toBe("in_progress");
    expect(jobStatusAfterSchedule("unscheduled")).toBe("scheduled");
    expect(jobStatusAfterSchedule("done")).toBe("done");
  });
  it("finished = paid, done or closed", () => {
    expect([V({ step: "paid" }), V({ step: "done" }), V({ step: "on_site", closed: true })].every(visitFinished)).toBe(true);
    expect(visitFinished(V({ step: "signed" }))).toBe(false);
  });
});

describe("«Работа выполнена?»", () => {
  const J = { id: "J", status: "in_progress" as const };
  it("going, every visit finished", () => {
    expect(jobAwaitingClose({ visits: [V({ id: "a", step: "paid" }), V({ id: "b", step: "paid" })] }, J)).toBe(true);
  });
  it("not while a visit is open, not without visits, not for other statuses", () => {
    expect(jobAwaitingClose({ visits: [V({ id: "a", step: "paid" }), V({ id: "b", step: "scheduled" })] }, J)).toBe(false);
    expect(jobAwaitingClose({ visits: [] }, J)).toBe(false);
    expect(jobAwaitingClose({ visits: [V({ step: "paid" })] }, { id: "J", status: "scheduled" })).toBe(false);
    expect(jobAwaitingClose({ visits: [V({ step: "paid" })] }, { id: "J", status: "done" })).toBe(false);
  });
  it("closing: refused with an open visit, before any visit, twice", () => {
    expect(completeBlock({ visits: [V({ step: "on_site" })] }, J)).toBe("openVisits");
    expect(completeBlock({ visits: [] }, { id: "J", status: "unscheduled" })).toBe("notStarted");
    expect(completeBlock({ visits: [] }, { id: "J", status: "done" })).toBe("alreadyDone");
    expect(completeBlock({ visits: [V({ step: "paid" })] }, J)).toBeNull();
    expect(completeBlock({ visits: [] }, { id: "J", status: "scheduled" })).toBeNull();
  });
  it("the attention item: office only, opens the job; gone once done", () => {
    const d: DB = makeSeed();
    const j = d.jobs.find((x) => x.id === "j2")!;
    d.jobs = d.jobs.map((x) => (x.id === "j2" ? { ...x, status: "in_progress" } : x));
    d.visits = [...d.visits.filter((v) => v.jobId !== "j2"), V({ id: "vd", jobId: "j2", propertyId: j.propertyId, step: "paid" })];
    const it = buildAttention(d, "director").find((x) => x.kind === "jobDone" && x.refId === "j2");
    expect(it).toBeTruthy();
    expect(attentionHref(it!)).toBe("/job/j2");
    expect(buildAttention(d, "dispatcher").some((x) => x.kind === "jobDone")).toBe(true);
    for (const role of ["tech", "sales"] as const) expect(buildAttention(d, role).some((x) => x.kind === "jobDone"), role).toBe(false);
    expect(buildAttention(withJobDone(d, "j2"), "director").some((x) => x.kind === "jobDone" && x.refId === "j2")).toBe(false);
  });
});

describe("quickStarts (move form, 13 §3.6)", () => {
  // company days, not the phone's: pure on day keys and the company's minute
  it("Thursday 10:00: later today 18:00, tomorrow 9:00, next Monday 9:00", async () => {
    const { quickStarts } = await import("../src/features/schedule");
    expect(quickStarts("2026-11-05", 600)).toEqual([
      { key: "laterToday", day: "2026-11-05", minute: 1080 },
      { key: "tomorrow", day: "2026-11-06", minute: 540 },
      { key: "monday", day: "2026-11-09", minute: 540 },
    ]);
  });
  it("after 18:00 no «later today»; on a Monday «Monday» is a week later; across a month end", async () => {
    const { quickStarts } = await import("../src/features/schedule");
    expect(quickStarts("2026-11-05", 18 * 60).map((q) => q.key)).toEqual(["tomorrow", "monday"]);
    expect(quickStarts("2026-11-09", 0).find((q) => q.key === "monday")!.day).toBe("2026-11-16");
    expect(quickStarts("2026-11-30", 0).find((q) => q.key === "tomorrow")!.day).toBe("2026-12-01");
    expect(quickStarts("2026-11-29", 0).find((q) => q.key === "monday")!.day).toBe("2026-11-30");
  });
});
