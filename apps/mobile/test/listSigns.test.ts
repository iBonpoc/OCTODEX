/** Computed signs on list cards (map §5 «вычисляемые»): when each appears and when it goes away. */
import { describe, expect, it } from "vitest";
import { timing } from "@octo/design-tokens";
import { MISSED_CALLS_MIN, estimateSigns, invoiceSigns, leadSigns, overlapSigns, visitSigns } from "@/features/listSigns";
import type { Visit } from "@/data/types";

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

describe("visit: late (П3c, one rule — schedule.ts lateKind)", () => {
  const NOW = new Date("2026-11-05T18:00:00.000Z").getTime();
  const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
  const v = (p: object) => ({ start: ago(20), step: "scheduled" as const, techId: "m1", checklist: [], ...p });
  it("appears at start + 15 min; «on the way» keeps it with its own words", () => {
    expect(visitSigns(v({ start: ago(14) }), NOW)).toEqual([]);
    expect(visitSigns(v({}), NOW)).toEqual([{ key: "late.notLeft", tone: "warn" }]);
    expect(visitSigns(v({ step: "en_route" }), NOW)).toEqual([{ key: "late.enRoute", tone: "warn" }]);
  });
  it("goes away on site, on a ticked checklist item, or with nobody on the visit", () => {
    expect(visitSigns(v({ step: "on_site" }), NOW)).toEqual([]);
    expect(visitSigns(v({ checklist: [{ id: "c", label: "x", done: true }] }), NOW)).toEqual([]);
    expect(visitSigns(v({ techId: null, assigneeIds: [] }), NOW)).toEqual([]);
  });
});

describe("visit: «Накладка» (П3c п. 8, one rule — schedule.ts overlaps)", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 6, h)).toISOString();
  const mk = (id: string, h: number, p: Partial<Visit> = {}): Visit =>
    ({ id, start: at(h), durationMin: 120, step: "scheduled", techId: "m1", checklist: [], photos: [], amountDueCents: 0, ...p }) as Visit;
  it("appears on both visits of one person that cross", () => {
    const a = mk("a", 9), b = mk("b", 10);
    const db = { visits: [a, b] };
    expect(overlapSigns(db, a)).toEqual([{ key: "card.sign.overlap", tone: "warn" }]);
    expect(overlapSigns(db, b)).toEqual([{ key: "card.sign.overlap", tone: "warn" }]);
  });
  it("not for back-to-back visits, other people, or a lone visit", () => {
    const a = mk("a", 9), b = mk("b", 11), c = mk("c", 10, { techId: "m2" });
    const db = { visits: [a, b, c] };
    expect(overlapSigns(db, a)).toEqual([]);
    expect(overlapSigns(db, c)).toEqual([]);
  });
  it("counts every assignee (several techs on one visit)", () => {
    const a = mk("a", 9, { techId: null, assigneeIds: ["m1", "m2"] }), c = mk("c", 10, { techId: "m2" });
    expect(overlapSigns({ visits: [a, c] }, c)).toEqual([{ key: "card.sign.overlap", tone: "warn" }]);
  });
  it("goes away when the other visit is done or closed; a done visit has none", () => {
    const a = mk("a", 9), b = mk("b", 10, { step: "done" }), c = mk("c", 10, { closed: true });
    expect(overlapSigns({ visits: [a, b, c] }, a)).toEqual([]);
    expect(overlapSigns({ visits: [a, b] }, b)).toEqual([]);
  });
});
