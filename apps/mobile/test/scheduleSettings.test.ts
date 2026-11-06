/** unit:scheduleSettings — «Компания → Расписание» (docs/specs/03 «П4 — этап 0», wave П4a). Same limits as db:T38. */
import { describe, expect, it } from "vitest";
import {
  arrivalWindow, BUSINESS_HOURS_DEFAULT, businessHoursOf, durationFor, lateAfterOf, SCHEDULE_SETTINGS_DEFAULT, scheduleSettingsOf, validSetting,
} from "../src/features/scheduleSettings";
import { formHours, formWarnings, freeSlots, isWorkday } from "../src/features/schedule";
import type { Company } from "../src/data/types";

const co = (p: Partial<Company>) => p as Company;

describe("schedule settings of the company", () => {
  it("defaults: 45 / 120 / 60 / 60 min, step 30, window 2 h, late after 15; Mon–Sat 8:00–18:00", () => {
    expect(scheduleSettingsOf(null)).toEqual({ inspectionMin: 45, jobMin: 120, serviceMin: 60, followUpMin: 60, stepMin: 30, arrivalWindowMin: 120, lateAfterMin: 15 });
    expect(businessHoursOf(undefined)).toEqual(BUSINESS_HOURS_DEFAULT);
    expect(BUSINESS_HOURS_DEFAULT.sun).toBeNull();
    expect(BUSINESS_HOURS_DEFAULT.sat).toEqual([480, 1080]);
  });
  it("what the company set wins; the rest stays default", () => {
    const s = scheduleSettingsOf(co({ scheduleSettings: { inspectionMin: 60, lateAfterMin: 30 } }));
    expect(s.inspectionMin).toBe(60);
    expect(s.lateAfterMin).toBe(30);
    expect(s.jobMin).toBe(120);
    expect(lateAfterOf({ company: co({ scheduleSettings: { lateAfterMin: 30 } }) })).toBe(30);
  });
  it("junk falls back to the default (the database refuses it too)", () => {
    const junk = { inspectionMin: "60", jobMin: -15, serviceMin: 50, followUpMin: 900, stepMin: 20, arrivalWindowMin: 90, lateAfterMin: 0 } as unknown as Company["scheduleSettings"];
    expect(scheduleSettingsOf(co({ scheduleSettings: junk }))).toEqual(SCHEDULE_SETTINGS_DEFAULT);
    expect(validSetting("lateAfterMin", 61)).toBe(false);
    expect(validSetting("lateAfterMin", 60)).toBe(true);
    expect(validSetting("lateAfterMin", 12)).toBe(false);
    expect(validSetting("arrivalWindowMin", 0)).toBe(true);
    expect(validSetting("stepMin", 60)).toBe(true);
  });
  it("hours: a day off, a changed day; start ≥ end or out of the day keeps the default", () => {
    const h = businessHoursOf(co({ businessHours: { sat: null, mon: [420, 960], tue: [600, 540], wed: [0, 1500] } as never }));
    expect(h.sat).toBeNull();
    expect(h.mon).toEqual([420, 960]);
    expect(h.tue).toEqual([480, 1080]);
    expect(h.wed).toEqual([480, 1080]);
  });
  it("default length by kind", () => {
    const s = { ...SCHEDULE_SETTINGS_DEFAULT, inspectionMin: 60, serviceMin: 90 };
    expect(durationFor(s, "inspection")).toBe(60);
    expect(durationFor(s, "install")).toBe(120);
    expect(durationFor(s, "service")).toBe(90);
    expect(durationFor(s, "follow_up")).toBe(60);
    expect(durationFor(s, undefined)).toBe(120);
  });
  it("arrival window from the start; 0 = the exact time", () => {
    const start = "2026-11-06T18:00:00.000Z";
    expect(arrivalWindow(start, { arrivalWindowMin: 120 })).toEqual({ from: start, to: "2026-11-06T20:00:00.000Z" });
    expect(arrivalWindow(start, { arrivalWindowMin: 0 })).toBeNull();
  });
});

describe("the form follows the company's hours (П4a)", () => {
  const db = { visits: [] };
  const sat = new Date(2026, 10, 7); // a Saturday, phone calendar (the company zone in the form — П4b)
  const sun = new Date(2026, 10, 8);
  const past = new Date(2026, 0, 1).getTime();
  it("working days by the hours: Saturday is one by default, a day off is not", () => {
    expect(isWorkday(sat)).toBe(true);
    expect(isWorkday(sun)).toBe(false);
    expect(isWorkday(sat, { ...BUSINESS_HOURS_DEFAULT, sat: null })).toBe(false);
  });
  it("slots inside the day's hours on the company's step", () => {
    const h = formHours({ ...BUSINESS_HOURS_DEFAULT, sat: [540, 780] }, 60, sat);
    expect(freeSlots(db, null, sat, 60, { now: past, hours: h })).toEqual([540, 600, 660, 720]);
  });
  it("a day off: no slots, and «Вне рабочих часов» if a time is set by hand", () => {
    const h = formHours(BUSINESS_HOURS_DEFAULT, 30, sun);
    expect(freeSlots(db, null, sun, 60, { now: past, hours: h })).toEqual([]);
    const start = new Date(2026, 10, 8, 10, 0).toISOString();
    expect(formWarnings(db, { techId: null, start, durationMin: 60 }, { now: past, hours: h }).map((w) => w.key)).toContain("outOfHours");
  });
});
