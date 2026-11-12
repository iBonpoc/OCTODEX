/**
 * #865: the invoices of a contract on the phone — never more than the contract, the tax split inside each, Σ tax = the
 * contract's (engine canIssue / invoiceTaxShare; the server the same — t41_invoice_contract, db T196). Test prices.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { contractInvoice, contractTaxOf, voidRefusal, withTaxSplit } from "../src/features/contractInvoice";
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
  it("the deposit made at the signature and the final of a visit: split as the server splits them (review №3)", () => {
    const d0 = linesJob();
    const dep: Invoice = { id: "dep", customerId: "c1", jobId: "j3", kind: "deposit", totalCents: 5_100, paidCents: 0, dueDate: "2026-11-12" };
    const d1 = withTaxSplit({ ...d0, invoices: [...d0.invoices, dep] }, "dep");
    expect(d1.invoices.find((i) => i.id === "dep")).toMatchObject({ subtotalCents: 5_000, taxCents: 100 });
    const fin: Invoice = { id: "fin", customerId: "c1", jobId: "j3", kind: "final", totalCents: 45_900, paidCents: 0, dueDate: "2026-11-12" };
    const d2 = withTaxSplit({ ...d1, invoices: [...d1.invoices, fin] }, "fin");
    expect(d2.invoices.find((i) => i.id === "fin")).toMatchObject({ subtotalCents: 45_000, taxCents: 900 });
    // already split (the server's copy) or not an invoice of the contract: as it is
    expect(withTaxSplit(d2, "fin")).toBe(d2);
    expect(withTaxSplit(d2, "nope")).toBe(d2);
  });
  it("a standalone invoice of the job is outside the contract, as on the server (review З3: T196's $510 / $50 / $170)", () => {
    let d = linesJob();
    d = { ...d, invoices: [...d.invoices, { id: "sa", customerId: "c1", jobId: "j3", kind: "standalone", totalCents: 5_000, paidCents: 0, dueDate: "2026-11-12" }] };
    d = issue(d, 17_000);
    const job = d.jobs.find((j) => j.id === "j3")!;
    // the rest of the contract is $340 (not $290): the standalone $50 does not count
    expect(contractInvoice(d, job, 34_000)).toEqual({ subtotalCents: 33_333, taxCents: 667 });
    expect(contractInvoice(d, job, 34_001)).toBeNull();
  });
  it("the server's reading of the signed tax wins (job.contractTaxCents, review З5)", () => {
    const d = linesJob();
    const job = { ...d.jobs.find((j) => j.id === "j3")!, contractTaxCents: 2_000 };
    expect(contractTaxOf(d, job)).toBe(2_000);
  });
  it("the server's refusal above the contract (В1-4б): the card says why", () => {
    const op = { k: "invoice.issue" as const, id: "i9", jobId: "j3", customerId: "c1", kind: "progress" as const, title: "Progress", totalCents: 100, dueDate: "2026-11-12" };
    const r = rejectedOf({ id: "o1", op } as never, "the job's invoices would be more than its contract", Date.parse("2026-11-12T12:00:00Z"), null, "invoice_over_contract");
    expect(r).toMatchObject({ what: "invoice", reason: "invoice_over_contract", href: "/job/j3", amountCents: 100 });
  });
});

describe("В1-5 (#1107): who may void which invoice (as the server: tg_invoice_guard)", () => {
  const d = (paid = 0, pays: { invoiceId: string; amountCents: number }[] = []) =>
    ({ invoices: [{ id: "i", customerId: "c", jobId: "j", totalCents: 100, paidCents: paid, dueDate: "2026-11-12" }], payments: pays }) as never;
  it("the director, no payment, a reason → yes", () => expect(voidRefusal(d(), "i", "wrong amount", "director")).toBeNull());
  it("office, sales, tech → no", () => {
    for (const r of ["dispatcher", "sales", "tech"] as const) expect(voidRefusal(d(), "i", "x", r)).toBe("role");
  });
  it("paid in part, or a receipt on it → no (refund first)", () => {
    expect(voidRefusal(d(10), "i", "x", "director")).toBe("paid");
    expect(voidRefusal(d(0, [{ invoiceId: "i", amountCents: 5 }]), "i", "x", "director")).toBe("paid");
  });
  it("a payment on its way (ACH processing) → no, as on the server (review of #1203 №2)", () => {
    const x = { ...(d() as object), pendingPayments: [{ id: "pp", invoiceId: "i", customerId: "c", amountCents: 100, at: "2026-11-12" }] };
    expect(voidRefusal(x as never, "i", "x", "director")).toBe("paid");
  });
  it("no reason, or an invoice not live (already void) → no", () => {
    expect(voidRefusal(d(), "i", "   ", "director")).toBe("reason");
    expect(voidRefusal(d(), "other", "x", "director")).toBe("gone");
  });
});

describe("В1-5: the server's refusal of a void — the card says why", () => {
  it("a payment came in meanwhile: «refund first»; the person may not: «only the owner or an admin»", () => {
    const op = { k: "invoice.void" as const, id: "i9", jobId: "j3", reason: "wrong", totalCents: 100 };
    const at = Date.parse("2026-11-12T12:00:00Z");
    expect(rejectedOf({ id: "o1", op } as never, "has payments", at, null, "invoice_has_payments")).toMatchObject({ what: "invoice", href: "/invoice/i9", reason: "invoice_has_payments", labelKey: "inv.void.rej.title" });
    expect(rejectedOf({ id: "o2", op } as never, "only owner/admin", at, null, "invoice_void_forbidden")).toMatchObject({ reason: "invoice_void_forbidden" });
  });
});
