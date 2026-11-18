/**
 * #2061 (rule А, the lead 18.11): one rule for «which invoices of a job count against its contract» — deposit /
 * progress / final (no kind: an older final), as the server's app.job_contract_billed. Every place that says what is
 * still to invoice gives the same answer on the same invoices: the job screen's «Выставить остаток»
 * (contractToInvoiceCents), the limit of a new invoice (contractInvoice), the visit's «К оплате» (visitDueCents) and
 * the final invoice's PDF «less» lines. A standalone or recurring invoice is extra work: it never lowers any of them.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { makeSeed } from "../src/data/seed";
import { contractInvoice, secondFinal } from "../src/features/contractInvoice";
import { contractToInvoiceCents, restInvoiceKind } from "../src/features/contractKind";
import { visitDueCents } from "../src/features/visitDue";
import { invoiceHtml } from "../src/features/docPdf";
import { portalFromEstimate } from "../src/cloud/portal";
import type { DB, Invoice, Job } from "../src/data/types";

const JOB = "j2061";
function withInvoices(invs: Partial<Invoice>[], price = 50000): { db: DB; job: Job } {
  const db = makeSeed();
  const base = db.jobs[0]!;
  const job = { ...base, id: JOB, status: "done", amountCents: price, estimateId: undefined, contractTaxCents: 0 } as Job;
  const cust = db.invoices[0]!.customerId;
  db.jobs = [...db.jobs, job];
  db.invoices = [
    ...db.invoices,
    ...invs.map((x, n) => ({ id: `i2061-${n}`, number: `INV-${n}`, customerId: cust, jobId: JOB, totalCents: 0, paidCents: 0, dueDate: "2026-11-18", sentAt: `2026-11-1${n}T10:00:00Z`, kind: "final", ...x }) as Invoice),
  ];
  return { db, job };
}
const S = (t: number, p = 0) => ({ kind: "standalone" as const, totalCents: t, paidCents: p });
const R = (t: number) => ({ kind: "recurring" as const, totalCents: t });

/** [case, invoices, what is still to invoice on the contract, the kind the rest is issued as] */
const CASES: [string, Partial<Invoice>[], number, "final" | "progress"][] = [
  ["no invoice", [], 50000, "final"],
  ["a deposit", [{ kind: "deposit", totalCents: 15000, paidCents: 15000 }], 35000, "final"],
  ["a deposit + a progress", [{ kind: "deposit", totalCents: 15000 }, { kind: "progress", totalCents: 10000 }], 25000, "final"],
  ["a standalone $200 alone", [S(20000, 20000)], 50000, "final"],
  ["a recurring for the whole price", [R(50000)], 50000, "final"],
  ["a standalone $200 + a deposit $150", [S(20000), { kind: "deposit", totalCents: 15000 }], 35000, "final"],
  // one final per job on the server: the rest after a final is a progress invoice
  ["a partial final, half paid", [{ kind: "final", totalCents: 30000, paidCents: 15000 }], 20000, "progress"],
  // an old final issued under the old rule (price − deposit − standalone): the gap is billed as a progress invoice
  ["an old final short by a standalone", [{ kind: "deposit", totalCents: 15000 }, S(20000), { kind: "final", totalCents: 15000 }], 20000, "progress"],
  ["an older final with no kind", [{ kind: undefined, totalCents: 50000 }], 0, "progress"],
  ["overbilled (old data)", [{ kind: "deposit", totalCents: 60000 }], 0, "final"],
];

describe("#2061 one rule: the contract's own invoices", () => {
  for (const [name, invs, left, kind] of CASES) {
    it(`${name}: still to invoice ${left / 100}`, () => {
      const { db, job } = withInvoices(invs);
      // the job screen's «Выставить остаток»
      expect(contractToInvoiceCents(db, job)).toBe(left);
      expect(restInvoiceKind(db, JOB)).toBe(kind);
      // the limit of a new invoice: the rest goes through, a cent more is refused
      if (left > 0) expect(contractInvoice(db, job, left)).not.toBeNull();
      expect(contractInvoice(db, job, left + 1)).toBeNull();
      // the visit's «К оплате» with no final yet bills the same rest
      if (!invs.some((i) => i.kind === "final" || i.kind === undefined)) expect(visitDueCents(db, { jobId: JOB })).toBe(left);
    });
  }
  it("a job with no price or old data with none: 0, never NaN", () => {
    const { db, job } = withInvoices([]);
    expect(contractToInvoiceCents(db, { ...job, amountCents: 0 })).toBe(0);
    expect(contractToInvoiceCents(db, { ...job, amountCents: NaN })).toBe(0);
  });
  it("a voided invoice never counts (it lives apart, in voidInvoices)", () => {
    const { db, job } = withInvoices([]);
    const d = { ...db, voidInvoices: [{ id: "v1", customerId: db.invoices[0]!.customerId, jobId: JOB, totalCents: 50000, paidCents: 0, dueDate: "2026-11-18", kind: "final", status: "void" } as Invoice] } as DB;
    expect(contractToInvoiceCents(d, job)).toBe(50000);
  });
  it("the final's PDF: «less» lists the contract's earlier invoices, not a standalone one", () => {
    const { db } = withInvoices([{ kind: "deposit", totalCents: 15000, title: "Deposit 2061" }, { ...S(20000), title: "Extra 2061" }, { kind: "final", totalCents: 35000, title: "Final 2061" }]);
    const fin = db.invoices.find((i) => i.title === "Final 2061")!;
    const company = portalFromEstimate(db, { ...db.estimates[0]!, customerId: fin.customerId }, "Acme").company;
    const html = invoiceHtml(db, fin, company, { lang: "en" });
    expect(html).toContain("Deposit 2061");
    expect(html).not.toContain("Extra 2061");
  });
  it("a standalone invoice's PDF has no «Contract» line — extra work is outside the contract", () => {
    const { db } = withInvoices([{ ...S(20000), title: "Extra 2061" }]);
    const inv = db.invoices.find((i) => i.title === "Extra 2061")!;
    const company = portalFromEstimate(db, { ...db.estimates[0]!, customerId: inv.customerId }, "Acme").company;
    expect(invoiceHtml(db, inv, company, { lang: "en" })).not.toContain("$500.00");
  });
  it("an older final with no kind lists the contract's earlier invoices as «less»", () => {
    const { db } = withInvoices([{ kind: "deposit", totalCents: 15000, title: "Deposit 2061" }, { kind: undefined, totalCents: 35000, title: "Old final 2061" }]);
    const fin = db.invoices.find((i) => i.title === "Old final 2061")!;
    const company = portalFromEstimate(db, { ...db.estimates[0]!, customerId: fin.customerId }, "Acme").company;
    expect(invoiceHtml(db, fin, company, { lang: "en" })).toContain("Deposit 2061");
  });
  it("one live final per job, as the server's unique index: a second final is refused, a progress is not", () => {
    const none = withInvoices([{ kind: "deposit", totalCents: 15000 }]);
    expect(secondFinal(none.db, JOB, "final")).toBe(false);
    const one = withInvoices([{ kind: "final", totalCents: 30000 }]);
    expect(secondFinal(one.db, JOB, "final")).toBe(true);
    expect(secondFinal(one.db, JOB, "progress")).toBe(false);
    // another job's final does not count
    expect(secondFinal(one.db, "other-job", "final")).toBe(false);
    // the rest after a final is issued as a progress invoice (restInvoiceKind), so it is never refused by this rule
    expect(secondFinal(one.db, JOB, restInvoiceKind(one.db, JOB))).toBe(false);
  });
});
