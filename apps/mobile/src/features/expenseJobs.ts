/**
 * «К какой работе» on a new expense (#1427 053): the choices are the jobs of today's visits, named as a job — its number and
 * title («JOB-0001 · Bathroom remodel») — not by the client, and each job once (two visits of one job are one choice).
 * Pure; tested in test/texts1427.test.ts.
 */
import type { DB, ID } from "@/data/types";

export function expenseJobChoices(db: Pick<DB, "jobs" | "properties" | "customers">, visits: { jobId?: ID | null }[]): { key: ID; label: string }[] {
  const seen = new Set<ID>();
  const out: { key: ID; label: string }[] = [];
  for (const v of visits) {
    if (!v.jobId || seen.has(v.jobId)) continue;
    seen.add(v.jobId);
    const job = db.jobs.find((j) => j.id === v.jobId);
    // a job not on this phone yet: the client's name is still better than nothing
    const client = db.customers.find((c) => c.id === db.properties.find((p) => p.id === job?.propertyId)?.customerId);
    out.push({ key: v.jobId, label: job ? [job.number, job.title].filter(Boolean).join(" · ") : (client?.name ?? v.jobId) });
  }
  return out;
}
