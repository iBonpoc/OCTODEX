/**
 * 3b-3 (17-job §11.1): «Весь день» у выезда — the company's day (phone in New York, company in Los Angeles), DST days,
 * not «late», a clash only with another all-day visit, all day in the Plan.
 */
const phoneTz = process.env.TZ;
process.env.TZ = "America/New_York";
import { afterAll, describe, expect, it } from "vitest";
import { formWarnings, lateKind, overlaps, wholeDay } from "../src/features/schedule";
import { planItems } from "../src/features/planFeed";
import { setZone } from "../src/features/zone";
import type { DB, Visit } from "../src/data/types";

afterAll(() => {
  if (phoneTz === undefined) delete process.env.TZ;
  else process.env.TZ = phoneTz;
  setZone(null);
});

const LA = "America/Los_Angeles";
setZone(LA);
const members = [{ id: "m-ivan", name: "Ivan", initials: "I", kind: "employee" as const, roles: ["tech" as const] }];
const V = (id: string, p: Partial<Visit>): Visit => ({ id, jobId: "j1", techId: "m-ivan", assigneeIds: ["m-ivan"], start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });

describe("wholeDay — the company's midnight to midnight", () => {
  it("an ordinary day: 24 h from 00:00 in Los Angeles, whatever the phone's zone", () => {
    expect(wholeDay("2026-12-01")).toEqual({ start: "2026-12-01T08:00:00.000Z", durationMin: 1440 });
  });
  it("DST days: 23 h in spring, 25 h in autumn — still ends at the next midnight", () => {
    expect(wholeDay("2027-03-14")).toEqual({ start: "2027-03-14T08:00:00.000Z", durationMin: 1380 });
    expect(wholeDay("2026-11-01")).toEqual({ start: "2026-11-01T07:00:00.000Z", durationMin: 1500 });
  });
});

describe("rules of an all-day visit", () => {
  const day = wholeDay("2026-12-01");
  const all = V("a", { start: day.start, durationMin: day.durationMin, allDay: true });
  it("never «late», even at the end of the day", () => {
    expect(lateKind(all, members, Date.parse("2026-12-01T23:00:00.000Z"))).toBeNull();
    // the same range without the flag is late at 00:15 LA (the old bug the flag avoids)
    expect(lateKind({ ...all, allDay: undefined }, members, Date.parse("2026-12-01T08:30:00.000Z"))).toBe("not_left");
  });
  it("clashes only with another all-day visit of the person", () => {
    const timed = V("t", { start: "2026-12-01T18:00:00.000Z" }); // 10 AM LA
    const db = { visits: [all, timed] } as Pick<DB, "visits">;
    expect(overlaps(db, "m-ivan", "2026-12-01T18:00:00.000Z", 60, "t").map((v) => v.id)).toEqual([]);
    expect(overlaps(db, "m-ivan", day.start, day.durationMin, "a", true).map((v) => v.id)).toEqual([]);
    const other = V("b", { start: day.start, durationMin: day.durationMin, allDay: true });
    expect(overlaps({ visits: [all, other, timed] }, "m-ivan", day.start, day.durationMin, "b", true).map((v) => v.id)).toEqual(["a"]);
  });
  it("the form: no «out of hours»; today is fine, a day that is over is «past»", () => {
    const db = { visits: [] } as Pick<DB, "visits">;
    const f = { techId: "m-ivan", start: day.start, durationMin: day.durationMin, allDay: true };
    expect(formWarnings(db, f, { now: Date.parse("2026-12-01T20:00:00.000Z"), tz: LA })).toEqual([]);
    expect(formWarnings(db, f, { now: Date.parse("2026-12-02T08:00:00.000Z"), tz: LA }).map((w) => w.key)).toEqual(["past"]);
  });
  it("the Plan shows it as all day, on its day only", () => {
    const items = planItems({ visits: [all], tasks: [], calendarEvents: [], me: "m-ivan" } as Pick<DB, "visits" | "me" | "tasks" | "calendarEvents">, { from: "2026-11-30", to: "2026-12-06" }, "all", "director", { tz: LA });
    expect(items.map((x) => [x.day, x.allDay])).toEqual([["2026-12-01", true]]);
  });
});
