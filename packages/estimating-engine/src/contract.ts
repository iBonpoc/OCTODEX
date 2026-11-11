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
 * invoice of the job, a deposit included — billed, paid or not). Nothing left — 0, no payment into an invoice.
 * `expectedCents` — the money in the tech's hand (what the phone showed): less than due → a partial payment of it; more
 * → due into the invoice and the rest `extraCents` kept as the client's money for the office to check (never lost).
 */
export function visitPayment(
  contractCents: number,
  invoices: (InvoiceLike & { kind?: string })[],
  expectedCents?: number,
): { amountCents: number; into: "final" | "new" | "none"; extraCents: number } {
  const live = invoices.filter((i) => !i.void);
  const fin = live.find((i) => i.kind === "final");
  const due = fin ? Math.max(0, fin.totalCents - fin.paidCents) : contractStatement(contractCents, live).toInvoice;
  const into = due > 0 ? (fin ? "final" : "new") : "none";
  if (expectedCents == null || expectedCents <= 0) return { amountCents: due, into, extraCents: 0 };
  if (expectedCents < due) return { amountCents: expectedCents, into, extraCents: 0 };
  return { amountCents: due, into, extraCents: expectedCents - due };
}
