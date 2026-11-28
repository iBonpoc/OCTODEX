import { component, space } from "@octo/design-tokens";

/**
 * The row of view tabs (DS §9 А1п, #1343) without React: where it scrolls to, which edge fades, how far it nudges.
 * `tab` — a pill's place in the row (x from the row's start, its width); `view` — the visible width; `content` — the row's.
 */
type Box = { x: number; w: number };

/** the selected pill to the middle of what is seen, never past either end */
export function centerOffset(tab: Box, view: number, content: number): number {
  const max = Math.max(0, content - view);
  return Math.min(max, Math.max(0, Math.round(tab.x - (view - tab.w) / 2)));
}

/**
 * #3060 («вкладки обрезаны слева — видна одинокая «4»»): the middle of the row may cut the tab before the selected one, and a sliver of
 * it («4» of «Счета 4») reads as a broken word. The row stops where a WHOLE tab starts (with the row's own left inset before it),
 * the stop nearest to the middle that still shows the selected tab whole; none fits — the middle as it was.
 */
export function wholeOffset(tab: Box, tabs: Box[], view: number, content: number): number {
  const mid = centerOffset(tab, view, content);
  const max = Math.max(0, content - view);
  if (!max || !tabs.length) return mid;
  const lead = Math.min(...tabs.map((b) => b.x));
  const stops = [0, ...tabs.map((b) => Math.round(b.x - lead))].filter((x) => x >= 0 && x <= max && x <= tab.x - lead && x + view >= tab.x + tab.w);
  if (!stops.length) return mid;
  return stops.reduce((best, x) => (Math.abs(x - mid) < Math.abs(best - mid) ? x : best), stops[0]!);
}

/**
 * #3060: the last tabs have no whole-tab stop when the row cannot scroll that far (the end cuts a sliver at the left, «4» of «Счета 4»).
 * The room the row adds after its right inset so the selected LAST tab can stand whole with a whole tab at the left edge; 0 — none needed.
 */
export function tailRoom(tabs: Box[], view: number): number {
  if (!tabs.length || !view) return 0;
  const lead = Math.min(...tabs.map((b) => b.x));
  const last = tabs.reduce((a, b) => (b.x > a.x ? b : a));
  const end = last.x + last.w + lead; // the row's end with its right inset
  if (end <= view) return 0;
  const stop = tabs.map((b) => b.x - lead).filter((x) => x >= end - view).sort((a, b) => a - b)[0];
  return stop === undefined ? 0 : Math.max(0, Math.round(stop + view - end));
}

/** an edge fades only where more tabs lie past it (a hair of slack: a rounded offset is not «more») */
export function fadedEdges(offset: number, view: number, content: number): { left: boolean; right: boolean } {
  const slack = 2;
  return { left: offset > slack, right: offset + view < content - slack };
}

/** the one nudge on the first open shows the row scrolls: as far as a fade and a step past it, or less if the row is shorter; none when it fits */
export function nudgeDistance(view: number, content: number): number {
  const more = content - view;
  return more > 0 ? Math.min(more, component.tab.fadeW + space[6]) : 0;
}

/** a step of the `steps` strip: passed («✓»), the current one (the accent), still ahead (`mut`) */
export type StepState = "done" | "now" | "next";

/**
 * The steps strip (BUILD-SPEC §1 SectionStrip `steps`; the visit: В пути · На месте · Работа · Подпись · Оплата): every step before
 * the current one is passed, the current one is now, the rest are ahead. A current key that is not among the steps — nothing is
 * passed (the visit has not started); `done` — all passed (the visit is closed).
 */
export function stepStates(keys: readonly string[], current: string | "done"): StepState[] {
  if (current === "done") return keys.map(() => "done");
  const at = keys.indexOf(current);
  return keys.map((_, i) => (at < 0 ? "next" : i < at ? "done" : i === at ? "now" : "next"));
}
