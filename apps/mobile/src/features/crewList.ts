/**
 * «Бригады сейчас» on «Сегодня» as list cards (docs/specs/06-list-cards.md, PR10a): where a tech is now and what is next.
 * Pure functions, unit-tested in test/crewList.test.ts.
 */
import type { Visit } from "@/data/types";
import { isOpenVisit } from "@/features/schedule";

export interface CrewNow {
  /** the visit the tech is on (en route, on site, working, signed) */
  current?: Visit;
  /** the next visit still to start today */
  next?: Visit;
}

/** today's visits of one tech, sorted by start (todayVisits, assignees through isAssigned) → current and next */
export function crewNow(todays: Visit[]): CrewNow {
  const current = todays.find((v) => v.step !== "scheduled" && isOpenVisit(v));
  const next = todays.find((v) => v.step === "scheduled" && v !== current && (!current || v.start >= current.start));
  return { current, next };
}
