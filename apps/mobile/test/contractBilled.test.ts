/**
 * unit:contractBilled — #1193 п.1: what a payment on a visit takes counts the contract's own invoices only (deposit,
 * progress, final; an older one with no kind is a final). A standalone or recurring invoice of the job is extra work
 * outside the contract (the director 12.11) — it never eats the contract's rest. The server the same (db T204,
 * app.job_contract_billed). Test prices.
 */
import { describe, expect, it } from "vitest";
import { contractInvoices, isContractKind } from "../src/features/contractInvoice";
import { visitDueCents } from "../src/features/visitDue";
import { lineChangeRefusal, withJobLine } from "../src/features/jobLines";
import { makeSeed } from "../src/data/seed";
import type { DB, Invoice } from "../src/data/types";

const inv = (id: string, kind: Invoice["kind"], totalCents: number, paidCents = 0) =>
  ({ id, number: id, title: id, kind, customerId: "c", jobId: "j", totalCents, paidCents, dueDate: "2026-11-12" }) as Invoice;
const db = (invoices: Invoice[]) => ({ jobs: [{ id: "j", amountCents: 100000 }], invoices }) as unknown as Pick<DB, "jobs" | "invoices">;

describe("unit:contractBilled", () => {
  it("the kinds of the contract", () => {
    expect(["deposit", "progress", "final", undefined].map((k) => isContractKind(k))).toEqual([true, true, true, true]);
    expect(["standalone", "recurring"].map((k) => isContractKind(k))).toEqual([false, false]);
  });
  it("a standalone invoice does not eat the contract's rest: a visit with no final bills $1000 − $200 deposit = $800", () => {
    const d = db([inv("dep", "deposit", 20000, 20000), inv("extra", "standalone", 30000)]);
    expect(contractInvoices(d, "j").map((i) => i.id)).toEqual(["dep"]);
    expect(visitDueCents(d, { jobId: "j" })).toBe(80000);
  });
  it("a final of the contract takes its own balance; a standalone «final» on the side changes nothing", () => {
    expect(visitDueCents(db([inv("fin", "final", 80000, 30000), inv("extra", "standalone", 30000)]), { jobId: "j" })).toBe(50000);
    expect(visitDueCents(db([inv("rec", "recurring", 100000)]), { jobId: "j" })).toBe(100000);
  });
});

describe("unit:contractBilled — the job's own lines held up only by the contract's invoices (the server's t19, T204)", () => {
  // test prices: the job j3 of the demo, one line of $1000, lowered to $250
  const setUp = (extra: Invoice) => {
    let d = makeSeed();
    d = withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Work", quantity: "1", unitPriceCents: 100000, taxable: false });
    return { ...d, invoices: [...d.invoices.filter((i) => i.jobId !== "j3"), { ...extra, jobId: "j3" }] };
  };
  const lowered = (d: ReturnType<typeof setUp>) => withJobLine(d, { id: "l1", jobId: "j3", position: 0, name: "Work", quantity: "1", unitPriceCents: 25000, taxable: false });
  it("a standalone invoice of $500 (extra work): the contract may go down to $250", () => {
    const d = setUp(inv("extra", "standalone", 50000));
    expect(lineChangeRefusal(d, lowered(d), "j3")).toBeNull();
  });
  it("a deposit of $300 (the contract's): not below it — refused", () => {
    const d = setUp(inv("dep", "deposit", 30000));
    expect(lineChangeRefusal(d, lowered(d), "j3")).toBe("belowInvoiced");
  });
});
