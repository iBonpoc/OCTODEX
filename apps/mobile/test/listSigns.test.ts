/** Computed signs on list cards (map §5 «вычисляемые»): when each appears and when it goes away. */
import { describe, expect, it } from "vitest";
import { timing } from "@octo/design-tokens";
import { MISSED_CALLS_MIN, estimateSigns, invoiceSigns, leadSigns, visitSigns } from "@/features/listSigns";

const NOW = new Date("2026-11-05T15:00:00").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const day = (offset: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10) + "T12:00:00";
};

describe("estimate: no reply N days", () => {
  it("appears from estimateWarnDays (warn), turns bad at estimateBadDays", () => {
    expect(estimateSigns({ status: "sent", sentAt: ago(timing.estimateWarnDays - 1) }, NOW)).toEqual([]);
    expect(estimateSigns({ status: "sent", sentAt: ago(timing.estimateWarnDays) }, NOW)).toEqual([{ key: "att.noReplyDays", params: { d: timing.estimateWarnDays }, tone: "warn" }]);
    expect(estimateSigns({ status: "sent", sentAt: ago(timing.estimateBadDays) }, NOW)[0]!.tone).toBe("bad");
  });
  it("goes away when approved or declined", () => {
    expect(estimateSigns({ status: "approved", sentAt: ago(10) }, NOW)).toEqual([]);
    expect(estimateSigns({ status: "declined", sentAt: ago(10) }, NOW)).toEqual([]);
  });
  it("draft has no sign", () => expect(estimateSigns({ status: "draft" }, NOW)).toEqual([]));
});

describe("invoice: overdue / due soon", () => {
  const inv = (dueDate: string, paidCents = 0) => ({ totalCents: 10000, paidCents, dueDate });
  it("overdue N days after the due day (bad)", () => {
    expect(invoiceSigns(inv(day(-12)), NOW)).toEqual([{ key: "card.sign.overdueDays", params: { d: 12 }, tone: "bad" }]);
    expect(invoiceSigns(inv(day(-1)), NOW)[0]).toMatchObject({ key: "card.sign.overdueDays", params: { d: 1 } });
  });
  it("due today / tomorrow (warn), later nothing", () => {
    expect(invoiceSigns(inv(day(0)), NOW)).toEqual([{ key: "card.sign.dueToday", tone: "warn" }]);
    expect(invoiceSigns(inv(day(1)), NOW)).toEqual([{ key: "card.sign.dueTomorrow", tone: "warn" }]);
    expect(invoiceSigns(inv(day(5)), NOW)).toEqual([]);
  });
  it("goes away when fully paid; a partial payment keeps it", () => {
    expect(invoiceSigns(inv(day(-12), 10000), NOW)).toEqual([]);
    expect(invoiceSigns(inv(day(-12), 5000), NOW)).toHaveLength(1);
  });
});

describe("lead: no answer ×N", () => {
  it(`appears from ${MISSED_CALLS_MIN} missed calls on an open lead`, () => {
    expect(leadSigns({ status: "new", callAttempts: MISSED_CALLS_MIN - 1 })).toEqual([]);
    expect(leadSigns({ status: "new", callAttempts: MISSED_CALLS_MIN })).toEqual([{ key: "card.sign.missedCalls", params: { n: MISSED_CALLS_MIN }, tone: "warn" }]);
    expect(leadSigns({ status: "replied", callAttempts: 3 })[0]!.params).toEqual({ n: 3 });
  });
  it("goes away after an answered call (store resets attempts) or when the lead moves on", () => {
    expect(leadSigns({ status: "new", callAttempts: 0 })).toEqual([]);
    expect(leadSigns({ status: "booked", callAttempts: 3 })).toEqual([]);
    expect(leadSigns({ status: "lost", callAttempts: 3 })).toEqual([]);
  });
});

describe("visit: late", () => {
  it("appears while the tech has not arrived", () => {
    expect(visitSigns({ late: true, step: "scheduled" })).toEqual([{ key: "st.late", tone: "warn" }]);
    expect(visitSigns({ late: true, step: "en_route" })).toHaveLength(1);
  });
  it("goes away on arrival", () => {
    expect(visitSigns({ late: true, step: "on_site" })).toEqual([]);
    expect(visitSigns({ late: false, step: "scheduled" })).toEqual([]);
  });
});
