/**
 * #3124 В1 (spec 71 §16): «Линия работы» — the steps of one job built from what the app already has (no new data,
 * the base does not change): its estimate, contract invoices (deposit / progress / final) and extra ones, payments and
 * refunds, visits, expenses and purchase orders. Oldest first; the current step is the first one not closed. Money only
 * for roles that see the contract (`showMoney`); the sums go through @octo/estimating-engine (rule 8).
 * Pure: no react-native, so the rule is tested on its own (test/jobLine.test.ts).
 */
import { sumCents } from "@octo/estimating-engine";
import type { DB, ID, Invoice } from "@/data/types";
import { findJob } from "@/data/jobs";

export type JobLineKind = "estimate" | "deposit" | "progress" | "final" | "invoice" | "payment" | "refund" | "visit" | "expense" | "order";
export type JobLineState = "done" | "current" | "todo";

export interface JobLineStep {
  id: string;
  kind: JobLineKind;
  /** when it happened or is due (ISO); the line is sorted by it */
  at: string;
  state: JobLineState;
  /** the step's own sum — undefined for a role without the contract's money */
  cents?: number;
  /** the screen this step opens; none for an expense (it has no screen of its own — the job's «Расходы» list holds it) */
  href?: string;
}

export interface JobLine {
  steps: JobLineStep[];
  /** the first step not closed; none for a closed or cancelled job */
  current?: JobLineStep;
  cancelled: boolean;
  /** contract money — undefined without `showMoney` */
  money?: { totalCents: number; paidCents: number; dueCents: number };
}

type D = Pick<DB, "jobs" | "cancelledJobs" | "estimates" | "invoices" | "payments" | "visits" | "expenses" | "purchaseOrders">;

const invoiceKind = (i: Invoice): JobLineKind =>
  i.kind === "deposit" ? "deposit" : i.kind === "progress" ? "progress" : i.kind === "final" || i.kind === undefined ? "final" : "invoice";

const net = (p: { amountCents: number; refundedCents?: number }) => p.amountCents - (p.refundedCents ?? 0);

/** the line of one job; `showMoney` false (the tech) — the same steps without any sum */
export function jobLineOf(d: D, jobId: ID, showMoney: boolean): JobLine {
  const job = findJob(d, jobId);
  const cancelled = !!job?.cancelledAt || !!(d.cancelledJobs ?? []).some((j) => j.id === jobId);
  const raw: Omit<JobLineStep, "state">[] = [];
  const closed = new Set<string>();
  const step = (s: Omit<JobLineStep, "state">, isClosed: boolean) => {
    raw.push(showMoney ? s : { ...s, cents: undefined });
    if (isClosed) closed.add(s.id);
  };

  const est = job?.estimateId ? d.estimates.find((e) => e.id === job.estimateId) : undefined;
  if (est) {
    step(
      { id: `estimate:${est.id}`, kind: "estimate", at: est.approvedAt ?? est.sentAt ?? est.savedAt ?? "", cents: est.totalCents, href: `/estimate/${est.id}` },
      est.status === "approved",
    );
  }

  const invoices = d.invoices.filter((i) => i.jobId === jobId && i.status !== "void");
  const invoiceIds = new Set(invoices.map((i) => i.id));
  for (const inv of invoices) {
    step(
      { id: `invoice:${inv.id}`, kind: invoiceKind(inv), at: inv.sentAt ?? inv.dueDate, cents: inv.totalCents, href: `/invoice/${inv.id}` },
      inv.paidCents >= inv.totalCents,
    );
  }

  const payments = d.payments.filter((p) => invoiceIds.has(p.invoiceId));
  for (const p of payments) {
    step({ id: `payment:${p.id}`, kind: "payment", at: p.at, cents: p.amountCents, href: `/receipt/${p.id}` }, true);
    if ((p.refundedCents ?? 0) > 0) {
      step({ id: `refund:${p.id}`, kind: "refund", at: p.at, cents: p.refundedCents, href: `/receipt/${p.id}` }, true);
    }
  }

  for (const v of d.visits.filter((x) => x.jobId === jobId)) {
    step(
      { id: `visit:${v.id}`, kind: "visit", at: v.start, cents: v.amountDueCents || undefined, href: `/visit/${v.id}` },
      !!v.closed || v.step === "done" || v.step === "paid",
    );
  }

  for (const x of d.expenses.filter((e) => e.jobId === jobId)) {
    step({ id: `expense:${x.id}`, kind: "expense", at: x.at, cents: x.amountCents }, true);
  }

  for (const po of (d.purchaseOrders ?? []).filter((o) => o.jobId === jobId)) {
    step(
      { id: `order:${po.id}`, kind: "order", at: po.sentAt ?? po.createdAt, href: `/purchase-order/${po.id}` },
      po.status === "received" || po.status === "cancelled",
    );
  }

  // oldest first; a step without a time goes first (an estimate never saved has no time yet), the id keeps the order stable
  raw.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const firstOpen = cancelled ? -1 : raw.findIndex((s) => !closed.has(s.id));
  const steps: JobLineStep[] = raw.map((s, i) => ({
    ...s,
    state: closed.has(s.id) || cancelled ? "done" : i === firstOpen ? "current" : "todo",
  }));

  const money = showMoney
    ? (() => {
        const paidCents = sumCents(payments.map(net));
        const dueCents = sumCents(invoices.map((i) => Math.max(0, i.totalCents - i.paidCents)));
        return { totalCents: job?.amountCents ?? 0, paidCents, dueCents };
      })()
    : undefined;

  return { steps, current: firstOpen >= 0 ? steps[firstOpen] : undefined, cancelled, money };
}
