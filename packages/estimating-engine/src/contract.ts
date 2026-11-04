import { dec, roundCents } from "./decimal.js";

/**
 * Contract statement (docs/13 §5): the signed estimate is the contract; invoices bill parts of it
 * (deposit → progress → final balance); each invoice takes any number of partial payments.
 */
export interface InvoiceLike {
  totalCents: number;
  paidCents: number;
  void?: boolean;
}

export interface ContractStatement {
  contract: number;
  /** Σ non-void invoice totals */
  invoiced: number;
  /** Σ payments on those invoices */
  paid: number;
  /** contract − invoiced (what is still to bill; ≥ 0) */
  toInvoice: number;
  /** invoiced − paid (what clients owe on issued invoices; ≥ 0) */
  due: number;
  /** contract − paid */
  remaining: number;
}

export function contractStatement(contractCents: number, invoices: InvoiceLike[]): ContractStatement {
  const live = invoices.filter((i) => !i.void);
  const invoiced = live.reduce((s, i) => s + i.totalCents, 0);
  const paid = live.reduce((s, i) => s + Math.min(i.paidCents, i.totalCents), 0);
  return {
    contract: contractCents,
    invoiced,
    paid,
    toInvoice: Math.max(0, contractCents - invoiced),
    due: Math.max(0, invoiced - paid),
    remaining: Math.max(0, contractCents - paid),
  };
}

/** Progress invoice as a share of the contract (basis points), never more than what is left to bill. */
export function progressAmount(contractCents: number, alreadyInvoiced: number, bps: number): number {
  const want = roundCents(dec(contractCents).mul(bps).div(10000));
  return Math.max(0, Math.min(want, contractCents - alreadyInvoiced));
}

/** A payment can't exceed the invoice balance; returns the accepted amount (0 if nothing is due). */
export const acceptPayment = (invoice: InvoiceLike, amountCents: number): number =>
  Math.max(0, Math.min(amountCents, invoice.totalCents - invoice.paidCents));
