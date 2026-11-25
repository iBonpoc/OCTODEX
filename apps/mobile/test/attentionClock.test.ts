/**
 * unit:attentionClock — #1375 / the nightly red of 20.11.2026: buildAttention takes `now`, but its lead loop asked
 * leadTurn and isBackFromSnooze without it, so a snooze and «Ответить» minutes were read by the wall clock. The test
 * attentionOrphans snoozed a lead until 20.11 17:00 UTC with NOW = 07.11 — and went red the evening of 20.11.
 * Guard: the wall clock is set far from `now`; the lead cards must be the same as by `now` alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Lead } from "../src/data/types";
import { buildAttention } from "../src/features/attention";

const NOW = Date.parse("2026-11-07T19:00:00Z");
const DAY = 86_400_000;

function withLead(extra: Partial<Lead>): DB {
  const db = makeSeed() as DB;
  const base = db.leads[0]!;
  db.leads = [{ ...base, id: "lx", name: "L x", status: "replied", assigneeId: db.me, customerId: undefined, receivedAt: "2026-11-01T17:00:00Z",
    firstResponseAt: "2026-11-01T17:05:00Z", lastInboundAt: undefined, lastOutboundAt: "2026-11-01T17:05:00Z", lastActivityAt: "2026-11-01T17:05:00Z",
    snoozedUntil: undefined, archivedAt: undefined, ...extra }];
  return db;
}
const cards = (db: DB) => buildAttention(db, "director", NOW).filter((x) => x.refId === "lx");

describe("unit:attentionClock — lead cards follow `now`, not the wall clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("snoozed until tomorrow (by now), the wall clock a month later: still snoozed, no card", () => {
    const db = withLead({ snoozedUntil: new Date(NOW + DAY).toISOString() });
    vi.setSystemTime(NOW + 30 * DAY);
    expect(cards(db)).toEqual([]);
  });
  it("snooze ended yesterday (by now), the wall clock a month earlier: «back from snooze»", () => {
    const db = withLead({ snoozedUntil: new Date(NOW - DAY).toISOString() });
    vi.setSystemTime(NOW - 30 * DAY);
    expect(cards(db).map((x) => x.kind)).toEqual(["leadBack"]);
  });
  it("a new lead 10 minutes old (by now): «Ответить» counts 10 minutes, whatever the wall clock says", () => {
    const db = withLead({ status: "new", firstResponseAt: undefined, lastOutboundAt: undefined, lastActivityAt: undefined,
      receivedAt: new Date(NOW - 10 * 60_000).toISOString() });
    vi.setSystemTime(NOW + 2 * DAY);
    const c = cards(db);
    expect(c.map((x) => x.kind)).toEqual(["lead"]);
    expect(c[0]!.params?.m).toBe(10);
  });
});
