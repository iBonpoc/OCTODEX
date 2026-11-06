import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSeed } from "../src/data/seed";
import { pct, periodNumbers, periodRange } from "../src/features/metrics";
import type { DB } from "../src/data/types";
import { wallToInstant } from "../src/features/zone";

// moments on the company's clock (Los Angeles — the default zone): the periods are the company's days (П4b)
const at = (k: string, h = 12) => wallToInstant(k, h * 60, "America/Los_Angeles");
const TODAY = "2026-11-04"; // Wednesday

function db(): DB {
  const d = makeSeed();
  const lead = d.leads[0]!;
  const est = d.estimates[0]!;
  const pay = d.payments[0]!;
  const inv = d.invoices[0]!;
  return {
    ...d,
    leads: [
      { ...lead, id: "l1", receivedAt: at(TODAY, 0) },
      { ...lead, id: "l2", receivedAt: at("2026-11-02") }, // Monday, same week
      { ...lead, id: "l3", receivedAt: at("2026-11-01", 23) }, // Sunday: last week, same month
      { ...lead, id: "l4", receivedAt: at("2026-10-31") }, // previous month
    ],
    estimates: [
      { ...est, id: "e1", status: "approved", totalCents: 100_00, sentAt: at("2026-11-02"), approvedAt: at(TODAY, 23) },
      { ...est, id: "e2", status: "sent", totalCents: 999_99, sentAt: at(TODAY) },
      { ...est, id: "e3", status: "approved", totalCents: 50_01, sentAt: at("2026-10-20"), approvedAt: at("2026-11-30") },
      { ...est, id: "e4", status: "declined", totalCents: 70_00, sentAt: at("2026-11-08"), approvedAt: at(TODAY) },
    ],
    payments: [
      { ...pay, id: "p1", amountCents: 33_33, at: at(TODAY) },
      { ...pay, id: "p2", amountCents: 66_67, at: at("2026-11-08", 23) },
      { ...pay, id: "p3", amountCents: 1, at: at("2026-12-01", 0) },
    ],
    invoices: [
      { ...inv, id: "i1", totalCents: 500_00, paidCents: 100_00 },
      { ...inv, id: "i2", totalCents: 200_00, paidCents: 200_00 },
      { ...inv, id: "i3", totalCents: 10_00, paidCents: 12_00 }, // overpaid never makes "awaiting" negative
    ],
  };
}

describe("period numbers (Today screen)", () => {
  it("ranges: today, Monday-based week, calendar month (also across a year)", () => {
    expect(periodRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(periodRange("week", TODAY)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(periodRange("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("week", "2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(periodRange("month", "2028-02-15")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("today", () => {
    const n = periodNumbers(db(), "today", TODAY);
    expect(n).toMatchObject({ leads: 1, sent: 1, signed: 1, signedCents: 100_00, receivedCents: 33_33, payments: 1 });
    expect(n.leadToSentPct).toBe(100);
    expect(n.sentToSignedPct).toBe(100);
  });
  it("week: boundaries Monday 00:00 … Sunday 23:59, declined estimates are not signed", () => {
    const n = periodNumbers(db(), "week", TODAY);
    expect(n).toMatchObject({ leads: 2, sent: 3, signed: 1, signedCents: 100_00, receivedCents: 100_00, payments: 2 });
    expect(n.sentToSignedPct).toBe(33);
  });
  it("month", () => {
    const n = periodNumbers(db(), "month", TODAY);
    expect(n).toMatchObject({ leads: 3, sent: 3, signed: 2, signedCents: 150_01, receivedCents: 100_00 });
    expect(n.leadToSentPct).toBe(100);
    expect(n.sentToSignedPct).toBe(67);
  });
  it("awaiting = open balances only, never negative", () => {
    expect(periodNumbers(db(), "today", TODAY).awaitingCents).toBe(400_00);
  });
  it("percent: half up, zero base", () => {
    expect(pct(1, 8)).toBe(13); // 12.5
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("the numbers on «Сегодня» use the same money as the lists (list-cards chat, 05.11)", () => {
  it("«Подписано»: the option the client signed, not the estimate total (estimateListAmount)", () => {
    const d = db();
    const e1 = d.estimates.find((e) => e.id === "e1")!;
    // the client signed the cheaper option of two: 80.00, while the estimate total says 100.00
    const signed = { ...e1, approval: { optionId: "o2", addonIds: [], signerName: "Ann", signature: "M0 0", at: at(TODAY), channel: "portal" as const, totalCents: 80_00, depositCents: 0 } };
    const n = periodNumbers({ ...d, estimates: d.estimates.map((e) => (e.id === "e1" ? signed : e)) }, "today", TODAY);
    expect(n.signedCents).toBe(80_00);
  });
  it("«Ждёт оплаты»: the invoice balance of the lists (invoiceBalance); partial and overpaid", async () => {
    const { invoiceBalance } = await import("../src/features/invoiceStatus");
    const d = db();
    const n = periodNumbers(d, "today", TODAY);
    expect(n.awaitingCents).toBe(d.invoices.reduce((s, i) => s + invoiceBalance(i).owesCents, 0));
  });
});

/** e2e 51 failed on CI after 00:00 UTC: the demo signed / was paid «180 / 140 / 60 min ago» = yesterday by then, so
 *  «Сегодня» showed $0. The demo's «today» money stays today at any hour (seed todayMinutesAgo). */
describe("demo «today» money just after midnight", () => {
  afterEach(() => vi.useRealTimers());
  it("00:30 on the phone: signed and received today are still there", () => {
    vi.useFakeTimers();
    const t = new Date(); t.setHours(0, 30, 0, 0);
    vi.setSystemTime(t);
    const n = periodNumbers(makeSeed(), "today");
    expect(n.signed).toBeGreaterThan(0);
    expect(n.signedCents).toBe(518000);
    expect(n.receivedCents).toBeGreaterThan(0);
  });
});
