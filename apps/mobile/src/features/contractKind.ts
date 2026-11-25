/**
 * #1193 п.1: which invoices of a job are the contract's — its own module, so the job's lines (jobLines.ts) and the
 * contract's invoices (contractInvoice.ts) read the same rule without importing each other.
 */
import { contractStatement } from "@octo/estimating-engine";
import type { DB, ID, Invoice, Job } from "@/data/types";

/** #1193 п.1: an invoice of the contract — deposit, progress or final (no kind: an older final); a standalone or
 *  recurring one is extra work outside the contract (the director 12.11) — the server's app.job_contract_billed the same */
export const isContractKind = (kind: string | undefined): boolean => kind === undefined || kind === "deposit" || kind === "progress" || kind === "final";

/** what counts against the contract: its sent deposit / progress / final invoices (a standalone one is outside it) */
export const contractInvoices = (d: Pick<DB, "invoices">, jobId: ID): Invoice[] => d.invoices.filter((i) => i.jobId === jobId && isContractKind(i.kind));

/**
 * #2061 (rule А, the lead 18.11): what is still not invoiced on the contract — the price minus its own deposit /
 * progress / final invoices, as the server's app.job_contract_billed. One answer for the job screen's «Выставить
 * остаток», the invoice PDF and «Требует внимания»; a standalone or recurring invoice never lowers it.
 */
export function contractToInvoiceCents(d: Pick<DB, "invoices">, job: Pick<Job, "id" | "amountCents">): number {
  if (!Number.isFinite(job.amountCents) || !(job.amountCents > 0)) return 0;
  return contractStatement(job.amountCents, contractInvoices(d, job.id)).toInvoice;
}

/**
 * review of #2061: what kind the rest of the contract is issued as — a final, unless the job already has a live one
 * (the server keeps one final per job: invoices_one_deposit_final_idx, and refuses a second) → then a progress invoice,
 * as the job's «Договор» block offers «Счёт за этап» once a final exists. An older final with no kind counts as a final.
 */
export function restInvoiceKind(d: Pick<DB, "invoices">, jobId: ID): "final" | "progress" {
  return contractInvoices(d, jobId).some((i) => i.kind === "final" || i.kind === undefined) ? "progress" : "final";
}
