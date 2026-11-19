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

/**
 * What a new expense may be tied to (Р-8a, 20261117567000): the office, sales and a tech — today's jobs or none («Общий
 * расход»); a subcontractor — only a job of a visit of his today, never none and never an inspection's in-memory job
 * (`insp-…`, it never reaches the server): the server refuses a subcontractor's expense without a job. Pure; test/expenseJobs.test.ts.
 */
export function expenseJobOptions(
  db: Pick<DB, "jobs" | "properties" | "customers">,
  todays: { jobId?: ID | null }[],
  sub: boolean,
): { jobs: { key: ID; label: string }[]; allowNone: boolean } {
  const jobs = expenseJobChoices(db, sub ? todays.filter((v) => !!v.jobId && !v.jobId.startsWith("insp-")) : todays);
  return { jobs, allowNone: !sub };
}

/** may this person start a new expense at all (a subcontractor: only with a job of his today) */
export const canStartExpense = (o: { jobs: unknown[]; allowNone: boolean }) => o.allowNone || o.jobs.length > 0;
