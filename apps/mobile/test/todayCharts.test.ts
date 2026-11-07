/**
 * Spec 24 A (founder 07.11 «сделай красиво, графики»; review #270): the «Получено» columns, the SAME span of the
 * previous period, «Ждёт оплаты» counts, the funnel share, the bar heights. Days are the company's
 * (America/Los_Angeles in the demo); money goes one engine path, so the columns of a period add up to the big number.
 * A payment's amountCents is already net of its refunds (repo.ts: amount − refunded) — the refund counts on the
 * payment's own day; a fully refunded payment is not in the list at all.
 */
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { awaitingCounts, funnelShare, periodNumbers, prevPeriodRange, prevReceivedCents, receivedBuckets, receivedIndex, receivedSoFar } from "../src/features/metrics";
import { setZone } from "../src/features/zone";
import { barHeight } from "../src/ui/chartMath";
import type { DB, Invoice, Payment } from "../src/data/types";

setZone("America/Los_Angeles");
const TZ = "America/Los_Angeles";
// Thu 2026-11-05 in Los Angeles
const TODAY = "2026-11-05";
const pay = (at: string, amountCents: number): Payment => ({ id: at + amountCents, invoiceId: "i", customerId: "c", amountCents, method: "card", at }) as Payment;
const payments = [
  pay("2026-11-05T18:00:00.000Z", 42_000), // Thu 10:00 LA
  pay("2026-11-06T07:30:00.000Z", 10_000), // Thu 23:30 LA — still Thu
  pay("2026-11-03T18:00:00.000Z", 45_000), // Tue — a $500 payment with $50 refunded: net 450 (as repo maps it)
  pay("2026-10-29T17:00:00.000Z", 30_000), // last week Thu 10:00 LA
  pay("2026-10-29T22:00:00.000Z", 7_000), // last week Thu 15:00 LA — after «this minute» (10:30)
  pay("2026-10-12T18:00:00.000Z", 99_900), // last month
];
const idx = receivedIndex(payments, TZ);
const MIN_1030 = 10 * 60 + 30;

describe("receivedBuckets", () => {
  it("«Сегодня»: the last 7 days, today on the right; 23:30 company time is still today", () => {
    const b = receivedBuckets(idx, "today", TODAY);
    expect(b.map((x) => x.from)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(b.map((x) => x.cents)).toEqual([0, 0, 0, 0, 45_000, 0, 52_000]);
    expect(b.filter((x) => x.current).map((x) => x.from)).toEqual([TODAY]);
  });
  it("«Неделя»: Mon…Sun; Fri–Sun are future", () => {
    const b = receivedBuckets(idx, "week", TODAY);
    expect(b[0]!.from).toBe("2026-11-02");
    expect(b.map((x) => x.future)).toEqual([false, false, false, false, true, true, true]);
    expect(b[3]!.current).toBe(true);
  });
  it("«Месяц»: weeks 1–7, 8–14, 15–21, 22–28, 29–30 (November); the first is current", () => {
    const b = receivedBuckets(idx, "month", TODAY);
    expect(b.map((x) => `${x.from.slice(8)}–${x.to.slice(8)}`)).toEqual(["01–07", "08–14", "15–21", "22–28", "29–30"]);
    expect(b.map((x) => x.current)).toEqual([true, false, false, false, false]);
  });
});

describe("one money path (rule 8): the big number = the columns = periodNumbers", () => {
  const db = { payments, leads: [], estimates: [], invoices: [] } as unknown as DB;
  it.each(["week", "month"] as const)("%s: the columns of the period add up to the big number", (p) => {
    const sum = receivedBuckets(idx, p, TODAY).reduce((s, x) => s + x.cents, 0);
    expect(receivedSoFar(idx, p, TODAY).cents).toBe(sum);
    expect(periodNumbers(db, p, TODAY).receivedCents).toBe(sum);
  });
  it("today: the current column = the big number = periodNumbers", () => {
    const cur = receivedBuckets(idx, "today", TODAY).find((x) => x.current)!.cents;
    expect(receivedSoFar(idx, "today", TODAY)).toEqual({ cents: 52_000, count: 2 });
    expect(cur).toBe(52_000);
    expect(periodNumbers(db, "today", TODAY).receivedCents).toBe(52_000);
  });
});

describe("previous period — the same span", () => {
  it("yesterday / last Mon…same weekday / last month 1…same day", () => {
    expect(prevPeriodRange("today", TODAY)).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(prevPeriodRange("week", TODAY)).toEqual({ from: "2026-10-26", to: "2026-10-29" });
    expect(prevPeriodRange("month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });
  it("Monday morning compares with last Monday morning, not the whole last week", () => {
    expect(prevPeriodRange("week", "2026-11-09")).toEqual({ from: "2026-11-02", to: "2026-11-02" });
  });
  it("the 31st compares with the last day of a shorter month; January → December", () => {
    expect(prevPeriodRange("month", "2026-12-31")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(prevPeriodRange("month", "2027-03-31")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(prevPeriodRange("month", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-15" });
  });
  it("the last day counts only up to this minute", () => {
    // last week Mon…Thu up to 10:30: the 10:00 payment is in, the 15:00 one is not
    expect(prevReceivedCents(idx, "week", TODAY, MIN_1030)).toBe(30_000);
    expect(prevReceivedCents(idx, "week", TODAY)).toBe(37_000);
    expect(prevReceivedCents(idx, "month", TODAY, MIN_1030)).toBe(0); // Oct 1–5: nothing
  });
});

describe("awaitingCounts, funnelShare, bar heights", () => {
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
  it("bars: proportional to the biggest; an empty or future day is only the track; $1000 vs $850 differ visibly", () => {
    const { h, barMin } = component.chart;
    expect(barHeight(100_000, 100_000)).toBe(h);
    expect(barHeight(0, 100_000)).toBe(0);
    expect(barHeight(50_000, 100_000, true)).toBe(0);
    expect(barHeight(1, 100_000)).toBeGreaterThanOrEqual(barMin);
    expect(barHeight(100_000, 100_000) - barHeight(85_000, 100_000)).toBeGreaterThanOrEqual(h * 0.14);
  });
});
