/**
 * unit:jobCancelReports — #2015 (spec 38 §12, scenario С9): a cancelled job and the invoices it voided are in no sum and in
 * no «Требует внимания» card — «Кто должен», «Ждёт оплаты» and the attention list read live jobs and invoices only.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { attentionHref, buildAttention } from "../src/features/attention";
import { owedReport } from "../src/features/reports";
import { periodNumbers } from "../src/features/metrics";

/** the state the store leaves after cancelJob (data/store.tsx), done by hand: the job and its invoices leave the live lists */
const cancelled = (d: DB, jobId: string): DB => {
  const job = d.jobs.find((j) => j.id === jobId)!;
  const owed = d.invoices.filter((i) => i.jobId === jobId);
  return {
    ...d,
    jobs: d.jobs.filter((j) => j.id !== jobId),
    cancelledJobs: [...(d.cancelledJobs ?? []), { ...job, cancelReason: "Changed mind", cancelledAt: "2026-11-17T10:00:00Z" }],
    visits: d.visits.filter((v) => v.jobId !== jobId),
    invoices: d.invoices.filter((i) => i.jobId !== jobId),
    voidInvoices: [...(d.voidInvoices ?? []), ...owed.map((i) => ({ ...i, status: "void" as const, voidReason: "job cancelled", voidedAt: "2026-11-17T10:00:00Z" }))],
  };
};

describe("unit:jobCancelReports — #2015 С9", () => {
  const seed = makeSeed();
  const job = seed.jobs.find((j) => seed.invoices.some((i) => i.jobId === j.id && i.totalCents > i.paidCents) && !seed.invoices.some((i) => i.jobId === j.id && i.paidCents > 0))
    ?? seed.jobs.find((j) => seed.invoices.some((i) => i.jobId === j.id && i.totalCents > i.paidCents))!;
  const after = cancelled(seed, job.id);
  it("the debt of the cancelled job's invoices is out of «Кто должен» and «Ждёт оплаты»", () => {
    const owedBefore = owedReport(seed).owesCents;
    const gone = seed.invoices.filter((i) => i.jobId === job.id).reduce((a, i) => a + Math.max(0, i.totalCents - i.paidCents), 0);
    expect(gone).toBeGreaterThan(0);
    expect(owedReport(after).owesCents).toBe(owedBefore - gone);
    expect(periodNumbers(after, "today").awaitingCents).toBe(periodNumbers(seed, "today").awaitingCents - gone);
  });
  it("no «Требует внимания» card is about the cancelled job or its invoices", () => {
    const ids = [job.id, ...seed.invoices.filter((i) => i.jobId === job.id).map((i) => i.id)];
    for (const role of ["director", "dispatcher"] as const) {
      const items = buildAttention(after, role, Date.parse("2026-11-17T20:00:00Z"));
      for (const it of items) for (const id of ids) expect(attentionHref(it), `${role} ${it.kind}`).not.toContain(id);
    }
  });
});
