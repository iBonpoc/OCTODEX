/**
 * П4b-2: the form, «План», «Сегодня» and the labels on screens work on the company's day and clock, not the phone's
 * (docs/specs/03 «П4b — этап 0»). The company is in Los Angeles; the moments are fixed with an offset, so the tests do
 * not depend on the machine's zone — the whole vitest suite is run in UTC, Honolulu, New York and Tokyo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSeed } from "../src/data/seed";
import { isToday } from "../src/data/selectors";
import type { DB, Visit } from "../src/data/types";
import { atMinute, dayVisits, formHours, formWarnings, freeSlots, startAllowed } from "../src/features/schedule";
import { BUSINESS_HOURS_DEFAULT } from "../src/features/scheduleSettings";
import { dayOffsetOf, isoDayKey, todayKey } from "../src/features/calendar";
import { techDay } from "../src/features/techDay";
import { noLateCallsNow } from "../src/features/clients";
import { dayKeyLabel, dayLabel, demoToday, getZone, minuteIn, setZone, timeLabel } from "../src/features/zone";

const LA = "America/Los_Angeles";
const NY = "America/New_York";
const base: Visit = { id: "v", techId: "m1", start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 };
const V = (p: Partial<Visit>): Visit => ({ ...base, ...p });

afterEach(() => {
  vi.useRealTimers();
  setZone(LA);
});

describe("a time of the form is the company's wall clock", () => {
  it("10:00 on Nov 6 in LA is 18:00Z — on any phone", () => {
    expect(atMinute("2026-11-06", 10 * 60, LA)).toBe("2026-11-06T18:00:00.000Z");
    expect(minuteIn("2026-11-06T18:00:00.000Z", LA)).toBe(600); // and back: the slot the form shows
    // the same 10:00 in a New York company is 15:00Z
    expect(atMinute("2026-11-06", 10 * 60, NY)).toBe("2026-11-06T15:00:00.000Z");
  });
  it("across the clock changes 9:00 stays 9:00 (PDT in March, PST in November)", () => {
    expect(atMinute("2027-03-15", 9 * 60, LA)).toBe("2027-03-15T16:00:00.000Z");
    expect(atMinute("2026-11-02", 9 * 60, LA)).toBe("2026-11-02T17:00:00.000Z");
    // 2:30 does not exist on Mar 14, 2027 in LA: moved forward to 3:30 PDT
    expect(atMinute("2027-03-14", 2 * 60 + 30, LA)).toBe("2027-03-14T10:30:00.000Z");
  });
  it("the default zone is the company's (set by the store), not the phone's", () => {
    setZone(NY);
    expect(getZone()).toBe(NY);
    expect(atMinute("2026-11-06", 10 * 60)).toBe("2026-11-06T15:00:00.000Z");
    setZone(LA);
    expect(atMinute("2026-11-06", 10 * 60)).toBe("2026-11-06T18:00:00.000Z");
  });
});

describe("slots, load and «past» of the form by the company's day (phone in New York, company in LA)", () => {
  // 11:30 PM on Nov 5 in LA = 2:30 AM on Nov 6 in New York: the phone thinks it is tomorrow
  const now = new Date("2026-11-05T23:30:00-08:00").getTime();
  it("today of the company still has its evening; the next day starts at 8:00 of LA", () => {
    const db = { visits: [] };
    const h = formHours(BUSINESS_HOURS_DEFAULT, 30, "2026-11-06");
    const slots = freeSlots(db, null, "2026-11-06", 60, { now, hours: h, tz: LA });
    expect(slots[0]).toBe(8 * 60); // 8:00 AM in LA (the phone's 11:00 AM)
    expect(new Date(atMinute("2026-11-06", slots[0]!, LA)).getTime()).toBeGreaterThan(now);
  });
  it("«earlier today» is the company's today: 8 PM in LA is allowed, yesterday in LA is the past", () => {
    expect(startAllowed("2026-11-05T20:00:00-08:00", now, LA)).toBe(true);
    expect(startAllowed("2026-11-04T21:00:00-08:00", now, LA)).toBe(false);
    // on a New York phone 8 PM in LA (11 PM in NY) was «yesterday» already — the phone's rule would refuse it
    expect(startAllowed("2026-11-05T20:00:00-08:00", now, NY)).toBe(false);
  });
  it("a person's day load is the company's day: a 10 PM visit in LA belongs to that LA day", () => {
    const db = { visits: [V({ id: "late", start: "2026-11-05T22:00:00-08:00" }), V({ id: "next", start: "2026-11-06T08:00:00-08:00" })] };
    expect(dayVisits(db, "m1", "2026-11-05", undefined, LA).map((v) => v.id)).toEqual(["late"]);
    expect(dayVisits(db, "m1", "2026-11-06", undefined, LA).map((v) => v.id)).toEqual(["next"]);
  });
  it("«out of hours» reads the company's clock: 7 PM in LA is out, 9 AM in LA is in", () => {
    const db = { visits: [] };
    const h = formHours(BUSINESS_HOURS_DEFAULT, 30, "2026-11-06");
    expect(formWarnings(db, { techId: null, start: "2026-11-06T19:00:00-08:00", durationMin: 60 }, { now, hours: h, tz: LA }).map((w) => w.key)).toEqual(["outOfHours"]);
    expect(formWarnings(db, { techId: null, start: "2026-11-06T09:00:00-08:00", durationMin: 60 }, { now, hours: h, tz: LA })).toEqual([]);
  });
  it("the weekday of the hours is the company's calendar day (Sunday Nov 8 is off)", () => {
    expect(formHours(BUSINESS_HOURS_DEFAULT, 30, "2026-11-08").off).toBe(true);
    expect(formHours(BUSINESS_HOURS_DEFAULT, 30, "2026-11-07").off).toBeUndefined();
  });
});

describe("«today» of the screens is the company's", () => {
  it("todayKey, isoDayKey, isToday, the form's day offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T23:30:00-08:00")); // Nov 6 in UTC and New York
    expect(todayKey()).toBe("2026-11-05");
    expect(isoDayKey("2026-11-06T07:00:00.000Z")).toBe("2026-11-05"); // 11 PM in LA
    expect(isToday("2026-11-05T08:30:00-08:00")).toBe(true);
    expect(isToday("2026-11-06T00:30:00-08:00")).toBe(false);
    expect(dayOffsetOf("2026-11-06")).toBe(1); // «tomorrow» chip = Nov 6, not Nov 7
    expect(dayOffsetOf("2026-11-05")).toBe(0);
  });
  it("«Сегодня» of a tech: the company's day", () => {
    const db = makeSeed();
    const late = V({ id: "late", start: "2026-11-05T22:00:00-08:00", techId: db.me });
    const next = V({ id: "next", start: "2026-11-06T08:00:00-08:00", techId: db.me });
    const d: DB = { ...db, visits: [late, next] };
    const now = new Date("2026-11-05T23:30:00-08:00");
    expect(techDay(d, db.me, now).visits.map((v) => v.id)).toEqual(["late"]);
  });
  it("«No calls after 6 pm» is 6 pm of the company", () => {
    const db = makeSeed();
    const tag = db.tags.find((x) => x.system && x.name.toLowerCase() === "no calls after 6 pm");
    expect(tag).toBeTruthy();
    const c = { ...db.customers[0]!, tagIds: [tag!.id] };
    const d: DB = { ...db, customers: [c, ...db.customers.slice(1)] };
    // 7 PM in New York = 4 PM in LA: still fine to call a client of the LA company
    expect(noLateCallsNow(d, c, new Date("2026-11-05T19:00:00-05:00"), LA)).toBe(false);
    expect(noLateCallsNow(d, c, new Date("2026-11-05T18:30:00-08:00"), LA)).toBe(true);
  });
});

describe("labels on the screens: the company's clock and day", () => {
  it("time and day of a moment", () => {
    expect(timeLabel("2026-11-06T18:00:00.000Z", LA)).toBe("10:00 AM");
    expect(timeLabel("2026-11-06T18:00:00.000Z", NY)).toBe("1:00 PM");
    expect(dayLabel("2026-11-06T07:00:00.000Z", "en-US", LA)).toBe("Thu, Nov 5"); // 11 PM in LA
  });
  it("a day key has no zone: the same label everywhere", () => {
    expect(dayKeyLabel("2026-11-08")).toBe("Sun, Nov 8");
    setZone("Pacific/Honolulu");
    expect(dayKeyLabel("2026-11-08")).toBe("Sun, Nov 8");
  });
  // e2e 103 against a real Supabase (07.11): invoices.due_date «2026-11-06» showed «Thu, Nov 5» on the invoice screen —
  // a calendar day read as UTC midnight and shown in LA. The same for leads.timeframe_date and every date column.
  it("a calendar day «YYYY-MM-DD» from the server is that day in every zone, not UTC midnight", () => {
    for (const tz of [LA, NY, "Pacific/Honolulu", "UTC", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      expect(dayLabel("2026-11-06", "en-US", tz), tz).toBe("Fri, Nov 6");
      expect(dayLabel("2026-11-06", "ru", tz), tz).toBe(dayKeyLabel("2026-11-06", "ru"));
    }
    setZone(LA);
    expect(dayLabel("2026-11-06")).toBe("Fri, Nov 6"); // the default zone too
    expect(dayLabel("2026-11-06T07:00:00.000Z", "en-US", LA)).toBe("Thu, Nov 5"); // a moment still goes by the clock
  });
  // PDF dates (docPdf.ts docDay) default to the company's zone too: test/estimatePdf.test.ts «US numeric dates» fails
  // in TZ=Asia/Tokyo without it
});

describe("the demo lives on the demo company's clock (Los Angeles)", () => {
  it("visits of today at their hours in LA; reseeded at LA midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T23:30:00-08:00")); // already Nov 6 in UTC
    const db = makeSeed();
    const v1 = db.visits.find((v) => v.id === "v1")!;
    expect(isoDayKey(v1.start, LA)).toBe("2026-11-05");
    expect(minuteIn(v1.start, LA)).toBe(8 * 60 + 30); // 8:30 AM in LA
    expect(isoDayKey(db.visits.find((v) => v.id === "v7")!.start, LA)).toBe("2026-11-06"); // tomorrow of LA
    expect(demoToday()).toBe("2026-11-05");
  });
  it("«N minutes ago» just after LA midnight stays today of LA", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T00:20:00-08:00"));
    const db = makeSeed();
    const pay = db.payments.find((p) => p.id === "pay3")!; // 140 minutes ago
    expect(isoDayKey(pay.at, LA)).toBe("2026-11-06");
  });
});
