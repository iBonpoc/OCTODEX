/** «Счета» (one path to debts) and «Оплаты» of wave 8 — docs/specs/18-money-reports.md §7. Days are the company's (LA), not the phone's. */
import { afterEach, describe, expect, it } from "vitest";
import type { DB, Expense, Invoice, Payment } from "../src/data/types";
import { setZone } from "../src/features/zone";
import { canTakeVisitPayment, paymentRight, asInvoiceFilter, canSeeInvoiceList, canSeePayments, daysOverdue, invoiceList, matchExpense, owedGroup, paymentsIn } from "../src/features/moneyLists";

const LA = "America/Los_Angeles";
afterEach(() => setZone(LA));

const inv = (id: string, totalCents: number, paidCents: number, dueDate: string, extra: Partial<Invoice> = {}): Invoice => ({
  id, customerId: "c1", jobId: "j1", totalCents, paidCents, dueDate, ...extra,
});
// 00:30Z on Nov 6 = 4:30 PM on Nov 5 in LA: the company's day is still the 5th
const NOW = Date.parse("2026-11-06T00:30:00Z");

describe("overdue by the company's calendar", () => {
  it("due the 5th, at 00:30Z on the 6th: not overdue yet in LA", () => {
    expect(daysOverdue({ dueDate: "2026-11-05" }, NOW, LA)).toBe(0);
    expect(owedGroup(inv("a", 100, 0, "2026-11-05"), NOW, LA)).toBe("waiting");
  });
  it("due the 4th → 1 day overdue; a moment due date counts by its LA day", () => {
    expect(daysOverdue({ dueDate: "2026-11-04" }, NOW, LA)).toBe(1);
    // 2026-11-05T02:00Z is the 4th, 6 PM in LA
    expect(daysOverdue({ dueDate: "2026-11-05T02:00:00Z" }, NOW, LA)).toBe(1);
  });
  it("the same moment in New York is the 5th → due the 5th is still not overdue; in UTC it is", () => {
    expect(daysOverdue({ dueDate: "2026-11-05" }, NOW, "America/New_York")).toBe(0);
    expect(daysOverdue({ dueDate: "2026-11-05" }, NOW, "UTC")).toBe(1);
  });
  it("paid is never overdue; an overpayment is paid", () => {
    expect(owedGroup(inv("a", 100, 100, "2026-10-01"), NOW, LA)).toBe("paid");
    expect(owedGroup(inv("a", 100, 150, "2026-10-01"), NOW, LA)).toBe("paid");
  });
});

describe("invoiceList — «Не оплачен · Просрочен» by default", () => {
  const db = {
    invoices: [
      inv("late2", 30000, 0, "2026-10-20"),
      inv("late1", 10000, 2500, "2026-11-01"),
      inv("soon", 5000, 0, "2026-11-10", { customerId: "c2" }),
      inv("paid", 8000, 8000, "2026-10-01", { paidAt: "2026-10-02T18:00:00Z" }),
      inv("over", 1000, 1200, "2026-10-01", { paidAt: "2026-10-03T18:00:00Z", customerId: "c2" }),
    ],
  };
  it("counts and owed sum (= «Ждёт оплаты»: owed only, an overpayment never takes off)", () => {
    const v = invoiceList(db, "owed", { now: NOW, tz: LA });
    expect(v.counts).toEqual({ owed: 3, paid: 2, all: 5 });
    expect(v.owedCents).toBe(30000 + 7500 + 5000);
  });
  it("owed: overdue (oldest due first) → waiting; group sums are what is left", () => {
    const v = invoiceList(db, "owed", { now: NOW, tz: LA });
    expect(v.groups.map((g) => [g.g, g.items.map((i) => i.id), g.cents])).toEqual([
      ["overdue", ["late2", "late1"], 37500],
      ["waiting", ["soon"], 5000],
    ]);
  });
  it("paid: newest payment first, sum of paid", () => {
    const v = invoiceList(db, "paid", { now: NOW, tz: LA });
    expect(v.groups).toHaveLength(1);
    expect(v.groups[0]!.items.map((i) => i.id)).toEqual(["over", "paid"]);
    expect(v.groups[0]!.cents).toBe(9200);
  });
  it("one client («Должен» on the client)", () => {
    const v = invoiceList(db, "owed", { customerId: "c2", now: NOW, tz: LA });
    expect(v.counts.owed).toBe(1);
    expect(v.owedCents).toBe(5000);
  });
  it("an unknown filter in the address falls back to owed", () => {
    expect(asInvoiceFilter("x")).toBe("owed");
    expect(asInvoiceFilter("paid")).toBe("paid");
  });
});

describe("paymentsIn — by the company's day of the payment", () => {
  const pay = (id: string, at: string, amountCents: number, method: Payment["method"]): Payment => ({ id, invoiceId: "i", customerId: "c1", amountCents, method, at });
  const db = {
    payments: [
      // 01:00Z on Nov 6 = 5 PM on Nov 5 in LA → «today» when today is the 5th
      pay("p1", "2026-11-06T01:00:00Z", 5000, "zelle"),
      pay("p2", "2026-11-05T17:00:00Z", 2500, "cash"),
      pay("p3", "2026-11-03T17:00:00Z", 1000, "zelle"),
      pay("p4", "2026-10-30T17:00:00Z", 7000, "check"),
    ],
  };
  it("today (the 5th in LA): both payments of the LA day, newest first", () => {
    setZone(LA);
    const v = paymentsIn(db, "today", undefined, "2026-11-05");
    expect(v.items.map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(v.totalCents).toBe(7500);
  });
  it("week from Monday the 2nd; totals by method before the method filter", () => {
    setZone(LA);
    const v = paymentsIn(db, "week", "zelle", "2026-11-05");
    expect(v.items.map((x) => x.id)).toEqual(["p1", "p3"]);
    expect(v.totalCents).toBe(6000);
    expect(v.byMethod).toEqual([
      { key: "zelle", cents: 6000, count: 2 },
      { key: "cash", cents: 2500, count: 1 },
    ]);
  });
  it("month and all", () => {
    setZone(LA);
    expect(paymentsIn(db, "month", undefined, "2026-11-05").totalCents).toBe(8500);
    expect(paymentsIn(db, "all", undefined, "2026-11-05").totalCents).toBe(15500);
  });
});

describe("who opens the lists (13 §4)", () => {
  it("«Счета» — not the tech; «Оплаты» — owner/admin and office, not sales or tech", () => {
    expect([canSeeInvoiceList("tech"), canSeeInvoiceList("sales"), canSeeInvoiceList("dispatcher"), canSeeInvoiceList("director")]).toEqual([false, true, true, true]);
    expect([canSeePayments("tech"), canSeePayments("sales"), canSeePayments("dispatcher"), canSeePayments("director")]).toEqual([false, false, true, true]);
  });
});

describe("one path to debts: «Ждёт оплаты» on Today = «Не оплачен · Просрочен» in «Счета»", () => {
  it("the same invoices and the same sum on the demo data", async () => {
    const { makeSeed } = await import("../src/data/seed");
    const { figureItems, periodNumbers } = await import("../src/features/metrics");
    const db = makeSeed();
    const v = invoiceList(db, "owed");
    const fig = figureItems(db, "awaiting", "today");
    expect(v.owedCents).toBe(periodNumbers(db, "today").awaitingCents);
    expect(v.groups.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(fig.invoices.map((i) => i.id).sort());
    expect(v.owedCents).toBeGreaterThan(0);
  });
});

describe("the search of «Расходы» (spec 31, one rule)", () => {
  const db = {
    jobs: [{ id: "j1", propertyId: "p1", title: "Seamless gutters" }],
    properties: [{ id: "p1", customerId: "c1" }],
    customers: [{ id: "c1", name: "Mitchell" }],
    members: [{ id: "m1", name: "Alex Petrov" }],
  } as unknown as Pick<DB, "jobs" | "customers" | "properties" | "members">;
  const x = { id: "e1", vendor: "Home Depot", category: "materials", amountCents: 100, at: "2026-11-06T18:00:00.000Z", jobId: "j1", memberId: "m1" } as Expense;
  it("the vendor, the category word, the work, its client, who paid; no text — every expense", () => {
    expect(matchExpense(db, x, "")).toBe(true);
    expect(matchExpense(db, x, " home ")).toBe(true);
    expect(matchExpense(db, x, "матер", "Материалы")).toBe(true);
    expect(matchExpense(db, x, "gutters")).toBe(true);
    expect(matchExpense(db, x, "mitch")).toBe(true);
    expect(matchExpense(db, x, "petrov")).toBe(true);
    expect(matchExpense(db, x, "zzz")).toBe(false);
    expect(matchExpense(db, { ...x, jobId: null }, "mitch")).toBe(false);
  });
});

describe("unit:moneyLists — who takes a payment on an invoice (#868, 13 §4, 17)", () => {
  it("the office: any part of any invoice", () => {
    for (const role of ["director", "dispatcher"] as const) {
      expect(paymentRight(role, { kind: "final" }, { fromEstimate: false })).toBe("any");
      expect(paymentRight(role, { kind: "deposit" }, { fromEstimate: true, pendingCents: 2500 })).toBe("any");
    }
  });
  it("sales: none on an invoice (the database refuses, T191) — only the whole deposit of a deposit invoice", () => {
    const est = { fromEstimate: true };
    expect(paymentRight("sales", { kind: "final" }, est)).toBe("none");
    expect(paymentRight("sales", { kind: "progress" }, est)).toBe("none");
    expect(paymentRight("sales", { kind: undefined }, est)).toBe("none");
    expect(paymentRight("sales", { kind: "deposit" }, est)).toBe("wholeDeposit");
  });
  it("sales: a deposit invoice the office made by hand (no estimate) — none (it would be a payment of their own, 42501)", () => {
    expect(paymentRight("sales", { kind: "deposit" }, { fromEstimate: false })).toBe("none");
  });
  it("sales: a payment of the deposit on its way (ACH) — none, never paid twice (review of #1061 Б1)", () => {
    expect(paymentRight("sales", { kind: "deposit" }, { fromEstimate: true, pendingCents: 2500 })).toBe("none");
  });
});

describe("unit:moneyLists — the payment on a visit (#1061 В-2)", () => {
  it("the office and the tech take it; sales do not (record_visit_payment refuses them, T191)", () => {
    for (const r of ["director", "dispatcher", "tech"] as const) expect(canTakeVisitPayment(r)).toBe(true);
    expect(canTakeVisitPayment("sales")).toBe(false);
  });
});
