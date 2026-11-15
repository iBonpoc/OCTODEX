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
