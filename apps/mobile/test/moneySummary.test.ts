/** «Деньги» of prototype v2 (#2350): the four tiles and the invoice's one main step by its state (object-cards «Счёт»). */
import { afterEach, describe, expect, it } from "vitest";
import type { DB, Invoice, Job, Payment } from "../src/data/types";
import { setZone } from "../src/features/zone";
import { invoiceStep, moneySummary, remindAll } from "../src/features/invoice/moneySummary";

const LA = "America/Los_Angeles";
afterEach(() => setZone(LA));
// noon in LA on Nov 20
const NOW = Date.parse("2026-11-20T20:00:00Z");
const TODAY = "2026-11-20";

const inv = (id: string, totalCents: number, paidCents: number, dueDate: string, extra: Partial<Invoice> = {}): Invoice => ({
  id, customerId: "c1", jobId: "j1", totalCents, paidCents, dueDate, kind: "final", sentAt: "2026-11-01", ...extra,
});
const pay = (id: string, amountCents: number, at: string): Payment => ({ id, invoiceId: "x", customerId: "c1", amountCents, method: "cash", at });
const job = (id: string, amountCents: number) => ({ id, amountCents }) as unknown as Job;

describe("moneySummary — the four tiles", () => {
  const db = {
    invoices: [
      inv("over", 184000, 0, "2026-11-11"),
      inv("part", 50000, 20000, "2026-11-10"),
      inv("wait", 96000, 0, "2026-11-23"),
      inv("paid", 24000, 24000, "2026-11-18", { jobId: "j2" }),
    ],
    payments: [pay("p1", 24000, "2026-11-19T18:00:00Z"), pay("p2", 7800, "2026-11-02T18:00:00Z"), pay("old", 5000, "2026-10-30T18:00:00Z")],
    advances: [],
    jobs: [job("j1", 400000), job("j2", 24000), job("j3", 0)],
  } as unknown as Pick<DB, "invoices" | "payments" | "advances" | "jobs">;
  const s = moneySummary(db, { now: NOW, tz: LA, today: TODAY });
  it("overdue and waiting split what is owed, never twice; a part paid counts its balance", () => {
    expect(s.overdue).toEqual({ cents: 184000 + 30000, n: 2 });
    expect(s.waiting).toEqual({ cents: 96000, n: 1 });
  });
  it("received — this month's payments only", () => {
    expect(s.received).toEqual({ cents: 31800, n: 2 });
  });
  it("still to bill — each job's contract less its contract invoices; a fully billed or empty job adds nothing", () => {
    expect(s.toBill).toEqual({ cents: 400000 - 184000 - 50000 - 96000, n: 1 });
  });
  it("a standalone invoice does not cover the contract", () => {
    const x = moneySummary({ ...db, invoices: [inv("s", 100000, 0, "2026-11-30", { kind: "standalone" })], jobs: [job("j1", 100000)] }, { now: NOW, tz: LA, today: TODAY });
    expect(x.toBill.cents).toBe(100000);
  });
});

describe("invoiceStep — состояние → главная кнопка", () => {
  const all = { send: true, remind: true, pay: true };
  it("not sent → send; sent, not due → take a payment; overdue → remind; paid → none", () => {
    expect(invoiceStep(inv("a", 100, 0, "2026-11-30", { sentAt: undefined }), all, NOW, LA)).toBe("send");
    expect(invoiceStep(inv("a", 100, 0, "2026-11-30"), all, NOW, LA)).toBe("pay");
    expect(invoiceStep(inv("a", 100, 0, "2026-11-11"), all, NOW, LA)).toBe("remind");
    expect(invoiceStep(inv("a", 100, 100, "2026-11-11"), all, NOW, LA)).toBe("none");
  });
  it("the tech (no send, no remind) takes the payment even when overdue or not sent", () => {
    const tech = { send: false, remind: false, pay: true };
    expect(invoiceStep(inv("a", 100, 0, "2026-11-11"), tech, NOW, LA)).toBe("pay");
    expect(invoiceStep(inv("a", 100, 0, "2026-11-30", { sentAt: undefined }), tech, NOW, LA)).toBe("pay");
  });
  it("nobody may take it here (sales, not a deposit) — remind if possible, else no button", () => {
    expect(invoiceStep(inv("a", 100, 0, "2026-11-30"), { send: false, remind: true, pay: false }, NOW, LA)).toBe("remind");
    expect(invoiceStep(inv("a", 100, 0, "2026-11-30"), { send: false, remind: false, pay: false }, NOW, LA)).toBe("none");
  });
});

describe("remindAll — «Напомнить всем · N»", () => {
  it("overdue and reachable only, in the order given", () => {
    const xs = [inv("a", 100, 0, "2026-11-11", { customerId: "c1" }), inv("b", 100, 0, "2026-11-12", { customerId: "c2" }), inv("c", 100, 0, "2026-11-30"), inv("d", 100, 100, "2026-11-01")];
    expect(remindAll(xs, (c) => c === "c1", NOW, LA).map((i) => i.id)).toEqual(["a"]);
    expect(remindAll(xs, () => true, NOW, LA).map((i) => i.id)).toEqual(["a", "b"]);
  });
});
