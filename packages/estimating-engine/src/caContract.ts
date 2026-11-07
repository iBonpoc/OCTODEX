/**
 * Two rules of a job made without an estimate (docs/specs/17-job.md §11.1, «Работы и выезды» 3b-2).
 *
 * 1. California home improvement (B&P §7159; 13-app-structure §3.4 «Закон CA»): work over $500 on a home needs a
 *    written contract. The app WARNS (15-flows §4 q.5, decision 07.11): a CA company, a property that is not
 *    commercial (an empty kind and HOA common areas are warned too — safer), no estimate, the total of the job's own
 *    lines above $500.00. Exactly $500.00 is not «over».
 * 2. The lines of a job may not bring its total below what is already invoiced (live, not void): the balance would go
 *    negative. The database refuses the same (trigger t19_job_total_floor, db T69).
 */
import type { InvoiceLike } from "./contract.js";

/** $500.00 — the B&P §7159 threshold, in cents */
export const CA_WRITTEN_CONTRACT_THRESHOLD_CENTS = 50_000;

export type PropertyKindLike = "single_family" | "multi_family" | "commercial" | "hoa_common" | string | null | undefined;

export interface CaContractInput {
  /** the company's state, as stored (any case; "CA" matters) */
  companyState: string | null | undefined;
  propertyKind: PropertyKindLike;
  hasEstimate: boolean;
  /** the job's total from its own lines (jobLinesTotals().total) */
  totalCents: number;
}

export function caWrittenContractRequired(x: CaContractInput): boolean {
  if ((x.companyState ?? "").trim().toUpperCase() !== "CA") return false;
  if (x.propertyKind === "commercial") return false;
  if (x.hasEstimate) return false;
  return x.totalCents > CA_WRITTEN_CONTRACT_THRESHOLD_CENTS;
}

/** the live (not void) invoiced sum of a job */
export const invoicedCents = (invoices: Pick<InvoiceLike, "totalCents" | "void">[]): number =>
  invoices.filter((i) => !i.void).reduce((s, i) => s + i.totalCents, 0);

/** true when a new total of the job's lines would be below what is already invoiced — the change is refused */
export function jobLinesBelowInvoiced(newTotalCents: number, invoices: Pick<InvoiceLike, "totalCents" | "void">[]): boolean {
  return newTotalCents < invoicedCents(invoices);
}
