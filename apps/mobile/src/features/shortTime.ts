/**
 * Short words of time and people for one cell, a tile or a pill (DS §4.5 «Длительность»; the Home's «тройка цифр», the lead rows).
 * Pure, no React, no clock: `now` comes in (rule 19), the tests are `test/shortTime.test.ts`.
 * - `waitShort` — one unit only: «45 мин», «20 ч», «2 дн» (never «1217 мин», never «20 ч 26 мин»);
 * - `waitParams` — the attention / lead params `{ m }` (minutes) with `m` as those words, for the keys «Ждёт ответа {m}»;
 * - `roadShort` — «в дороге» of a visit en route: the short wait up to 3 h, past it — since when («с 8:34», «с вчера»);
 * - `visitWho` — who does the visit: the first name of the employee, a sub by its company («субподрядчик»), nobody — «Не назначен».
 */
import type { Member, Visit } from "@/data/types";
import type { DictKey } from "@/i18n";
import { dayKeyIn, daysBetween } from "./zone";

type Tr = (k: DictKey, p?: Record<string, string | number>) => string;

/** «45 мин» · «20 ч» · «2 дн»: under an hour — minutes, under a day — whole hours, then whole days */
export function waitShort(min: number, t: Tr): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return t("time.min", { n: m });
  if (m < 60 * 24) return t("time.h", { h: Math.floor(m / 60) });
  return t("time.days", { n: Math.floor(m / 1440) });
}

/** the params of a wait key with `m` in words («Ждёт ответа {m}» → «Ждёт ответа 20 ч»); other params untouched */
export function waitParams<P extends Record<string, string | number> | undefined>(p: P, t: Tr): P {
  if (!p || typeof p.m !== "number") return p;
  return { ...p, m: waitShort(p.m, t) };
}

/** past this a running number says nothing — the cell tells since when (bug 20.11: «20 ч 26 мин в дороге») */
export const ROAD_LONG_MIN = 180;

/** «в дороге»: «25 мин», «2 ч»; longer than 3 h — «с 8:34» the same day, «с вчера», older — «с 18.11» via `day` */
export function roadShort(enRouteAt: string, now: number, t: Tr, fmt: { time: (iso: string) => string; day: (iso: string) => string }, tz?: string): string {
  const min = Math.max(1, Math.round((now - Date.parse(enRouteAt)) / 60_000));
  if (min <= ROAD_LONG_MIN) return waitShort(min, t);
  const back = daysBetween(dayKeyIn(enRouteAt, tz), dayKeyIn(now, tz));
  if (back <= 0) return t("px1.road.since", { time: fmt.time(enRouteAt) });
  if (back === 1) return t("px1.road.sinceYesterday");
  return t("px1.road.since", { time: fmt.day(enRouteAt) });
}

/** who does the visit, for one short cell: an employee's first name («Alex», «Alex +1»), a sub's company word, nobody — «Не назначен» */
export function visitWho(v: Partial<Pick<Visit, "assigneeIds" | "techId">>, members: readonly Pick<Member, "id" | "name" | "kind">[], t: Tr): { value: string; label: string; none: boolean } {
  const ids = v.assigneeIds ?? (v.techId ? [v.techId] : []);
  const who = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is Pick<Member, "id" | "name" | "kind"> => !!m && !!m.name.trim());
  const first = who[0];
  if (!first) return { value: t("st.unassigned"), label: t("w2a.tech"), none: true };
  const word = first.name.trim().split(/\s+/)[0] ?? first.name;
  const more = who.length > 1 ? ` +${who.length - 1}` : "";
  return { value: `${word}${more}`, label: t(first.kind === "sub" ? "plan.sub" : "w2a.tech"), none: false };
}
