/**
 * #857 review №1: the visit screen, its toast, the cards and payVisit read one amount (features/visitDue.ts → engine
 * visitPayment) — the numbers of e2e 230 and supabase/tests T180 (test prices).
 */
import { describe, expect, it } from "vitest";
import { visitDueCents } from "../src/features/visitDue";

const job = (id: string, amountCents: number) => ({ id, amountCents }) as never;
const inv = (jobId: string, kind: "deposit" | "final", totalCents: number, paidCents: number) =>
  ({ id: `${jobId}-${kind}`, customerId: "c", jobId, kind, totalCents, paidCents, dueDate: "2026-11-11" }) as never;

describe("visitDueCents", () => {
  it("a final invoice part paid: its balance", () => {
    expect(visitDueCents({ jobs: [job("a", 50000)], invoices: [inv("a", "final", 50000, 20000)] }, { jobId: "a" })).toBe(30000);
  });
  it("a deposit billed, not paid: the contract less the deposit (not the contract less what was paid)", () => {
    expect(visitDueCents({ jobs: [job("b", 50000)], invoices: [inv("b", "deposit", 15000, 0)] }, { jobId: "b" })).toBe(35000);
  });
  it("another job's invoices do not count; an inspection takes nothing", () => {
    expect(visitDueCents({ jobs: [job("c", 50000)], invoices: [inv("x", "final", 50000, 0)] }, { jobId: "c" })).toBe(50000);
    expect(visitDueCents({ jobs: [], invoices: [] }, { jobId: undefined })).toBe(0);
  });
});
