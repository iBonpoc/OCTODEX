/**
 * #1193 п.1: which invoices of a job are the contract's — its own module, so the job's lines (jobLines.ts) and the
 * contract's invoices (contractInvoice.ts) read the same rule without importing each other.
 */
import type { DB, ID, Invoice } from "@/data/types";

/** #1193 п.1: an invoice of the contract — deposit, progress or final (no kind: an older final); a standalone or
 *  recurring one is extra work outside the contract (the director 12.11) — the server's app.job_contract_billed the same */
export const isContractKind = (kind: string | undefined): boolean => kind === undefined || kind === "deposit" || kind === "progress" || kind === "final";

/** what counts against the contract: its sent deposit / progress / final invoices (a standalone one is outside it) */
export const contractInvoices = (d: Pick<DB, "invoices">, jobId: ID): Invoice[] => d.invoices.filter((i) => i.jobId === jobId && isContractKind(i.kind));
