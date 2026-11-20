/**
 * #2015 (spec 38 §12, story map S37): «Отменить работу». The phone checks what the server checks (public.cancel_job,
 * app.job_cancel_reason — db T383–T390) so a person is told at once; the server stays the judge. The cancel is for good:
 * no «Отменить» toast (rule 5: a confirmation instead, as for a void invoice).
 */
import type { DB, ID, Role } from "@/data/types";

/** why a job is not cancelled — every one has a sentence (job.cancel.why.*) */
export type JobCancelRefusal = "role" | "gone" | "done" | "onSite" | "paid" | "invoiceOpen" | "reason" | "long";
/** the longest reason (the server: 1 to 500 characters) */
export const JOB_CANCEL_REASON_MAX = 500;

type D = Pick<DB, "jobs" | "visits" | "invoices" | "payments" | "pendingPayments">;

/** money taken on this job: on its invoices or in transit (a cash payment on a visit without an invoice is only known to the server — it answers «paid») */
function jobHasPayment(d: D, jobId: ID): boolean {
  const invoiceIds = new Set(d.invoices.filter((i) => i.jobId === jobId).map((i) => i.id));
  return (
    d.invoices.some((i) => i.jobId === jobId && i.paidCents > 0) ||
    (d.payments ?? []).some((p) => p.amountCents > 0 && invoiceIds.has(p.invoiceId)) ||
    (d.pendingPayments ?? []).some((p) => invoiceIds.has(p.invoiceId))
  );
}

/** null — may be cancelled. The director (owner / admin) cancels; the dispatcher (office) — a job without an invoice; sales and tech never */
export function jobCancelRefusal(d: D, jobId: ID, reason: string, role: Role): JobCancelRefusal | null {
  if (role !== "director" && role !== "dispatcher") return "role";
  const job = d.jobs.find((j) => j.id === jobId);
  if (!job) return "gone";
  if (job.status === "done") return "done";
  if (d.visits.some((v) => v.jobId === jobId && ["on_site", "working", "signed"].includes(v.step))) return "onSite";
  if (jobHasPayment(d, jobId)) return "paid";
  if (role !== "director" && d.invoices.some((i) => i.jobId === jobId)) return "invoiceOpen";
  const why = reason.trim();
  if (!why) return "reason";
  if (why.length > JOB_CANCEL_REASON_MAX) return "long";
  return null;
}
