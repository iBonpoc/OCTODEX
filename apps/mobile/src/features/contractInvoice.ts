/**
 * The invoices of a contract on the phone (#865): never more than the contract, the tax split inside — the engine's
 * canIssue / invoiceTaxShare, the same rule the server keeps (trigger t41_invoice_contract, db T196). Pure: the store calls
 * it (issueInvoice), test/contractInvoice.test.ts checks it. The server's numbers win once they are loaded.
 */
import { canIssue, invoiceTaxShare } from "@octo/estimating-engine";
import type { DB, ID, Invoice, Job } from "@/data/types";
import { optionTotals, withAddons } from "@/features/estimateDoc";
import { linesOf, totalOf } from "@/features/jobLines";

type D = Pick<DB, "estimates" | "jobLines" | "invoices">;

/** the contract's tax: the client's signed choice (as the server's app.job_contract_tax), else the job's own lines */
export function contractTaxOf(d: D, job: Pick<Job, "id" | "estimateId" | "amountCents" | "taxEnabled" | "taxRateBps">): number {
  let tax = 0;
  if (job.estimateId) {
    const e = d.estimates.find((x) => x.id === job.estimateId);
    const doc = e?.doc;
    const base = doc && e?.approval ? doc.options.find((o) => o.id === e.approval!.optionId) : undefined;
    if (e?.approval?.taxCents != null) tax = e.approval.taxCents;
    else if (doc && base && e?.approval) tax = optionTotals(doc, withAddons(base, e.approval.addonIds)).tax;
  } else {
    const lines = linesOf(d, job.id);
    if (lines.length) tax = totalOf(lines, job).tax;
  }
  return Math.max(0, Math.min(tax, job.amountCents));
}

/** what counts against the contract: its sent deposit / progress / final invoices (a standalone one is outside it) */
const contractInvoices = (d: Pick<DB, "invoices">, jobId: ID): Invoice[] =>
  d.invoices.filter((i) => i.jobId === jobId && (i.kind === undefined || i.kind === "deposit" || i.kind === "progress" || i.kind === "final"));

/** a new invoice of `amountCents` on the job: refused (null) above the contract; else its subtotal and tax */
export function contractInvoice(d: D, job: Pick<Job, "id" | "estimateId" | "amountCents" | "taxEnabled" | "taxRateBps">, amountCents: number): { subtotalCents: number; taxCents: number } | null {
  const live = contractInvoices(d, job.id).map((i) => ({ totalCents: i.totalCents, paidCents: i.paidCents, taxCents: i.taxCents }));
  if (!canIssue(job.amountCents, live, amountCents)) return null;
  const taxCents = invoiceTaxShare(job.amountCents, contractTaxOf(d, job), live, amountCents);
  return { subtotalCents: amountCents - taxCents, taxCents };
}
