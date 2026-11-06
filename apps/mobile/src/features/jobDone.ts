/**
 * S10 «Работа выполнена» (docs/specs/17-job.md §4, 13 §3.4.1, 15-flows §1.1 шаги 18–22, §1.15). One set of rules for
 * the store; the server does the same (migration 20261106045000: the visit trigger and public.complete_job, db T46).
 * - the first visit of a job «На месте» → the job `scheduled → in_progress`;
 * - paying on a visit does not change the job;
 * - a second visit does not take an `in_progress` job back to `scheduled`;
 * - `done` only by a person of the office (owner, admin, office): «Да, выполнена» or «Завершить работу», and only
 *   when no visit of the job is still open;
 * - «Работа выполнена?» (computed, S15): the job is `in_progress`, no visit is open, at least one is finished.
 */
import type { DB, Job, JobStatus, Visit, VisitStep } from "@/data/types";

/** a visit that is over for the job: paid, done (an inspection), or closed */
export const visitFinished = (v: Pick<Visit, "step" | "closed">) => v.step === "paid" || v.step === "done" || !!v.closed;

/** the job's status after one of its visits made a step */
export function jobStatusAfterStep(status: JobStatus, step: VisitStep): JobStatus {
  return step === "on_site" && status === "scheduled" ? "in_progress" : status;
}

/** the job's status after a visit is put on it (S9): a job already going stays going */
export function jobStatusAfterSchedule(status: JobStatus): JobStatus {
  return status === "in_progress" ? "in_progress" : "scheduled";
}

/** «Работа выполнена?»: going, no visit open, at least one finished */
export function jobAwaitingClose(d: Pick<DB, "visits">, j: Pick<Job, "id" | "status">): boolean {
  if (j.status !== "in_progress") return false;
  const vs = d.visits.filter((v) => v.jobId === j.id);
  return vs.length > 0 && vs.every(visitFinished);
}

export type CompleteBlock = "openVisits" | "notStarted" | "alreadyDone";
/** may the office close the job now (the server refuses the same cases) */
export function completeBlock(d: Pick<DB, "visits">, j: Pick<Job, "id" | "status">): CompleteBlock | null {
  if (j.status === "done") return "alreadyDone";
  if (j.status === "unscheduled") return "notStarted";
  if (d.visits.some((v) => v.jobId === j.id && !visitFinished(v))) return "openVisits";
  return null;
}

export function withJobDone(d: DB, jobId: string): DB {
  return { ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: "done" } : j)) };
}
