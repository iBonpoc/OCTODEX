/**
 * «Лента» of the Plan (docs/specs/13-app-structure.md §3.2, wave 5): visits, inspections, tasks with a time, events and
 * days off in one list by the company's days. Pure — tested in test/planFeed.test.ts (and in several zones).
 */
import type { CalendarEvent, DB, ID, Role, Task, Visit } from "@/data/types";
import { addDays } from "./calendar";
import { dayKeyIn, dayNumber, getZone, type DayKey } from "./zone";
import { assigneesOf, isOpenVisit, type PlanWho } from "./schedule";

export type PlanItemKind = "visit" | "task" | "event" | "timeOff";
export type PlanItem =
  | { kind: "visit"; id: ID; day: DayKey; start: string; end: string; allDay: false; people: ID[]; done: boolean; visit: Visit }
  | { kind: "task"; id: ID; day: DayKey; start: string; end?: string; allDay: boolean; people: ID[]; done: boolean; task: Task }
  | { kind: "event" | "timeOff"; id: ID; day: DayKey; start: string; end: string; allDay: boolean; people: ID[]; done: false; event: CalendarEvent };

/** the company days a span covers: the day of its start to the day of its last moment (an end at midnight is not a day) */
export function spanDays(startIso: string, endIso: string | undefined, tz: string = getZone()): DayKey[] {
  const first = dayKeyIn(startIso, tz);
  if (!endIso) return [first];
  const endMs = new Date(endIso).getTime();
  const startMs = new Date(startIso).getTime();
  if (!(endMs > startMs)) return [first];
  const last = dayKeyIn(endMs - 1, tz);
  const n = Math.min(dayNumber(last) - dayNumber(first), 366);   // a bad year-long span is not a reason to hang the Plan
  return Array.from({ length: n + 1 }, (_, i) => addDays(first, i));
}

/** «Чей план» for anything with people: a company-wide event (nobody) shows for everyone */
export function whoMatches(people: ID[], who: PlanWho, me: ID, companyWide = false): boolean {
  if (companyWide || who === "all") return true;
  return people.includes(who === "me" ? me : who);
}

const KIND_ORDER: Record<PlanItemKind, number> = { timeOff: 0, event: 1, visit: 2, task: 3 };

/**
 * Everything of the Plan between two company days (inclusive). A tech sees his own and the company's events; the office
 * picks the person with `who`. Done visits and tasks are hidden unless `showDone` (13 §3.2, §5а).
 * Order: day; «all day» first; then the time; then the kind; then the id (a stable list).
 */
export function planItems(
  db: Pick<DB, "visits" | "me"> & Partial<Pick<DB, "tasks" | "calendarEvents">>,
  range: { from: DayKey; to: DayKey },
  who: PlanWho,
  role: Role,
  opts: { showDone?: boolean; tz?: string } = {},
): PlanItem[] {
  const tz = opts.tz ?? getZone();
  const whoNow: PlanWho = role === "tech" ? "me" : who;
  const inRange = (d: DayKey) => d >= range.from && d <= range.to;
  const out: PlanItem[] = [];
  for (const v of db.visits) {
    const done = !isOpenVisit(v);
    if (done && !opts.showDone) continue;
    const day = dayKeyIn(v.start, tz);
    if (!inRange(day)) continue;
    const people = assigneesOf(v);
    if (!whoMatches(people, whoNow, db.me)) continue;
    const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
    out.push({ kind: "visit", id: v.id, day, start: v.start, end, allDay: false, people, done, visit: v });
  }
  for (const t of db.tasks ?? []) {
    if (!t.startsAt) continue;   // only a task with a time is in the Plan (13 §3.7); a due date alone stays in «Задачи»
    const done = !!t.doneAt;
    if (done && !opts.showDone) continue;
    const people = t.assigneeId ? [t.assigneeId] : [];
    if (!whoMatches(people, whoNow, db.me)) continue;
    for (const day of spanDays(t.startsAt, t.endsAt, tz))
      if (inRange(day)) out.push({ kind: "task", id: t.id, day, start: t.startsAt, end: t.endsAt, allDay: !!t.allDay, people, done, task: t });
  }
  for (const e of db.calendarEvents ?? []) {
    const people = e.userId ? [e.userId] : [];
    if (!whoMatches(people, whoNow, db.me, e.kind === "event" && !e.userId)) continue;
    const kind = e.kind === "time_off" ? "timeOff" : "event";
    for (const day of spanDays(e.startsAt, e.endsAt, tz))
      if (inRange(day)) out.push({ kind, id: e.id, day, start: e.startsAt, end: e.endsAt, allDay: e.allDay, people, done: false, event: e });
  }
  return out.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(b.allDay) - Number(a.allDay) ||
      // a span that began on an earlier day is «from the start of this day»
      (a.allDay ? 0 : startOn(a, tz).localeCompare(startOn(b, tz))) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.id.localeCompare(b.id),
  );
}

/** the start of an item on its day: its own start, or the day's beginning when it began before */
const startOn = (x: PlanItem, tz: string): string => (dayKeyIn(x.start, tz) < x.day ? "" : new Date(x.start).toISOString());

/** the items grouped by day, every day of the list present (an empty day shows «На этот день ничего нет») */
export function groupByDay(items: PlanItem[], days: DayKey[]): { day: DayKey; items: PlanItem[] }[] {
  return days.map((day) => ({ day, items: items.filter((x) => x.day === day) }));
}

/** the days from one company day to another, inclusive */
export function daysFrom(from: DayKey, to: DayKey): DayKey[] {
  const n = Math.max(0, Math.min(dayNumber(to) - dayNumber(from), 366));
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}
