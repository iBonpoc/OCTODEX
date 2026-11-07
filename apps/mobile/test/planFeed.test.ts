/**
 * Wave 5 «План» (docs/specs/13-app-structure.md §3.2): the Feed — visits, tasks with a time, events and days off by the
 * company's days. The phone is in New York, the company in Los Angeles, so «the phone's day» would give wrong answers;
 * the zone is set before any Date. A second block runs the same rules for a company in Honolulu.
 */
const phoneTz = process.env.TZ;
process.env.TZ = "America/New_York";
import { afterAll, describe, expect, it } from "vitest";
import { daysFrom, eventFields, eventProblems, eventRange, groupByDay, itemTimes, matchPlanItem, matchVisit, planItems, spanDays, whoMatches } from "../src/features/planFeed";
import { unassignedSoon } from "../src/features/schedule";
import type { CalendarEvent, DB, Task, Visit } from "../src/data/types";

afterAll(() => {
  if (phoneTz === undefined) delete process.env.TZ;
  else process.env.TZ = phoneTz;
});

const LA = "America/Los_Angeles";
const HNL = "Pacific/Honolulu";
const V = (id: string, p: Partial<Visit>): Visit => ({ id, techId: "m-ivan", assigneeIds: ["m-ivan"], start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
const Tk = (id: string, p: Partial<Task>): Task => ({ id, subjectType: "job", subjectId: "j1", title: id, ...p });
const Ev = (id: string, p: Partial<CalendarEvent>): CalendarEvent => ({ id, kind: "event", startsAt: "", endsAt: "", allDay: false, ...p });
const db = (p: { visits?: Visit[]; tasks?: Task[]; calendarEvents?: CalendarEvent[] }, me = "m-ivan") =>
  ({ visits: [], tasks: [], calendarEvents: [], me, ...p }) as Pick<DB, "visits" | "me" | "tasks" | "calendarEvents">;
const week = { from: "2026-11-05", to: "2026-11-11" };

describe("the Feed by the company's days (phone New York, company Los Angeles)", () => {
  it("the test really runs with the phone in New York", () => {
    expect(new Date("2026-11-06T05:30:00.000Z").getDate()).toBe(6); // 12:30 AM Nov 6 in New York, 9:30 PM Nov 5 in LA
  });
  it("a visit at 9:30 PM in LA is on that LA day, not the phone's next day", () => {
    const items = planItems(db({ visits: [V("v", { start: "2026-11-06T05:30:00.000Z" })] }), week, "all", "director", { tz: LA });
    expect(items.map((x) => [x.kind, x.day])).toEqual([["visit", "2026-11-05"]]);
  });
  it("visits, tasks with a time, events and days off in one list; «all day» first, then by time", () => {
    const items = planItems(
      db({
        visits: [V("v1", { start: "2026-11-06T17:00:00.000Z" })], // 9:00 AM LA
        tasks: [Tk("call", { startsAt: "2026-11-06T16:00:00.000Z", assigneeId: "m-ivan" }), Tk("due only", { dueAt: "2026-11-06T16:00:00.000Z" })],
        calendarEvents: [
          Ev("meet", { startsAt: "2026-11-06T18:00:00.000Z", endsAt: "2026-11-06T19:00:00.000Z" }), // 10 AM LA, the whole company
          Ev("off", { kind: "time_off", userId: "m-ivan", allDay: true, startsAt: "2026-11-06T08:00:00.000Z", endsAt: "2026-11-07T08:00:00.000Z" }),
        ],
      }),
      week, "all", "director", { tz: LA },
    );
    expect(items.map((x) => x.id)).toEqual(["off", "call", "v1", "meet"]);
    expect(items.every((x) => x.day === "2026-11-06")).toBe(true);
  });
  it("a task with only a due date is not in the Plan (13 §3.7)", () => {
    expect(planItems(db({ tasks: [Tk("t", { dueAt: "2026-11-06T16:00:00.000Z" })] }), week, "all", "director", { tz: LA })).toEqual([]);
  });
  it("a 3-day time off across the clock change (Nov 1) is on each of its days, the end at midnight is not a day", () => {
    // LA: Oct 31 00:00 PDT (07:00Z) → Nov 3 00:00 PST (08:00Z)
    expect(spanDays("2026-10-31T07:00:00.000Z", "2026-11-03T08:00:00.000Z", LA)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    const items = planItems(
      db({ calendarEvents: [Ev("off", { kind: "time_off", userId: "m-ivan", allDay: true, startsAt: "2026-10-31T07:00:00.000Z", endsAt: "2026-11-03T08:00:00.000Z" })] }),
      { from: "2026-10-30", to: "2026-11-05" }, "all", "director", { tz: LA },
    );
    expect(items.map((x) => x.day)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("a bad span (end before start) is one day; a huge one is capped", () => {
    expect(spanDays("2026-11-06T16:00:00.000Z", "2026-11-05T16:00:00.000Z", LA)).toEqual(["2026-11-06"]);
    expect(spanDays("2026-01-01T16:00:00.000Z", "2030-01-01T16:00:00.000Z", LA).length).toBe(367);
  });
  it("done visits and tasks hide unless «Показывать выполненные»", () => {
    const d = db({
      visits: [V("done", { start: "2026-11-06T17:00:00.000Z", step: "done" }), V("closed", { start: "2026-11-06T18:00:00.000Z", closed: true })],
      tasks: [Tk("t", { startsAt: "2026-11-06T16:00:00.000Z", doneAt: "2026-11-06T16:30:00.000Z" })],
    });
    expect(planItems(d, week, "all", "director", { tz: LA })).toEqual([]);
    expect(planItems(d, week, "all", "director", { tz: LA, showDone: true }).map((x) => [x.id, x.done])).toEqual([["t", true], ["done", true], ["closed", true]]);
  });
  it("a tech sees his own and the company's events; not a colleague's visit, task or day off", () => {
    const d = db({
      visits: [V("mine", { start: "2026-11-06T17:00:00.000Z" }), V("alex", { start: "2026-11-06T18:00:00.000Z", techId: "m-alex", assigneeIds: ["m-alex"] }), V("nobody", { start: "2026-11-06T19:00:00.000Z", techId: null, assigneeIds: [] })],
      tasks: [Tk("alexTask", { startsAt: "2026-11-06T16:00:00.000Z", assigneeId: "m-alex" })],
      calendarEvents: [Ev("all", { startsAt: "2026-11-06T20:00:00.000Z", endsAt: "2026-11-06T21:00:00.000Z" }), Ev("alexOff", { kind: "time_off", userId: "m-alex", allDay: true, startsAt: "2026-11-06T08:00:00.000Z", endsAt: "2026-11-07T08:00:00.000Z" })],
    });
    expect(planItems(d, week, "all", "tech", { tz: LA }).map((x) => x.id)).toEqual(["mine", "all"]);
    // the office picks a person: Alex's things and the company's
    expect(planItems(d, week, "m-alex", "director", { tz: LA }).map((x) => x.id)).toEqual(["alexOff", "alexTask", "alex", "all"]);
    expect(planItems(d, week, "all", "director", { tz: LA }).length).toBe(6);
  });
  it("outside the range nothing comes", () => {
    expect(planItems(db({ visits: [V("v", { start: "2026-11-20T17:00:00.000Z" })] }), week, "all", "director", { tz: LA })).toEqual([]);
  });
  it("whoMatches: «all», «me», a person; a company-wide event for everyone", () => {
    expect(whoMatches(["a"], "all", "me")).toBe(true);
    expect(whoMatches(["me"], "me", "me")).toBe(true);
    expect(whoMatches(["a"], "b", "me")).toBe(false);
    expect(whoMatches([], "b", "me", true)).toBe(true);
  });
  it("groupByDay keeps every day, an empty one too; daysFrom is inclusive", () => {
    const days = daysFrom("2026-11-05", "2026-11-07");
    expect(days).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
    const items = planItems(db({ visits: [V("v", { start: "2026-11-06T17:00:00.000Z" })] }), week, "all", "director", { tz: LA });
    expect(groupByDay(items, days).map((g) => g.items.length)).toEqual([0, 1, 0]);
  });
  it("«Не назначено» on top of the Plan: today and tomorrow of the company, open and nobody on them", () => {
    const now = new Date("2026-11-06T04:30:00.000Z").getTime(); // LA 8:30 PM Nov 5; NY 11:30 PM
    const visits = [
      V("today", { start: "2026-11-06T05:30:00.000Z", techId: null, assigneeIds: [] }), // LA Nov 5 (NY: Nov 6)
      V("tomorrow", { start: "2026-11-06T17:00:00.000Z", techId: null, assigneeIds: [] }), // LA Nov 6
      V("later", { start: "2026-11-07T17:00:00.000Z", techId: null, assigneeIds: [] }),
      V("assigned", { start: "2026-11-06T05:45:00.000Z" }),
      V("done", { start: "2026-11-06T05:40:00.000Z", techId: null, assigneeIds: [], step: "done" }),
    ];
    expect(unassignedSoon({ visits, members: [] }, now, LA).map((x) => [x.v.id, x.dd])).toEqual([["today", 0], ["tomorrow", 1]]);
  });
});

describe("the same Feed for a company in Honolulu (phone in New York)", () => {
  it("a visit at 11 PM in Honolulu is on that Honolulu day (the phone is already on the next day)", () => {
    // 2026-11-06 09:00Z = Nov 5 11:00 PM in Honolulu, Nov 6 4:00 AM in New York
    const items = planItems(db({ visits: [V("v", { start: "2026-11-06T09:00:00.000Z" })] }), week, "all", "director", { tz: HNL });
    expect(items.map((x) => x.day)).toEqual(["2026-11-05"]);
  });
  it("an all-day event from Honolulu midnight to midnight is one day there", () => {
    expect(spanDays("2026-11-06T10:00:00.000Z", "2026-11-07T10:00:00.000Z", HNL)).toEqual(["2026-11-06"]);
  });
});

describe("spans across days (code review of PR-A)", () => {
  it("a visit past midnight is on both days; on the second it runs from the day's start, above the morning", () => {
    const d = db({
      visits: [
        V("night", { start: "2026-11-07T04:00:00.000Z", durationMin: 360 }), // LA Nov 6 8:00 PM → Nov 7 2:00 AM
        V("morning", { start: "2026-11-07T16:00:00.000Z" }), // LA Nov 7 8:00 AM
      ],
    });
    const items = planItems(d, week, "all", "director", { tz: LA });
    expect(items.map((x) => [x.id, x.day, x.at === ""])).toEqual([
      ["night", "2026-11-06", false],
      ["night", "2026-11-07", true],
      ["morning", "2026-11-07", false],
    ]);
  });
  it("an event that began before the range shows on the range's days only", () => {
    const d = db({ calendarEvents: [Ev("trip", { allDay: true, startsAt: "2026-11-02T08:00:00.000Z", endsAt: "2026-11-07T08:00:00.000Z" })] });
    expect(planItems(d, week, "all", "director", { tz: LA }).map((x) => x.day)).toEqual(["2026-11-05", "2026-11-06"]);
  });
  it("itemTimes: the start leads the title and the end goes below; a carried-over day shows «– end»; all day says so", () => {
    const time = (iso: string) => iso.slice(11, 16);
    expect(itemTimes({ allDay: false, at: "x", start: "2026-11-06T20:00:00.000Z", end: "2026-11-06T21:00:00.000Z" }, time, "Весь день")).toEqual({ when: "20:00", until: "– 21:00" });
    expect(itemTimes({ allDay: false, at: "", start: "2026-11-06T20:00:00.000Z", end: "2026-11-07T02:00:00.000Z" }, time, "Весь день")).toEqual({ when: "– 02:00" });
    expect(itemTimes({ allDay: true, at: "", start: "x", end: "y" }, time, "Весь день")).toEqual({ when: "Весь день" });
    expect(itemTimes({ allDay: false, at: "x", start: "2026-11-06T20:00:00.000Z" }, time, "Весь день")).toEqual({ when: "20:00", until: undefined });
  });
});

describe("eventProblems — the server's rules before saving (wave 5 PR-B)", () => {
  const ok = { kind: "event" as const, title: "Crew meeting", startsAt: "2026-11-06T18:00:00.000Z", endsAt: "2026-11-06T19:00:00.000Z" };
  it("a named event with an end after the start is fine", () => {
    expect(eventProblems(ok)).toEqual([]);
  });
  it("an event needs a name; a day off does not, but needs a person", () => {
    expect(eventProblems({ ...ok, title: "   " })).toEqual(["title"]);
    expect(eventProblems({ ...ok, kind: "time_off", title: "" })).toEqual(["person"]);
    expect(eventProblems({ ...ok, kind: "time_off", title: "", userId: "m-ivan" })).toEqual([]);
  });
  it("the end must be after the start; a broken time is refused", () => {
    expect(eventProblems({ ...ok, endsAt: ok.startsAt })).toEqual(["time"]);
    expect(eventProblems({ ...ok, endsAt: "2026-11-06T17:00:00.000Z" })).toEqual(["time"]);
    expect(eventProblems({ ...ok, startsAt: "nope" })).toEqual(["time"]);
  });
  it("name up to 200, description up to 4000", () => {
    expect(eventProblems({ ...ok, title: "x".repeat(201) })).toEqual(["long"]);
    expect(eventProblems({ ...ok, description: "x".repeat(4001) })).toEqual(["long"]);
    expect(eventProblems({ ...ok, title: "x".repeat(200), description: "x".repeat(4000) })).toEqual([]);
  });
});

describe("the event form's fields (wave 5 PR-B, code review)", () => {
  it("a new one opens on the day picked in the Plan, 9:00 for an hour", () => {
    expect(eventFields(undefined, "2026-11-09", LA)).toEqual({ day: "2026-11-09", allDay: false, days: 1, startMin: 540, duration: 60 });
  });
  it("a 3-day «all day» across the clock change opens with 3 days and saves back the same moments", () => {
    const e = Ev("off", { kind: "time_off", userId: "m-ivan", allDay: true, startsAt: "2026-10-31T07:00:00.000Z", endsAt: "2026-11-03T08:00:00.000Z" });
    const f = eventFields(e, "2026-11-20", LA);
    expect(f).toMatchObject({ day: "2026-10-31", allDay: true, days: 3 });
    expect(eventRange(f, LA)).toEqual({ startsAt: e.startsAt, endsAt: e.endsAt });
  });
  it("a timed one opens with its start and length on the company's clock (phone in New York), and saves back the same", () => {
    const e = Ev("meet", { startsAt: "2026-11-06T18:30:00.000Z", endsAt: "2026-11-06T20:00:00.000Z" }); // 10:30 AM LA, 90 min
    const f = eventFields(e, "2026-11-20", LA);
    expect(f).toEqual({ day: "2026-11-06", allDay: false, days: 1, startMin: 630, duration: 90 });
    expect(eventRange(f, LA)).toEqual({ startsAt: e.startsAt, endsAt: e.endsAt });
  });
  it("«all day» ends at the company's midnight after the last day", () => {
    expect(eventRange({ day: "2026-11-06", allDay: true, days: 2, startMin: 0, duration: 0 }, LA)).toEqual({ startsAt: "2026-11-06T08:00:00.000Z", endsAt: "2026-11-08T08:00:00.000Z" });
  });
});

describe("the search of «План» (spec 31, one rule)", () => {
  const full = {
    ...db({
      visits: [V("v1", { start: "2026-11-06T17:00:00.000Z", jobId: "j1" })],
      tasks: [Tk("Call the supplier", { startsAt: "2026-11-06T18:00:00.000Z" })],
      calendarEvents: [Ev("e1", { title: "Team meeting", startsAt: "2026-11-06T19:00:00.000Z", endsAt: "2026-11-06T20:00:00.000Z" })],
    }),
    jobs: [{ id: "j1", propertyId: "p1", customerId: "c1", title: "Seamless gutters" }],
    properties: [{ id: "p1", customerId: "c1", address: "12 Oak St", city: "Pasadena, CA" }],
    customers: [{ id: "c1", name: "Mitchell" }],
    members: [],
  } as unknown as DB;
  const items = planItems(full, { from: "2026-11-05", to: "2026-11-07" }, "all", "director", { tz: LA });
  const found = (q: string) => items.filter((it) => matchPlanItem(full, it, q)).map((it) => it.kind);
  it("a visit by its client, address, city and work; a task and an event by the title; no text — everything", () => {
    expect(found("")).toEqual(["visit", "task", "event"]);
    expect(found("mitch")).toEqual(["visit"]);
    expect(found("oak st")).toEqual(["visit"]);
    expect(found("pasadena")).toEqual(["visit"]);
    expect(found(" SEAMLESS ")).toEqual(["visit"]);
    expect(found("supplier")).toEqual(["task"]);
    expect(found("meeting")).toEqual(["event"]);
    expect(found("zzz")).toEqual([]);
  });
  it("the Day by person searches its visits the same way", () => {
    expect(matchVisit(full, full.visits[0]!, "gutters")).toBe(true);
    expect(matchVisit(full, full.visits[0]!, "meeting")).toBe(false);
  });
});
