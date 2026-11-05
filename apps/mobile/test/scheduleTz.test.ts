/**
 * П4a (docs/specs/03 «П4 — этап 0», решение 6): «today» and «tomorrow» are the company's calendar days, not the phone's.
 * The phone is in New York, the company in Los Angeles (3 h behind). Before the fix these cases went by the phone.
 * Node reads TZ when a date is used, so the zone is set before any Date below.
 */
const phoneTz = process.env.TZ;
process.env.TZ = "America/New_York";
import { afterAll, describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { lateNotices, noticeTime } from "../src/features/lateNotice";
import { lateToday, sameDayIn } from "../src/features/schedule";
import { makeSeed } from "../src/data/seed";
import type { DB, Visit } from "../src/data/types";

// other test files in the same worker keep the machine's zone
afterAll(() => {
  if (phoneTz === undefined) delete process.env.TZ;
  else process.env.TZ = phoneTz;
});

const LA = "America/Los_Angeles";
const base = makeSeed();
const pid = base.properties[0]!.id;
const V = (id: string, p: Partial<Visit>): Visit => ({ id, propertyId: pid, techId: "m-ivan", assigneeIds: ["m-ivan"], start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
const company = (p: Partial<NonNullable<DB["company"]>> = {}) => ({ ...base.company!, timezone: LA, ...p });
const run = (visits: Visit[], now: number, c = company()) => buildAttention({ ...base, company: c, visits } as DB, "director", now);
const visitItems = (visits: Visit[], now: number, c = company()) => run(visits, now, c).filter((i) => i.kind === "unassigned" || i.kind === "late");

describe("the company's day, not the phone's (phone New York, company Los Angeles)", () => {
  it("the test really runs with the phone in New York", () => {
    expect(new Date("2026-11-06T04:30:00.000Z").getHours()).toBe(23); // 11:30 PM Nov 5 in New York (EST)
    expect(sameDayIn("2026-11-06T05:30:00.000Z", "2026-11-06T04:30:00.000Z", LA)).toBe(true); // 9:30 PM and 8:30 PM in LA
  });
  it("«Не назначено» today: the visit is tomorrow only by the phone (bug: it said «завтра»)", () => {
    const now = new Date("2026-11-06T04:30:00.000Z").getTime(); // LA 8:30 PM Nov 5; NY 11:30 PM
    const v = V("x", { techId: null, assigneeIds: [], start: "2026-11-06T05:30:00.000Z" }); // LA 9:30 PM Nov 5; NY 12:30 AM Nov 6
    const [i] = visitItems([v], now);
    expect(i?.label).toBe("att.unassigned");
  });
  it("«Не назначено · завтра»: tomorrow of the company, the day after by the phone (bug: it was missing)", () => {
    const now = new Date("2026-11-06T06:00:00.000Z").getTime(); // LA 10 PM Nov 5; NY 1 AM Nov 6
    const v = V("y", { techId: null, assigneeIds: [], start: "2026-11-07T07:30:00.000Z" }); // LA 11:30 PM Nov 6; NY 2:30 AM Nov 7
    const [i] = visitItems([v], now);
    expect(i?.label).toBe("late.unassignedTomorrow");
  });
  it("«Опаздывает» only on the company's today: an 11:50 PM visit is gone after the company's midnight", () => {
    const now = new Date("2026-11-06T08:05:00.000Z").getTime(); // LA 12:05 AM Nov 6; NY 3:05 AM Nov 6
    const v = V("z", { start: "2026-11-06T07:50:00.000Z" }); // LA 11:50 PM Nov 5; NY 2:50 AM Nov 6 — same phone day
    expect(lateToday(v, now, { lateAfterMin: 15 }, LA)).toBeNull();
    expect(visitItems([v], now)).toEqual([]);
    expect(lateNotices({ ...base, company: company(), visits: [v] } as DB, "director", now)).toEqual([]);
  });
  it("the threshold is the company's: late after 30, not 15", () => {
    const now = new Date("2026-11-05T20:00:00.000Z").getTime(); // LA noon
    const v16 = V("a", { start: new Date(now - 16 * 60_000).toISOString() });
    const v30 = V("b", { start: new Date(now - 30 * 60_000).toISOString() });
    const c = company({ scheduleSettings: { lateAfterMin: 30 } });
    expect(visitItems([v16, v30], now, c).map((i) => i.refId)).toEqual(["b"]);
    expect(visitItems([v16], now).map((i) => i.refId)).toEqual(["a"]);
    expect(lateNotices({ ...base, company: c, visits: [v16, v30] } as DB, "director", now).map((n) => n.visitId)).toEqual(["b"]);
  });
  it("«срок сметы истёк» by the company's day and the given now (bug: the phone's real clock)", () => {
    const e0 = base.estimates[0]!;
    const est = { ...e0, status: "sent" as const, validUntil: "2026-11-05", sentAt: "2026-11-04T18:00:00.000Z", linkRevokedAt: undefined };
    const items = (now: number) => buildAttention({ ...base, company: company(), estimates: [est], visits: [] } as DB, "director", now).filter((i) => i.refId === est.id);
    // LA 10 PM Nov 5 (NY 1 AM Nov 6): the last valid day is still on
    expect(items(new Date("2026-11-06T06:00:00.000Z").getTime()).some((i) => i.kind === "estimateExpired")).toBe(false);
    // LA 1 AM Nov 6: expired
    expect(items(new Date("2026-11-06T09:00:00.000Z").getTime()).some((i) => i.kind === "estimateExpired")).toBe(true);
  });
  it("the time in «running late» is the company's clock; other notices keep the phone's", () => {
    const iso = "2026-11-05T22:10:00.000Z";
    expect(noticeTime({ kind: "visit.late" }, iso, LA, () => "phone")).toBe("2:10 PM");
    expect(noticeTime({ kind: "estimate.viewed" } as never, iso, LA, () => "phone")).toBe("phone");
  });
});
