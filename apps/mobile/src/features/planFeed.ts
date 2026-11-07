/**
 * «Лента» of the Plan (docs/specs/13-app-structure.md §3.2, wave 5): visits, inspections, tasks with a time, events and
 * days off in one list by the company's days. Pure — tested in test/planFeed.test.ts (and in several zones).
 */
import type { CalendarEvent, DB, ID, Role, Task, Visit } from "@/data/types";
import { addDays } from "./calendar";
import { dayKeyIn, dayNumber, getZone, minuteIn, wallToInstant, type DayKey } from "./zone";
import { assigneesOf, isOpenVisit, liveAssignees, type PlanWho } from "./schedule";

export type PlanItemKind = "visit" | "task" | "event" | "timeOff";
/** `at` — the sort key of the item on its day: "" when it began on an earlier day (it runs from the day's start) */
type Base = { id: ID; day: DayKey; start: string; allDay: boolean; people: ID[]; at: string };
export type PlanItem =
  | (Base & { kind: "visit"; end: string; done: boolean; visit: Visit })
  | (Base & { kind: "task"; end?: string; done: boolean; task: Task })
  | (Base & { kind: "event" | "timeOff"; end: string; done: false; event: CalendarEvent });

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
  // a cheap cut before the days are counted: anything wholly more than a day outside the range is skipped
  const lo = new Date(`${range.from}T00:00:00Z`).getTime() - 2 * 86_400_000;
  const hi = new Date(`${range.to}T00:00:00Z`).getTime() + 3 * 86_400_000;
  const near = (startIso: string, endIso?: string) => {
    const a = new Date(startIso).getTime();
    const b = endIso ? new Date(endIso).getTime() : a;
    return a < hi && Math.max(a, b) > lo;
  };
  const at = (startIso: string, day: DayKey) => (dayKeyIn(startIso, tz) < day ? "" : new Date(startIso).toISOString());
  const out: PlanItem[] = [];
  for (const v of db.visits) {
    const done = !isOpenVisit(v);
    if (done && !opts.showDone) continue;
    const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
    if (!near(v.start, end)) continue;
    const people = assigneesOf(v);
    if (!whoMatches(people, whoNow, db.me)) continue;
    // a visit past midnight is on both days, like a task or an event
    for (const day of spanDays(v.start, end, tz))
      if (inRange(day)) out.push({ kind: "visit", id: v.id, day, start: v.start, end, allDay: !!v.allDay, people, done, visit: v, at: at(v.start, day) });
  }
  for (const t of db.tasks ?? []) {
    if (!t.startsAt) continue;   // only a task with a time is in the Plan (13 §3.7); a due date alone stays in «Задачи»
    const done = !!t.doneAt;
    if (done && !opts.showDone) continue;
    if (!near(t.startsAt, t.endsAt)) continue;
    const people = t.assigneeId ? [t.assigneeId] : [];
    if (!whoMatches(people, whoNow, db.me)) continue;
    for (const day of spanDays(t.startsAt, t.endsAt, tz))
      if (inRange(day)) out.push({ kind: "task", id: t.id, day, start: t.startsAt, end: t.endsAt, allDay: !!t.allDay, people, done, task: t, at: at(t.startsAt, day) });
  }
  for (const e of db.calendarEvents ?? []) {
    if (!near(e.startsAt, e.endsAt)) continue;
    const people = e.userId ? [e.userId] : [];
    if (!whoMatches(people, whoNow, db.me, e.kind === "event" && !e.userId)) continue;
    const kind = e.kind === "time_off" ? "timeOff" : "event";
    for (const day of spanDays(e.startsAt, e.endsAt, tz))
      if (inRange(day)) out.push({ kind, id: e.id, day, start: e.startsAt, end: e.endsAt, allDay: e.allDay, people, done: false, event: e, at: at(e.startsAt, day) });
  }
  return out.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(b.allDay) - Number(a.allDay) ||
      // a span that began on an earlier day is «from the start of this day» (at = "")
      (a.allDay ? 0 : a.at.localeCompare(b.at)) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The time words of a card on its day: `when` leads the title (the start, «Весь день», or «– end» on a day it carries
 * over to), `until` goes to the subtitle («– end» on the day it began). `time` formats a moment in the company's clock.
 */
export function itemTimes(x: Pick<PlanItem, "allDay" | "at" | "start" | "end">, time: (iso: string) => string, allDayLabel: string): { when: string; until?: string } {
  if (x.allDay) return { when: allDayLabel };
  if (x.at === "") return { when: x.end ? `– ${time(x.end)}` : time(x.start) };
  return { when: time(x.start), until: x.end ? `– ${time(x.end)}` : undefined };
}

/** the items grouped by day, every day of the list present (an empty day shows «На этот день ничего нет») */
export function groupByDay(items: PlanItem[], days: DayKey[]): { day: DayKey; items: PlanItem[] }[] {
  return days.map((day) => ({ day, items: items.filter((x) => x.day === day) }));
}

/**
 * A list of days where a run of empty days is one row (24 §B: «Вс, 8 – Чт, 12 нояб. · свободно»). Today is never folded
 * into a run — it stays its own row, empty or not. «Empty» is the same as the cards: what `planItems` gave for that day
 * after «Чей план» and «Показывать выполненные»; a day with only an event or a day off is not empty.
 */
export type DayRow = { kind: "day"; day: DayKey; items: PlanItem[] } | { kind: "free"; from: DayKey; to: DayKey };
export function collapseEmpty(groups: { day: DayKey; items: PlanItem[] }[], today: DayKey): DayRow[] {
  const out: DayRow[] = [];
  for (const g of groups) {
    if (g.items.length || g.day === today) {
      out.push({ kind: "day", day: g.day, items: g.items });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "free" && last.to === addDays(g.day, -1)) last.to = g.day;
    else out.push({ kind: "free", from: g.day, to: g.day });
  }
  return out;
}

/**
 * The load of a day for the Week strip and the Month cell (24 §B, 17-job §12.2): every item the Feed shows that day, the
 * same filters. `unassigned` — an open visit nobody live is on (the only yellow); `dayOff` — the picked person (or the
 * tech himself) has a day off that day; with «Все» one person's day off is not the day's.
 */
/** `unassigned` — how many open visits have nobody live on them (0 = no yellow) */
export type DayLoad = { n: number; unassigned: number; dayOff: boolean };
export function dayLoads(items: PlanItem[], members: DB["members"], personal: boolean): Map<DayKey, DayLoad> {
  const out = new Map<DayKey, DayLoad>();
  for (const x of items) {
    const d = out.get(x.day) ?? { n: 0, unassigned: 0, dayOff: false };
    d.n += 1;
    if (x.kind === "visit" && !x.done && !liveAssignees(x.visit, members).length) d.unassigned += 1;
    if (x.kind === "timeOff" && personal) d.dayOff = true;
    out.set(x.day, d);
  }
  return out;
}

/**
 * The day a visit form opens on (review of #267): a start it already has → that day; a day picked in the Plan («＋» of a
 * free row, the Day) → that day; nothing → tomorrow. Never before today — a «＋» on a past free row opens today. The time
 * is the form's own (its first free slot, never a past one), not a fixed hour. Offsets from today.
 */
export function formDayOffset(init: { start?: string | null; day?: DayKey }, today: DayKey, tz: string = getZone()): number {
  const from = init.start ? dayKeyIn(init.start, tz) : init.day;
  return from ? Math.max(0, dayNumber(from) - dayNumber(today)) : 1;
}

/** the days from one company day to another, inclusive */
export function daysFrom(from: DayKey, to: DayKey): DayKey[] {
  const n = Math.max(0, Math.min(dayNumber(to) - dayNumber(from), 366));
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/* ---------- events and days off (wave 5, PR-B) ---------- */

export type EventProblem = "title" | "person" | "time" | "long";
/**
 * What stops an event or a day off from being saved — the same rules as the server (calendar_events checks): an event
 * has a name, a day off is always someone's, the end is after the start (an all-day one ends at a later midnight);
 * name ≤ 200, description ≤ 4000.
 */
export function eventProblems(e: Pick<CalendarEvent, "kind" | "title" | "userId" | "startsAt" | "endsAt" | "description">): EventProblem[] {
  const out: EventProblem[] = [];
  const title = e.title?.trim() ?? "";
  if (e.kind === "event" && !title) out.push("title");
  if (e.kind === "time_off" && !e.userId) out.push("person");
  const a = new Date(e.startsAt).getTime();
  const b = new Date(e.endsAt).getTime();
  if (!(Number.isFinite(a) && Number.isFinite(b) && b > a)) out.push("time");
  if (title.length > 200 || (e.description?.length ?? 0) > 4000) out.push("long");
  return out;
}

/** the fields of the event form: what an event opens with, and the moments they make (company days and clock) */
export type EventFields = { day: DayKey; allDay: boolean; days: number; startMin: number; duration: number };
export function eventFields(e: CalendarEvent | undefined, newDay: DayKey, tz: string = getZone()): EventFields {
  if (!e) return { day: newDay, allDay: false, days: 1, startMin: 9 * 60, duration: 60 };
  const day = dayKeyIn(e.startsAt, tz);
  if (e.allDay) return { day, allDay: true, days: spanDays(e.startsAt, e.endsAt, tz).length, startMin: 9 * 60, duration: 60 };
  return { day, allDay: false, days: 1, startMin: minuteIn(e.startsAt, tz), duration: Math.max(15, Math.round((Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 60_000)) };
}
export function eventRange(f: EventFields, tz: string = getZone()): { startsAt: string; endsAt: string } {
  if (f.allDay) return { startsAt: wallToInstant(f.day, 0, tz), endsAt: wallToInstant(addDays(f.day, f.days), 0, tz) };
  const startsAt = wallToInstant(f.day, f.startMin, tz);
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + f.duration * 60_000).toISOString() };
}
