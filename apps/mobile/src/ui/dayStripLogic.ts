/** The math of the day strip (src/ui/dayStrip.tsx, BUILD-SPEC §1 «DayStrip»): which days, where it scrolls, how a pill looks. */
import { component, space } from "@octo/design-tokens";
import { addDays, weekStart, type DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";

/** how many weeks the strip holds: the one before the picked day's, its own and two after (a swipe sideways, no arrows) */
export const STRIP_WEEKS_BEFORE = 1;
export const STRIP_WEEKS = 4;
const pill = component.dayPill;

/** the days of the strip around a day: from the Monday a week before, four weeks */
export function stripDays(k: DayKey): DayKey[] {
  const from = addDays(weekStart(k), -7 * STRIP_WEEKS_BEFORE);
  return Array.from({ length: 7 * STRIP_WEEKS }, (_, i) => addDays(from, i));
}

/** where the strip scrolls so the pill `i` stands in the middle of a row `w` wide (never before the start) */
export function stripOffset(i: number, w: number): number {
  return Math.max(0, space[4] + i * (pill.w + pill.gap) - (w - pill.w) / 2);
}

/** what a pill looks like (visual v2 «Пилюли дней»): the picked one is the accent's TONE with a 1.5 accent frame and its words in
 *  `accText` — not a fill (the Plan's one yellow fill is the segment «День»); today has its number in `accText` */
export function pillLook(selected: boolean, today: boolean): { fill: "tint" | "surf"; edge: "acc" | "transparent"; num: "accText" | "ink"; head: "accText" | "mut"; bold: boolean } {
  return { fill: selected ? "tint" : "surf", edge: selected ? "acc" : "transparent", num: selected || today ? "accText" : "ink", head: selected ? "accText" : "mut", bold: selected || today };
}

/** the dot under a pill's number: nothing in the day — none; a visit with nobody on it — warn; else muted (on the picked one — accText) */
export function pillDot(load: DayLoad | undefined, selected: boolean): "none" | "accText" | "warn" | "mut" {
  if (!load?.n) return "none";
  return selected ? "accText" : load.unassigned ? "warn" : "mut";
}
