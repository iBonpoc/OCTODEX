/**
 * #865: the invoices of a contract on the phone — never more than the contract, the tax split inside each, Σ tax = the
 * contract's (engine canIssue / invoiceTaxShare; the server the same — t41_invoice_contract, db T196). Test prices.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { contractInvoice, contractTaxOf } from "../src/features/contractInvoice";
import { newDoc, optionTotals } from "../src/features/estimateDoc";
import { withJobLine, withJobTax } from "../src/features/jobLines";
import { rejectedOf } from "../src/data/outboxRejected";
import type { DB, EstimateDoc, Invoice } from "../src/data/types";

/** a job of its own lines: $400 labor + $100 taxable part, 10% → $510 with $10 tax (the same as db T196) */
function linesJob(): DB {
  let d: DB = makeSeed();
  d = withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Labor", quantity: "2", unitPriceCents: 20_000, taxable: false });
  d = withJobLine(d, { id: "l2", jobId: "j3", position: 1, name: "Part", quantity: "1", unitPriceCents: 10_000, taxable: true });
  return withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 1000 });
}
const issue = (d: DB, amount: number): DB => {
  const job = d.jobs.find((j) => j.id === "j3")!;
  const split = contractInvoice(d, job, amount);
  if (!split) throw new Error("refused");
  const inv: Invoice = { id: `i${d.invoices.length}`, customerId: "c1", jobId: "j3", kind: "progress", totalCents: amount, ...split, paidCents: 0, dueDate: "2026-11-12" };
  return { ...d, invoices: [...d.invoices, inv] };
};

describe("#865 contract invoices on the phone", () => {
  it("a job of its own lines: the contract's tax is its lines' tax", () => {
    const d = linesJob();
    const job = d.jobs.find((j) => j.id === "j3")!;
    expect(job.amountCents).toBe(51_000);
    expect(contractTaxOf(d, job)).toBe(1_000);
  });
  it("$170 then the rest: $3.33 + $6.67 tax — the same numbers as the server (T196), Σ = $10", () => {
    let d = issue(linesJob(), 17_000);
    expect(d.invoices.at(-1)).toMatchObject({ subtotalCents: 16_667, taxCents: 333 });
    d = issue(d, 34_000);
    expect(d.invoices.at(-1)).toMatchObject({ subtotalCents: 33_333, taxCents: 667 });
    const mine = d.invoices.filter((i) => i.jobId === "j3");
    expect(mine.reduce((s, i) => s + (i.taxCents ?? 0), 0)).toBe(1_000);
  });
  it("one cent above the contract is refused before the store writes anything", () => {
    const d = linesJob();
    const job = d.jobs.find((j) => j.id === "j3")!;
    expect(contractInvoice(d, job, 51_001)).toBeNull();
    expect(contractInvoice(issue(d, 51_000), job, 1)).toBeNull();
  });
  it("an invoice without a kind (older rows) counts as the contract's, as before", () => {
    const d0 = linesJob();
    const d: DB = { ...d0, invoices: [...d0.invoices, { id: "x", customerId: "c1", jobId: "j3", kind: undefined, totalCents: 1, paidCents: 0, dueDate: "2026-11-12" }] };
    expect(contractInvoice(d, d.jobs.find((j) => j.id === "j3")!, 51_000)).toBeNull();
  });
  it("a job from an estimate: the signed choice's tax (as the server keeps it), else the document's count", () => {
    const d0 = makeSeed();
    const doc: EstimateDoc = newDoc();
    doc.settings.tax = { ...doc.settings.tax, enabled: true, rateBps: 950, groups: { ...doc.settings.tax.groups, material: true } };
    doc.options[0]!.lines = [{ id: "a", group: "material", name: "Pipe", quantity: "2", unitPriceCents: 10_000 } as never];
    const t = optionTotals(doc, doc.options[0]!);
    const approval = { optionId: doc.options[0]!.id, addonIds: [], signerName: "Ann", signature: "M0 0", at: "2026-11-12", channel: "on_site" as const, totalCents: t.total, depositCents: t.deposit };
    const job = { ...d0.jobs.find((j) => j.id === "j1")!, amountCents: t.total };
    const withEst = (a: typeof approval & { taxCents?: number }): DB => ({ ...d0, estimates: d0.estimates.map((e) => (e.id === job.estimateId ? { ...e, doc, approval: a } : e)) });
    expect(contractTaxOf(withEst(approval), job)).toBe(t.tax);
    expect(t.tax).toBe(1_900);
    expect(contractTaxOf(withEst({ ...approval, taxCents: 1_234 }), job)).toBe(1_234);
  });
  it("the server's refusal above the contract: the card says why", () => {
    const op = { k: "invoice.issue" as const, id: "i9", jobId: "j3", customerId: "c1", kind: "progress" as const, title: "Progress", totalCents: 100, dueDate: "2026-11-12" };
    const r = rejectedOf({ id: "o1", op } as never, "the job's invoices would be more than its contract", Date.parse("2026-11-12T12:00:00Z"), null, "invoice_over_contract");
    expect(r).toMatchObject({ what: "invoice", reason: "invoice_over_contract", href: "/job/j3", amountCents: 100 });
  });
});
