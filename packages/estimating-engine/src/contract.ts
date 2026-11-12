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

/**
 * Client money on the client card (docs/specs/04 §2): "owes" = unpaid part of the client's live invoices;
 * "paid total" = all payments (net of refunds) over the client's lifetime; "invoiced" = all live invoices ever issued.
 * Integer cents, never negative.
 */
export function clientMoney(
  invoices: InvoiceLike[],
  paymentsNetCents: number[],
): { owesCents: number; paidTotalCents: number; invoicedCents: number } {
  const live = invoices.filter((i) => !i.void);
  const owesCents = live.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const invoicedCents = live.reduce((s, i) => s + i.totalCents, 0);
  const paidTotalCents = Math.max(0, paymentsNetCents.reduce((s, p) => s + p, 0));
  return { owesCents, paidTotalCents, invoicedCents };
}

/**
 * What a payment on a visit takes (#757, audit B-02 / B-05 / A-17) — the same rule as the server's
 * public.record_visit_payment (migration 20261111060000, tests T180–T181): the job's live final invoice with a balance takes
 * the payment for its balance; with no final invoice, a new final one bills what is not yet billed (contract − every live
 * invoice of the job, a deposit included — billed, paid or not). Nothing left — 0.
 * `expectedCents` — the money in the tech's hand (what the phone showed): less than due → a partial payment of it; more
 * than due (or nothing due) → `overCents` > 0: the server refuses (never another amount silently, review #857 О1) and the
 * tech is told to hand the payment to the office.
 */
export function visitPayment(
  contractCents: number,
  invoices: (InvoiceLike & { kind?: string })[],
  expectedCents?: number,
): { amountCents: number; into: "final" | "new" | "none"; overCents: number } {
  const live = invoices.filter((i) => !i.void);
  const fin = live.find((i) => i.kind === "final");
  const due = fin ? Math.max(0, fin.totalCents - fin.paidCents) : contractStatement(contractCents, live).toInvoice;
  const into = due > 0 ? (fin ? "final" : "new") : "none";
  if (expectedCents == null || expectedCents <= 0) return { amountCents: due, into, overCents: 0 };
  if (expectedCents <= due) return { amountCents: expectedCents, into, overCents: 0 };
  return { amountCents: 0, into, overCents: expectedCents - due };
}

/**
 * #865 (X-03): may an invoice of `amountCents` be issued on this contract — Σ live invoices (void ones do not count) plus
 * it never more than the contract. The server refuses the same from В1-4б (hint invoice_over_contract, with voiding #1107).
 */
export function canIssue(contractCents: number, invoices: InvoiceLike[], amountCents: number): boolean {
  if (!(amountCents > 0)) return false;
  const invoiced = invoices.filter((i) => !i.void).reduce((s, i) => s + i.totalCents, 0);
  return invoiced + amountCents <= contractCents;
}

/**
 * #865 (X-01, X-02): the tax inside an invoice of a contract. The contract total already holds the tax; an invoice keeps
 * its total and splits it into subtotal + tax: tax = round half up (amount × contract tax / contract). The invoice that
 * bills the rest of the contract takes what is left of the tax, so the invoices' tax adds up to the contract's.
 * Never below 0, never above the invoice or the tax still left. The server counts the same (app.invoice_tax_share,
 * migration 20261112060000); tests: engine contract.test.ts, db T196.
 */
export function invoiceTaxShare(
  contractCents: number,
  contractTaxCents: number,
  invoices: (InvoiceLike & { taxCents?: number })[],
  amountCents: number,
): number {
  if (!(contractCents > 0) || !(contractTaxCents > 0) || !(amountCents > 0)) return 0;
  const live = invoices.filter((i) => !i.void);
  const invoiced = live.reduce((s, i) => s + i.totalCents, 0);
  const left = Math.max(0, contractTaxCents - live.reduce((s, i) => s + (i.taxCents ?? 0), 0));
  const share = invoiced + amountCents >= contractCents ? left : roundCents(dec(amountCents).mul(contractTaxCents).div(contractCents));
  return Math.max(0, Math.min(share, left, amountCents));
}
