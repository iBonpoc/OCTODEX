/**
 * The invoices of a contract on the phone (#865): never more than the contract, the tax split inside — the engine's
 * canIssue / invoiceTaxShare; the server splits the tax the same (trigger t41_invoice_contract, db T196) and refuses above
 * the contract with voiding (В1-4б, #1107). Pure: the store calls
 * it (issueInvoice), test/contractInvoice.test.ts checks it. The server's numbers win once they are loaded.
 */
import { canIssue, invoiceTaxShare } from "@octo/estimating-engine";
import type { DB, ID, Invoice, Job, Role } from "@/data/types";
import { optionTotals, withAddons } from "@/features/estimateDoc";
import { linesOf, totalOf } from "@/features/jobLines";

type D = Pick<DB, "estimates" | "jobLines" | "invoices">;

/** the contract's tax: the client's signed choice (as the server's app.job_contract_tax), else the job's own lines */
export function contractTaxOf(d: D, job: Pick<Job, "id" | "estimateId" | "amountCents" | "taxEnabled" | "taxRateBps" | "contractTaxCents">): number {
  let tax = 0;
  // the server's own reading of the signed tax (repo: the approval of the job's approved version, party customer)
  if (job.contractTaxCents != null) tax = job.contractTaxCents;
  else if (job.estimateId) {
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

/** #1193 п.1: an invoice of the contract — deposit, progress or final (no kind: an older final); a standalone or
 *  recurring one is extra work outside the contract (the director 12.11) — the server's app.job_contract_billed the same */
export const isContractKind = (kind: string | undefined): boolean => kind === undefined || kind === "deposit" || kind === "progress" || kind === "final";

/** what counts against the contract: its sent deposit / progress / final invoices (a standalone one is outside it) */
export const contractInvoices = (d: Pick<DB, "invoices">, jobId: ID): Invoice[] => d.invoices.filter((i) => i.jobId === jobId && isContractKind(i.kind));

/** a new invoice of `amountCents` on the job: refused (null) above the contract; else its subtotal and tax */
export function contractInvoice(d: D, job: Pick<Job, "id" | "estimateId" | "amountCents" | "taxEnabled" | "taxRateBps" | "contractTaxCents">, amountCents: number): { subtotalCents: number; taxCents: number } | null {
  const live = contractInvoices(d, job.id).map((i) => ({ totalCents: i.totalCents, paidCents: i.paidCents, taxCents: i.taxCents }));
  if (!canIssue(job.amountCents, live, amountCents)) return null;
  const taxCents = invoiceTaxShare(job.amountCents, contractTaxOf(d, job), live, amountCents);
  return { subtotalCents: amountCents - taxCents, taxCents };
}

/**
 * an invoice the phone just made of a contract (the deposit at the signature, the final of a visit payment): its tax
 * split as the server splits it when it gets it (t41_invoice_contract) — so the reports and a refund count it the same
 * before the server's copy comes back (review of #865 №3). Another invoice or an unknown one — the DB as it is.
 */
export function withTaxSplit<T extends D & Pick<DB, "jobs">>(d: T, invoiceId: ID | undefined): T {
  const inv = invoiceId ? d.invoices.find((i) => i.id === invoiceId) : undefined;
  const job = inv ? d.jobs.find((j) => j.id === inv.jobId) : undefined;
  if (!inv || !job || inv.taxCents !== undefined || !(inv.kind === "deposit" || inv.kind === "progress" || inv.kind === "final")) return d;
  const others = contractInvoices(d, job.id).filter((i) => i.id !== inv.id).map((i) => ({ totalCents: i.totalCents, paidCents: i.paidCents, taxCents: i.taxCents }));
  const taxCents = invoiceTaxShare(job.amountCents, contractTaxOf(d, job), others, inv.totalCents);
  return { ...d, invoices: d.invoices.map((i) => (i.id === inv.id ? { ...i, subtotalCents: inv.totalCents - taxCents, taxCents } : i)) };
}

/** why an invoice may not be voided (В1-5, #1107) — the same the server checks (tg_invoice_guard): only the director
 *  (owner / admin), only a live invoice with no payment (paid or any receipt), the reason written */
export type VoidRefusal = "role" | "gone" | "paid" | "reason" | "long";
/** the longest reason the server takes (invoices_void_reason_text) */
export const VOID_REASON_MAX = 500;
export function voidRefusal(d: Pick<DB, "invoices" | "payments" | "pendingPayments">, id: ID, reason: string, role: Role): VoidRefusal | null {
  if (role !== "director") return "role";
  const inv = d.invoices.find((i) => i.id === id);
  if (!inv) return "gone";
  // a payment on its way (ACH processing) counts as a payment, as on the server (pending — review of #1203 №2)
  if (inv.paidCents > 0 || (d.payments ?? []).some((p) => p.invoiceId === id && p.amountCents > 0) || (d.pendingPayments ?? []).some((p) => p.invoiceId === id)) return "paid";
  if (!reason.trim()) return "reason";
  if (reason.trim().length > VOID_REASON_MAX) return "long";
  return null;
}
