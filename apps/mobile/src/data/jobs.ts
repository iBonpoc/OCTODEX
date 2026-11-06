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
