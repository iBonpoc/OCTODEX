/**
 * Job number and job types for the demo (wave П-1, docs/specs/13-app-structure.md §5, 15-flows §3.1).
 * In the cloud the server sets JOB-0001 (app.next_document_number); a job made offline has no number until it syncs.
 */
import type { DB } from "./types";

const JOB_NO = /^JOB-(\d+)$/;

/** the next JOB number of the demo company: after every job, cancelled ones too (numbers are never reused) */
export function nextJobNumber(d: Pick<DB, "jobs" | "cancelledJobs">): string {
  const all = [...d.jobs, ...(d.cancelledJobs ?? [])];
  const max = Math.max(0, ...all.map((j) => Number(JOB_NO.exec(j.number ?? "")?.[1] ?? 0)));
  return `JOB-${String(max + 1).padStart(4, "0")}`;
}

/** a job by id, cancelled ones too (they are not in `jobs`, wave П-1): an invoice or a payment of a cancelled job still
 *  finds it. Screens move to this before job cancel exists (wave 3). */
export function findJob(d: Pick<DB, "jobs" | "cancelledJobs">, id: string | undefined) {
  if (!id) return undefined;
  return d.jobs.find((j) => j.id === id) ?? d.cancelledJobs?.find((j) => j.id === id);
}

/** the job made from an estimate, cancelled or not: one estimate never makes a second job (server: unique estimate_id) */
export function jobOfEstimate(d: Pick<DB, "jobs" | "cancelledJobs">, estimateId: string) {
  return d.jobs.find((j) => j.estimateId === estimateId) ?? d.cancelledJobs?.find((j) => j.estimateId === estimateId);
}
