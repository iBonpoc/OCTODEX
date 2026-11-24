/** «Деньги» — the overview (visual-v2 №6): the tiles, «К оплате» and «Оплачены сегодня» on the company's days. */
import { afterEach, describe, expect, it } from "vitest";
import type { DB, Estimate, Expense, Invoice, Payment } from "../src/data/types";
import { setZone } from "../src/features/zone";
import { dueWord, moneyOverview } from "../src/features/payments/overview";

const LA = "America/Los_Angeles";
afterEach(() => setZone(LA));
// noon in LA on Fri Nov 20
const NOW = Date.parse("2026-11-20T20:00:00Z");
const TODAY = "2026-11-20";

const inv = (id: string, totalCents: number, paidCents: number, dueDate: string, extra: Partial<Invoice> = {}): Invoice => ({
  id, customerId: "c1", jobId: "j1", totalCents, paidCents, dueDate, kind: "final", sentAt: "2026-11-01", ...extra,
});
const pay = (id: string, invoiceId: string, amountCents: number, at: string): Payment => ({ id, invoiceId, customerId: "c1", amountCents, method: "card", at });
const exp = (id: string, amountCents: number, at: string) => ({ id, jobId: null, vendor: "V", category: "materials", amountCents, at, memberId: "m" }) as unknown as Expense;
const est = (status: Estimate["status"], totalCents: number) => ({ status, totalCents, sentAt: status === "draft" ? undefined : "2026-11-19T18:00:00Z" }) as unknown as Estimate;

describe("moneyOverview", () => {
  setZone(LA);
  const db = {
    invoices: [
      inv("late", 184000, 0, "2026-11-11"),
      inv("soon", 96000, 0, "2026-11-23"),
      inv("part", 50000, 20000, "2026-11-20"),
      inv("paid", 24000, 24000, "2026-11-18"),
      inv("dep", 34200, 34200, "2026-11-12", { kind: "deposit" }),
    ],
    payments: [
      pay("p1", "paid", 24000, "2026-11-20T17:00:00Z"),
      pay("p2", "part", 20000, "2026-11-20T19:00:00Z"),
      pay("p3", "dep", 34200, "2026-11-12T18:00:00Z"),
      pay("old", "x", 5000, "2026-10-30T18:00:00Z"),
    ],
    advances: [],
    // the week of Nov 20 and one before it
    expenses: [exp("x1", 41260, "2026-11-20T15:00:00Z"), exp("x2", 88400, "2026-11-19T18:00:00Z"), exp("x0", 10000, "2026-11-01T18:00:00Z")],
  } as unknown as Pick<DB, "invoices" | "payments" | "advances" | "expenses">;
  const o = moneyOverview(db, [est("draft", 100000), est("sent", 50000), est("sent", 25000), est("approved", 999900), est("declined", 1)], { now: NOW, tz: LA, today: TODAY });

  it("«Должны · счета» — what is left on the live invoices, how many, how many overdue", () => {
    expect(o.owed).toEqual({ cents: 184000 + 96000 + 30000, n: 3, overdue: 1 });
  });
  it("«Сметы открыты» — the estimates in work; «ждут ответа» — the sent ones", () => {
    expect(o.estimates).toEqual({ cents: 175000, n: 3, waiting: 2 });
  });
  it("«Сегодня», «Расходы, нед.», «Задатки» on the company's day, week and month", () => {
    expect(o.today).toEqual({ cents: 44000, n: 2 });
    expect(o.expensesWeek).toEqual({ cents: 129660, n: 2 });
    expect(o.deposits).toEqual({ cents: 34200, n: 1 });
  });
  it("«К оплате» — overdue first, then the nearest due day; days to due by the company's calendar", () => {
    expect(o.toPay.map((x) => [x.inv.id, x.dueIn])).toEqual([["late", -9], ["part", 0], ["soon", 3]]);
  });
  it("«Оплачены сегодня» — newest first", () => {
    expect(o.paidToday.map((x) => x.id)).toEqual(["p2", "p1"]);
  });
  it("«Срок» — «−9 дн» bad, «сегодня», «3 дн»", () => {
    expect(dueWord(-9)).toEqual({ key: "w2m.due.late", d: 9, late: true });
    expect(dueWord(0).key).toBe("w2m.due.today");
    expect(dueWord(3)).toEqual({ key: "w2m.due.in", d: 3, late: false });
  });
});
