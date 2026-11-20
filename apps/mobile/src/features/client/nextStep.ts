/**
 * The client card's one main button — «the next step» along the chain (redesign 20.11.2026, 06-decision.md п.3):
 * no estimate → «Новая смета»; a draft → «Отправить»; approved with something left to bill → «Выставить счёт»;
 * an invoice not paid → «Взять оплату». The further a step is along the chain, the sooner it is offered (money first).
 * Pure: it only reads the client's records and leads to the actions that already exist (the send sheet of the estimate,
 * the job's contract statement, the invoice's «Принять оплату»); no business rule is changed here.
 * Tested in test/clientNextStep.test.ts.
 */
import { contractStatement } from "@octo/estimating-engine";
import type { Estimate, Invoice, Job, Role } from "@/data/types";
import { canBill } from "@/features/billRights";
import { invoiceBalance } from "@/features/invoiceStatus";
import { paymentRight } from "@/features/moneyLists";

export type NextStep =
  | { kind: "pay"; invoice: Invoice; owesCents: number; href: string }
  | { kind: "bill"; estimate: Estimate; job: Job; toInvoiceCents: number; href: string }
  | { kind: "send"; estimate: Estimate; href: string }
  | { kind: "estimate"; href: string };

export interface NextStepInput {
  estimates: Estimate[];
  jobs: Job[];
  /** the client's invoices the role sees (the tech — none) */
  invoices: Invoice[];
  role: Role;
  /** «Новая смета» of this client's «＋» (role, «do not service»): its address, or none */
  newEstimateHref?: string;
}

const live = (i: Invoice) => i.status !== "void";
/** the newest first: what the person touched last is what he is on */
const newest = (a: Estimate, b: Estimate) => (b.savedAt ?? b.sentAt ?? "").localeCompare(a.savedAt ?? a.sentAt ?? "");

export function clientNextStep({ estimates, jobs, invoices, role, newEstimateHref }: NextStepInput): NextStep | null {
  // 1) money waits: the invoice due first (the overdue ones are the earliest) that this role can take a payment of
  const unpaid = invoices
    .filter(live)
    .map((invoice) => ({ invoice, owesCents: invoiceBalance(invoice).owesCents }))
    .filter((x) => x.owesCents > 0)
    .filter((x) => paymentRight(role, x.invoice, { fromEstimate: !!jobs.find((j) => j.id === x.invoice.jobId)?.estimateId }) !== "none")
    .sort((a, b) => (a.invoice.dueDate ?? "").localeCompare(b.invoice.dueDate ?? ""));
  if (unpaid[0]) return { kind: "pay", ...unpaid[0], href: `/invoice/${unpaid[0].invoice.id}` };

  // 2) a signed contract with something left to bill: the job's statement has «Выставить остаток» (ContractStatement)
  if (canBill(role)) {
    for (const estimate of estimates.filter((e) => e.status === "approved").sort(newest)) {
      const job = jobs.find((j) => j.estimateId === estimate.id && !j.cancelledAt);
      if (!job || job.amountCents <= 0) continue;
      const toInvoiceCents = contractStatement(job.amountCents, invoices.filter((i) => live(i) && i.jobId === job.id)).toInvoice;
      if (toInvoiceCents > 0) return { kind: "bill", estimate, job, toInvoiceCents, href: `/job/${job.id}` };
    }
  }

  // 3) a draft to send: the estimate opens with its send sheet (`?send=1`, the estimate's own screen)
  const draft = estimates.filter((e) => e.status === "draft").sort(newest)[0];
  if (draft) return { kind: "send", estimate: draft, href: `/estimate/${draft.id}?send=1` };

  // 4) nothing to move: a new estimate (when this role may make one for this client)
  return newEstimateHref ? { kind: "estimate", href: newEstimateHref } : null;
}

/**
 * «Сейчас» — the client's current business: the document of the next step, else an estimate waiting for the client's answer;
 * and the jobs not done yet. What is shown here is left out of the history below it.
 */
export function clientCurrent(step: NextStep | null, estimates: Estimate[], jobs: Job[]): { doc?: { type: "estimate"; e: Estimate } | { type: "invoice"; i: Invoice }; jobs: Job[] } {
  const waiting = estimates.filter((e) => e.status === "sent" || e.status === "awaiting_countersign").sort(newest)[0];
  const doc =
    step?.kind === "pay"
      ? ({ type: "invoice", i: step.invoice } as const)
      : step?.kind === "bill" || step?.kind === "send"
        ? ({ type: "estimate", e: step.estimate } as const)
        : waiting
          ? ({ type: "estimate", e: waiting } as const)
          : undefined;
  return { doc, jobs: jobs.filter((j) => j.status !== "done" && !j.cancelledAt) };
}
