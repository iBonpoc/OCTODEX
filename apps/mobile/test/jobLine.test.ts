import { describe, expect, it } from "vitest";
import { jobLineOf } from "@/features/job/jobLine";
import type { DB } from "@/data/types";

// #3124 В1 (spec 71 §16): the line of one job from today's data — order, the current step, money for the office only
const base = (over: Partial<DB> = {}) =>
  ({
    jobs: [{ id: "j1", propertyId: "p1", title: "Bathroom", status: "in_progress", amountCents: 342_000, estimateId: "e1", customerId: "c1" }],
    cancelledJobs: [],
    estimates: [{ id: "e1", customerId: "c1", propertyId: "p1", title: "Bathroom", totalCents: 342_000, status: "approved", sentAt: "2026-11-01T10:00:00Z", approvedAt: "2026-11-02T10:00:00Z" }],
    invoices: [
      { id: "i1", customerId: "c1", jobId: "j1", kind: "deposit", totalCents: 34_200, paidCents: 34_200, dueDate: "2026-11-03", sentAt: "2026-11-02T12:00:00Z" },
      { id: "i2", customerId: "c1", jobId: "j1", kind: "final", totalCents: 307_800, paidCents: 0, dueDate: "2026-11-20", sentAt: "2026-11-15T12:00:00Z" },
    ],
    payments: [{ id: "pay1", invoiceId: "i1", customerId: "c1", amountCents: 34_200, method: "card", at: "2026-11-03T09:00:00Z" }],
    visits: [
      { id: "v1", jobId: "j1", techId: "u2", start: "2026-11-10T16:00:00Z", durationMin: 120, step: "done", scope: [], checklist: [], photos: [], amountDueCents: 0, closed: true },
      { id: "v2", jobId: "j1", techId: "u2", start: "2026-11-25T16:00:00Z", durationMin: 120, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 307_800 },
    ],
    expenses: [{ id: "x1", jobId: "j1", vendor: "Home Depot", category: "materials", amountCents: 12_345, at: "2026-11-09T18:00:00Z", memberId: "u1" }],
    purchaseOrders: [],
    ...over,
  }) as unknown as DB;

describe("jobLine (#3124 В1)", () => {
  it("steps oldest first: estimate → deposit → payment → expense → visit → final → next visit", () => {
    const line = jobLineOf(base(), "j1", true);
    expect(line.steps.map((s) => s.kind)).toEqual(["estimate", "deposit", "payment", "expense", "visit", "final", "visit"]);
  });

  it("the current step is the first one not closed (the unpaid final); later open steps wait", () => {
    const line = jobLineOf(base(), "j1", true);
    expect(line.current?.id).toBe("invoice:i2");
    expect(line.steps.filter((s) => s.state === "current")).toHaveLength(1);
    expect(line.steps.find((s) => s.id === "visit:v2")?.state).toBe("todo");
    expect(line.steps.find((s) => s.id === "estimate:e1")?.state).toBe("done");
  });

  it("an estimate not signed yet is the current step", () => {
    const line = jobLineOf(base({ estimates: [{ id: "e1", customerId: "c1", propertyId: "p1", title: "B", totalCents: 342_000, status: "sent", sentAt: "2026-11-01T10:00:00Z" }] as DB["estimates"] }), "j1", true);
    expect(line.current?.kind).toBe("estimate");
  });

  it("money for the office: total, paid net of refunds, due on open invoices (cents, via the engine)", () => {
    const line = jobLineOf(base({ payments: [{ id: "pay1", invoiceId: "i1", customerId: "c1", amountCents: 34_200, refundedCents: 4_200, method: "card", at: "2026-11-03T09:00:00Z" }] as DB["payments"] }), "j1", true);
    expect(line.money).toEqual({ totalCents: 342_000, paidCents: 30_000, dueCents: 307_800 });
    expect(line.steps.some((s) => s.kind === "refund" && s.cents === 4_200)).toBe(true);
  });

  it("the tech sees the same steps without any sum and no money block", () => {
    const line = jobLineOf(base(), "j1", false);
    expect(line.money).toBeUndefined();
    expect(line.steps.every((s) => s.cents === undefined)).toBe(true);
    expect(line.steps).toHaveLength(7);
  });

  it("a void invoice is not a step and does not count as due", () => {
    const d = base();
    d.invoices[1] = { ...d.invoices[1], status: "void" };
    const line = jobLineOf(d, "j1", true);
    expect(line.steps.some((s) => s.id === "invoice:i2")).toBe(false);
    expect(line.money?.dueCents).toBe(0);
  });

  it("a cancelled job: every step closed, no current step", () => {
    const d = base();
    d.jobs[0] = { ...d.jobs[0], cancelledAt: "2026-11-12T00:00:00Z" };
    const line = jobLineOf(d, "j1", true);
    expect(line.cancelled).toBe(true);
    expect(line.current).toBeUndefined();
    expect(line.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("an expense has no screen of its own; every other step opens its document", () => {
    const line = jobLineOf(base(), "j1", true);
    expect(line.steps.find((s) => s.kind === "expense")?.href).toBeUndefined();
    expect(line.steps.find((s) => s.kind === "payment")?.href).toBe("/receipt/pay1");
    expect(line.steps.find((s) => s.kind === "final")?.href).toBe("/invoice/i2");
  });
});
