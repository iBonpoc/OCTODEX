/**
 * Spec 24 A (founder 07.11 «сделай красиво, графики»): the «Получено» columns, the previous period, «Ждёт оплаты»
 * counts, the funnel share. Days are the company's (America/Los_Angeles in the demo), money through the engine.
 */
import { describe, expect, it } from "vitest";
import { awaitingCounts, funnelShare, prevPeriodRange, prevReceivedCents, receivedBuckets } from "../src/features/metrics";
import { setZone } from "../src/features/zone";
import type { DB, Invoice, Payment } from "../src/data/types";

setZone("America/Los_Angeles");
// Thu 2026-11-05 in Los Angeles
const TODAY = "2026-11-05";
const pay = (at: string, amountCents: number): Payment => ({ id: at + amountCents, invoiceId: "i", customerId: "c", amountCents, method: "card", at }) as Payment;
// 23:30 in LA is still that day; 00:30 the next one
const db = {
  payments: [
    pay("2026-11-05T18:00:00.000Z", 42_000), // Thu
    pay("2026-11-06T07:30:00.000Z", 10_000), // Thu 23:30 LA — still Thu
    pay("2026-11-03T18:00:00.000Z", 50_000), // Tue
    pay("2026-11-03T19:00:00.000Z", -5_000), // a refund on Tue
    pay("2026-10-30T18:00:00.000Z", 30_000), // last week Fri
    pay("2026-10-12T18:00:00.000Z", 99_900), // last month
  ],
} as Pick<DB, "payments">;

describe("receivedBuckets", () => {
  it("«Сегодня»: the last 7 days, today on the right; a refund nets out; 23:30 company time is still today", () => {
    const b = receivedBuckets(db, "today", TODAY);
    expect(b.map((x) => x.from)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(b.map((x) => x.cents)).toEqual([30_000, 0, 0, 0, 45_000, 0, 52_000]);
    expect(b.filter((x) => x.current).map((x) => x.from)).toEqual([TODAY]);
    expect(b.some((x) => x.future)).toBe(false);
  });
  it("«Неделя»: Mon…Sun; Fri–Sun are future", () => {
    const b = receivedBuckets(db, "week", TODAY);
    expect(b[0]!.from).toBe("2026-11-02");
    expect(b.map((x) => x.future)).toEqual([false, false, false, false, true, true, true]);
    expect(b[3]!.current).toBe(true);
    expect(b.reduce((s, x) => s + x.cents, 0)).toBe(97_000);
  });
  it("«Месяц»: weeks 1–7, 8–14, 15–21, 22–28, 29–30 (November); the first is current", () => {
    const b = receivedBuckets(db, "month", TODAY);
    expect(b.map((x) => `${x.from.slice(8)}–${x.to.slice(8)}`)).toEqual(["01–07", "08–14", "15–21", "22–28", "29–30"]);
    expect(b.map((x) => x.current)).toEqual([true, false, false, false, false]);
    expect(b[0]!.cents).toBe(97_000);
  });
});

describe("previous period", () => {
  it("yesterday / last week / last month", () => {
    expect(prevPeriodRange("today", TODAY)).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(prevPeriodRange("week", TODAY)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(prevPeriodRange("month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(prevReceivedCents(db, "week", TODAY)).toBe(30_000);
    expect(prevReceivedCents(db, "month", TODAY)).toBe(129_900);
  });
  it("January → December of the year before", () => {
    expect(prevPeriodRange("month", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("awaitingCounts and funnelShare", () => {
  it("open invoices and the overdue ones among them", () => {
    const now = new Date("2026-11-05T20:00:00.000Z").getTime();
    const inv = (totalCents: number, paidCents: number, dueDate: string) => ({ totalCents, paidCents, dueDate }) as Invoice;
    expect(awaitingCounts({ invoices: [inv(100, 100, "2026-10-01"), inv(100, 0, "2026-11-01"), inv(100, 50, "2026-11-20")] }, now)).toEqual({ open: 2, overdue: 1 });
  });
  it("share only when base > 0 and ≤ 100 % (separate counters of a period can give 3 signed of 1 sent)", () => {
    expect(funnelShare(1, 3)).toBe(33);
    expect(funnelShare(0, 0)).toBeUndefined();
    expect(funnelShare(3, 1)).toBeUndefined();
    expect(funnelShare(0, 4)).toBe(0);
  });
});
