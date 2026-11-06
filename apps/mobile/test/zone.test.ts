/**
 * unit:zone — the company's time zone for the whole app (docs/specs/03 «П4b — этап 0», П4b-1). Every check passes the
 * zone explicitly, so the result does not depend on the machine; the last block runs the key rules with the machine
 * (process.env.TZ) in several zones — the phone of the office in Hawaii, Tokyo or New York.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  companyToday, dayKeyIn, daysBetween, DEFAULT_ZONE, dueDayKey, getZone, minuteIn, setZone, validZone, wallToInstant, weekdayOf,
} from "../src/features/zone";
import { invoiceSigns } from "../src/features/listSigns";
import { buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { addDays, addMonths, isoDayKey, monthGrid, todayKey, weekDays, weekStart } from "../src/features/calendar";
import { isOverdue, isToday, daysOverdue } from "../src/data/selectors";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

describe("the zone of the app", () => {
  afterEach(() => setZone(null));
  it("Los Angeles until the company says otherwise; an unknown zone keeps it", () => {
    setZone(null);
    expect(getZone()).toBe(DEFAULT_ZONE);
    setZone("America/Chicago");
    expect(getZone()).toBe("America/Chicago");
    setZone("Mars/Olympus");
    expect(getZone()).toBe(LA);
    expect(validZone("Mars/Olympus")).toBe(false);
  });
});

describe("day and minute of a moment in a zone", () => {
  it("the same moment is a different day in Los Angeles and New York", () => {
    const t = "2026-11-06T06:30:00.000Z"; // 10:30 PM Nov 5 in LA, 1:30 AM Nov 6 in NY
    expect(dayKeyIn(t, LA)).toBe("2026-11-05");
    expect(dayKeyIn(t, NY)).toBe("2026-11-06");
    expect(minuteIn(t, LA)).toBe(22 * 60 + 30);
    expect(minuteIn(t, NY)).toBe(90);
  });
  it("midnight is 0, not 24 (hourCycle h23)", () => {
    expect(minuteIn("2026-11-06T08:00:00.000Z", LA)).toBe(0);
    expect(dayKeyIn("2026-11-06T08:00:00.000Z", LA)).toBe("2026-11-06");
    expect(minuteIn("2026-11-06T07:59:00.000Z", LA)).toBe(23 * 60 + 59);
  });
});

describe("wallToInstant: a wall-clock time of the company → a moment", () => {
  it("an ordinary day, winter and summer", () => {
    expect(wallToInstant("2026-11-06", 10 * 60 + 30, LA)).toBe("2026-11-06T18:30:00.000Z"); // PST −8
    expect(wallToInstant("2026-07-01", 9 * 60, LA)).toBe("2026-07-01T16:00:00.000Z"); // PDT −7
    expect(wallToInstant("2026-11-06", 0, NY)).toBe("2026-11-06T05:00:00.000Z");
  });
  it("round trip: the day and minute come back", () => {
    for (const m of [0, 1, 359, 600, 1439]) {
      const iso = wallToInstant("2026-11-06", m, LA);
      expect(dayKeyIn(iso, LA)).toBe("2026-11-06");
      expect(minuteIn(iso, LA)).toBe(m);
    }
  });
  it("spring forward (Mar 8, 2026): 2:30 does not exist → 3:30 PDT", () => {
    expect(wallToInstant("2026-03-08", 2 * 60 + 30, LA)).toBe("2026-03-08T10:30:00.000Z");
    expect(wallToInstant("2026-03-08", 60, LA)).toBe("2026-03-08T09:00:00.000Z"); // 1:00 PST
    expect(wallToInstant("2026-03-08", 3 * 60, LA)).toBe("2026-03-08T10:00:00.000Z"); // 3:00 PDT
  });
  it("fall back (Nov 1, 2026): 1:30 happens twice → the earlier one (PDT)", () => {
    expect(wallToInstant("2026-11-01", 90, LA)).toBe("2026-11-01T08:30:00.000Z");
    expect(wallToInstant("2026-11-01", 3 * 60, LA)).toBe("2026-11-01T11:00:00.000Z"); // 3:00 PST
  });
});

describe("calendar keys: arithmetic without any zone", () => {
  it("days, months, weeks (Monday first)", () => {
    expect(addDays("2026-11-05", 1)).toBe("2026-11-06");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // across the clock change
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-05", -11)).toBe("2025-12-05");
    expect(weekdayOf("2026-11-05")).toBe(4); // Thursday
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday → the Monday before
    expect(weekDays("2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    const g = monthGrid("2026-11-15");
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ key: "2026-10-26", inMonth: false });
    expect(g.filter((x) => x.inMonth)).toHaveLength(30);
    expect(daysBetween("2026-11-01", "2026-11-05")).toBe(4);
  });
  it("today and the day of a moment in the zone when given", () => {
    expect(isoDayKey("2026-11-06T06:30:00.000Z", LA)).toBe("2026-11-05");
    expect(todayKey(LA)).toBe(dayKeyIn(Date.now(), LA));
  });
});

describe("deadlines are calendar days of the company (as the server)", () => {
  const late = new Date("2026-11-06T07:30:00.000Z").getTime(); // 11:30 PM Nov 5 in LA
  it("«YYYY-MM-DD» stays; a moment is read on the company's calendar", () => {
    expect(dueDayKey("2026-11-05", LA)).toBe("2026-11-05");
    expect(dueDayKey("2026-11-06T07:30:00.000Z", LA)).toBe("2026-11-05");
  });
  it("overdue only after the company's due day (bug: «YYYY-MM-DD» read as UTC midnight, then the phone's 23:59)", () => {
    expect(isOverdue("2026-11-05", late, LA)).toBe(false);
    expect(isOverdue("2026-11-04", late, LA)).toBe(true);
    expect(daysOverdue("2026-11-01", late, LA)).toBe(4);
    expect(daysOverdue("2026-11-05", late, LA)).toBe(0);
  });
  it("isToday by the company's day", () => {
    expect(isToday("2026-11-05T17:00:00.000Z", late, LA)).toBe(true);
    expect(isToday("2026-11-06T09:00:00.000Z", late, LA)).toBe(false);
  });
});

describe("the company's day for new invoices and «Требует внимания»", () => {
  afterEach(() => { setZone(null); vi.useRealTimers(); });
  it("a new invoice is due on the company's today (bug: the UTC date of the phone)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T07:30:00.000Z")); // 11:30 PM Nov 5 in LA, Nov 6 in UTC
    setZone(LA);
    expect(companyToday()).toBe("2026-11-05");
    setZone(NY);
    expect(companyToday()).toBe("2026-11-06");
  });
  it("overdue in «Требует внимания» by the company's day: Los Angeles vs New York", () => {
    const late = new Date("2026-11-06T06:30:00.000Z").getTime(); // 10:30 PM Nov 5 in LA, 1:30 AM Nov 6 in NY
    const base = makeSeed();
    const inv = { ...base.invoices[0]!, id: "iZ", paidCents: 0, totalCents: 10000, dueDate: "2026-11-05" };
    const items = (tz: string) => buildAttention({ ...base, company: { ...base.company!, timezone: tz }, invoices: [inv] } as DB, "director", late).filter((i) => i.refId === "iZ");
    expect(items(LA)).toEqual([]); // still the due day in LA
    expect(items(NY).map((i) => [i.kind, i.score])).toEqual([["overdue", 801]]); // 1 day past in NY
    expect(invoiceSigns(inv, late, NY)[0]).toMatchObject({ key: "card.sign.overdueDays", params: { d: 1 } });
    expect(invoiceSigns(inv, late, LA)).toEqual([{ key: "card.sign.dueToday", tone: "warn" }]);
  });
  it("isToday: the phone's day unless a zone is given (the screens move in П4b-2)", () => {
    const now = new Date("2026-11-06T06:30:00.000Z").getTime();
    expect(isToday("2026-11-05T20:00:00.000Z", now, LA)).toBe(true);
    expect(isToday("2026-11-05T20:00:00.000Z", now, NY)).toBe(false);
  });
});

describe("the same answers whatever the machine's zone", () => {
  const machine = process.env.TZ;
  afterAll(() => { if (machine === undefined) delete process.env.TZ; else process.env.TZ = machine; });
  for (const tz of ["UTC", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati", "America/New_York"]) {
    it(`machine in ${tz}`, () => {
      process.env.TZ = tz;
      const late = new Date("2026-11-06T07:30:00.000Z").getTime();
      expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
      expect(weekStart("2026-11-08")).toBe("2026-11-02");
      expect(monthGrid("2026-11-15")[0]!.key).toBe("2026-10-26");
      expect(wallToInstant("2026-03-08", 150, LA)).toBe("2026-03-08T10:30:00.000Z");
      expect(isOverdue("2026-11-05", late, LA)).toBe(false);
      expect(isOverdue("2026-11-04", late, LA)).toBe(true);
      expect(invoiceSigns({ totalCents: 1, paidCents: 0, dueDate: "2026-11-06" }, late, LA)).toEqual([{ key: "card.sign.dueTomorrow", tone: "warn" }]);
      expect(dayKeyIn(late, LA)).toBe("2026-11-05");
    });
  }
});
