/**
 * Lines of a job made without an estimate (docs/specs/17-job.md §11.1, 3b-2). Pure functions over the DB; the store
 * only calls them. The totals are the engine's (jobLinesTotals) — the same numbers the server counts (t90, db T41).
 * Refused before the store: a job from an estimate (its lines are the estimate's, t20), a job that is done, and a change
 * that brings the total below what is already invoiced (engine jobLinesBelowInvoiced, db T69).
 */
import { caWrittenContractRequired, jobLinesBelowInvoiced, jobLinesTotals } from "@octo/estimating-engine";
import type { DB, ID, Job, JobLineItem } from "@/data/types";
import { findJob } from "@/data/jobs";

type D = Pick<DB, "jobs" | "jobLines" | "invoices">;

export const linesOf = (d: Pick<DB, "jobLines">, jobId: ID): JobLineItem[] =>
  (d.jobLines ?? []).filter((l) => l.jobId === jobId).sort((a, b) => a.position - b.position);

export const nextLinePosition = (d: Pick<DB, "jobLines">, jobId: ID): number => Math.max(-1, ...linesOf(d, jobId).map((l) => l.position)) + 1;

const taxOf = (j: Pick<Job, "taxEnabled" | "taxRateBps">) => ({ enabled: !!j.taxEnabled, rateBps: j.taxRateBps ?? 0 });

/** the job's total from these lines and tax (engine) */
export function totalOf(lines: Pick<JobLineItem, "quantity" | "unitPriceCents" | "taxable">[], tax: Pick<Job, "taxEnabled" | "taxRateBps">) {
  return jobLinesTotals(lines, taxOf(tax));
}

/** the job's own lines can change: no estimate, not done */
export const linesEditable = (j: Pick<Job, "estimateId" | "status">): boolean => !j.estimateId && j.status !== "done";

/** the job with its lines recounted (amountCents = engine total; each line's totalCents) — only a job without an estimate */
function recount(d: D, jobId: ID): D {
  const j = d.jobs.find((x) => x.id === jobId);
  if (!j || j.estimateId) return d;
  const lines = linesOf(d, jobId);
  const t = totalOf(lines, j);
  const totals = new Map(lines.map((l, i) => [l.id, t.lineTotals[i] ?? 0]));
  return {
    ...d,
    jobLines: (d.jobLines ?? []).map((l) => (totals.has(l.id) ? { ...l, totalCents: totals.get(l.id)! } : l)),
    jobs: d.jobs.map((x) => (x.id === jobId ? { ...x, amountCents: t.total } : x)),
  };
}

export function withJobLine<T extends D>(d: T, line: Omit<JobLineItem, "totalCents">): T {
  const exists = (d.jobLines ?? []).some((l) => l.id === line.id);
  const next = { ...line, totalCents: 0 };
  const jobLines = exists ? (d.jobLines ?? []).map((l) => (l.id === line.id ? next : l)) : [...(d.jobLines ?? []), next];
  return recount({ ...d, jobLines }, line.jobId) as T;
}

export function withoutJobLine<T extends D>(d: T, id: ID): T {
  const l = (d.jobLines ?? []).find((x) => x.id === id);
  if (!l) return d;
  return recount({ ...d, jobLines: (d.jobLines ?? []).filter((x) => x.id !== id) }, l.jobId) as T;
}

export function withJobTax<T extends D>(d: T, jobId: ID, tax: { taxEnabled: boolean; taxRateBps: number }): T {
  return recount({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, ...tax } : j)) }, jobId) as T;
}

export type LineRefusal = "estimate" | "done" | "belowInvoiced";

/** why a change of the job's lines / tax (the job after it, as withJobLine / withoutJobLine / withJobTax give) is refused */
export function lineChangeRefusal(before: D, after: D, jobId: ID): LineRefusal | null {
  const j = before.jobs.find((x) => x.id === jobId);
  if (!j) return null;
  if (j.estimateId) return "estimate";
  if (j.status === "done") return "done";
  const next = after.jobs.find((x) => x.id === jobId)?.amountCents ?? 0;
  if (next < j.amountCents && jobLinesBelowInvoiced(next, before.invoices.filter((i) => i.jobId === jobId))) return "belowInvoiced";
  return null;
}

/** «Для такой суммы нужен письменный договор» (B&P §7159): the engine decides, the app only gathers the facts */
export function caContractWarning(d: Pick<DB, "jobs" | "cancelledJobs" | "properties" | "company" | "jobLines">, jobId: ID): boolean {
  const j = findJob(d, jobId);
  if (!j || !linesOf(d, jobId).length) return false;
  return caWrittenContractRequired({
    companyState: d.company?.address?.state,
    propertyKind: d.properties.find((p) => p.id === j.propertyId)?.kind,
    hasEstimate: !!j.estimateId,
    totalCents: j.amountCents,
  });
}
