/**
 * 6-3 (17-job §12.2) and 24 §B: Week and Month count what the Feed shows (planItems, the same filters), and a run of empty
 * days is one row. The company is in Los Angeles; days are its days.
 */
import { describe, expect, it } from "vitest";
import { collapseEmpty, dayLoads, daysFrom, formDayOffset, groupByDay, planItems } from "../src/features/planFeed";
import type { CalendarEvent, DB, Visit } from "../src/data/types";

const LA = "America/Los_Angeles";
const V = (id: string, p: Partial<Visit>): Visit => ({ id, techId: "m-ivan", assigneeIds: ["m-ivan"], start: "", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
const Ev = (id: string, p: Partial<CalendarEvent>): CalendarEvent => ({ id, kind: "event", startsAt: "", endsAt: "", allDay: false, ...p });
const members = [
  { id: "m-ivan", name: "Ivan", roles: ["tech"] },
  { id: "m-luis", name: "Luis", roles: ["tech"] },
] as unknown as DB["members"];
const db = (p: { visits?: Visit[]; calendarEvents?: CalendarEvent[] }, me = "m-ivan") =>
  ({ visits: [], tasks: [], calendarEvents: [], me, ...p }) as Pick<DB, "visits" | "me" | "tasks" | "calendarEvents">;
const week = daysFrom("2026-11-08", "2026-11-14"); // Sun–Sat

describe("Week and Month count the Feed's items (17-job §12.2)", () => {
  const data = db({
    visits: [
      // 11:00 PM LA Nov 9 → 1:00 AM Nov 10: on both days
      V("late", { start: "2026-11-10T07:00:00.000Z", durationMin: 120 }),
      // nobody on it, Nov 11: the only yellow
      V("nobody", { start: "2026-11-11T17:00:00.000Z", techId: null, assigneeIds: [] }),
      // done, Nov 12: hidden unless «Показывать выполненные»
      V("done", { start: "2026-11-12T17:00:00.000Z", step: "done", closed: true }),
    ],
    calendarEvents: [
      // a 3-day company event Nov 12–14
      Ev("expo", { startsAt: "2026-11-12T08:00:00.000Z", endsAt: "2026-11-15T08:00:00.000Z", allDay: true }),
      // Luis is off Nov 13
      Ev("off", { kind: "time_off", userId: "m-luis", startsAt: "2026-11-13T08:00:00.000Z", endsAt: "2026-11-14T08:00:00.000Z", allDay: true }),
    ],
  });
  const range = { from: week[0]!, to: week[6]! };

  it("a visit past midnight counts on both days; a 3-day event on each of its days", () => {
    const loads = dayLoads(planItems(data, range, "all", "director", { tz: LA }), members, false);
    expect(loads.get("2026-11-09")?.n).toBe(1);
    expect(loads.get("2026-11-10")?.n).toBe(1);
    expect(["2026-11-12", "2026-11-13", "2026-11-14"].map((k) => loads.get(k)?.n)).toEqual([1, 2, 1]); // + Luis's day off on 13
  });
  it("yellow only for an open visit nobody is on", () => {
    const loads = dayLoads(planItems(data, range, "all", "director", { tz: LA }), members, false);
    expect([...loads].filter(([, l]) => l.unassigned > 0).map(([k]) => k)).toEqual(["2026-11-11"]);
  });
  it("done visits are not counted until «Показывать выполненные» — the same switch as the Feed", () => {
    const hide = dayLoads(planItems(data, range, "all", "director", { tz: LA }), members, false);
    const show = dayLoads(planItems(data, range, "all", "director", { tz: LA, showDone: true }), members, false);
    expect(hide.get("2026-11-12")?.n).toBe(1);
    expect(show.get("2026-11-12")?.n).toBe(2);
  });
  it("a day off is the day's only in one person's plan; «Все» does not mark it; a tech does not see a colleague's", () => {
    const all = dayLoads(planItems(data, range, "all", "director", { tz: LA }), members, false);
    const luis = dayLoads(planItems(data, range, "m-luis", "director", { tz: LA }), members, true);
    const ivan = dayLoads(planItems(data, range, "me", "tech", { tz: LA }), members, true);
    expect(all.get("2026-11-13")?.dayOff).toBe(false);
    expect(luis.get("2026-11-13")?.dayOff).toBe(true);
    expect(ivan.get("2026-11-13")?.dayOff ?? false).toBe(false);
  });
});

describe("a run of empty days is one row (24 §B)", () => {
  const items = planItems(
    db({ visits: [V("a", { start: "2026-11-08T17:00:00.000Z" }), V("b", { start: "2026-11-13T17:00:00.000Z" })] }),
    { from: week[0]!, to: week[6]! }, "all", "director", { tz: LA },
  );
  it("Sun busy, Mon–Thu free → one row, Fri busy, Sat free → its own row", () => {
    const rows = collapseEmpty(groupByDay(items, week), "2026-11-01");
    expect(rows.map((r) => (r.kind === "day" ? r.day : `${r.from}..${r.to}`))).toEqual(["2026-11-08", "2026-11-09..2026-11-12", "2026-11-13", "2026-11-14..2026-11-14"]);
  });
  it("today is never folded into a run, even when empty", () => {
    const rows = collapseEmpty(groupByDay(items, week), "2026-11-10");
    expect(rows.map((r) => (r.kind === "day" ? r.day : `${r.from}..${r.to}`))).toEqual(["2026-11-08", "2026-11-09..2026-11-09", "2026-11-10", "2026-11-11..2026-11-12", "2026-11-13", "2026-11-14..2026-11-14"]);
  });
  it("a day with only an event is not empty", () => {
    const withEvent = planItems(db({ calendarEvents: [Ev("e", { startsAt: "2026-11-10T18:00:00.000Z", endsAt: "2026-11-10T19:00:00.000Z" })] }), { from: week[0]!, to: week[6]! }, "all", "director", { tz: LA });
    const rows = collapseEmpty(groupByDay(withEvent, week), "2026-11-01");
    expect(rows.map((r) => r.kind)).toEqual(["free", "day", "free"]);
  });
});

describe("yellow is an open visit nobody is on (review of #267)", () => {
  it("a done visit with nobody on it is not yellow, even with «Показывать выполненные»", () => {
    const items = planItems(
      db({ visits: [V("gone", { start: "2026-11-10T17:00:00.000Z", techId: null, assigneeIds: [], step: "done", closed: true })] }),
      { from: week[0]!, to: week[6]! }, "all", "director", { tz: LA, showDone: true },
    );
    const l = dayLoads(items, members, false).get("2026-11-10");
    expect(l?.n).toBe(1);
    expect(l?.unassigned).toBe(0);
  });
  it("counts the open visits nobody is on", () => {
    const items = planItems(
      db({ visits: [V("a", { start: "2026-11-10T17:00:00.000Z", techId: null, assigneeIds: [] }), V("b", { start: "2026-11-10T19:00:00.000Z", techId: null, assigneeIds: [] })] }),
      { from: week[0]!, to: week[6]! }, "all", "director", { tz: LA },
    );
    expect(dayLoads(items, members, false).get("2026-11-10")?.unassigned).toBe(2);
  });
});

describe("the day a visit form opens on (review of #267: «＋» of a day was always 9:00)", () => {
  it("a picked day → that day; the time is the form's own (no fixed hour in it)", () => {
    expect(formDayOffset({ day: "2026-11-12" }, "2026-11-10", LA)).toBe(2);
  });
  it("a past free row («Пн – Вт» on a Wednesday) → today, never before", () => {
    expect(formDayOffset({ day: "2026-11-09" }, "2026-11-11", LA)).toBe(0);
  });
  it("a start it already has wins; nothing → tomorrow", () => {
    expect(formDayOffset({ start: "2026-11-13T18:00:00.000Z", day: "2026-11-12" }, "2026-11-10", LA)).toBe(3);
    expect(formDayOffset({}, "2026-11-10", LA)).toBe(1);
  });
});
