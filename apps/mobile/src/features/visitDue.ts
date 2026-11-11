/**
 * What a visit takes now (#757, director's review of #857 №1): one answer for the visit screen, its toast, the visit cards
 * and the store's payVisit — the engine's visitPayment over the job's contract and its invoices, the same rule as the
 * server's record_visit_payment. The visit's stored amountDueCents is not read: it was set when the visit was planned
 * and does not see a deposit billed or a final invoice issued since.
 */
import { visitPayment } from "@octo/estimating-engine";
import type { DB, Visit } from "@/data/types";

export function visitDueCents(db: Pick<DB, "jobs" | "invoices">, v: Pick<Visit, "jobId">): number {
  if (!v.jobId) return 0; // an inspection takes no payment
  const job = db.jobs.find((j) => j.id === v.jobId);
  if (!job) return 0;
  return visitPayment(job.amountCents, db.invoices.filter((i) => i.jobId === v.jobId)).amountCents;
}
