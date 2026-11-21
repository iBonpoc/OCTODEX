/**
 * ObjectHeader's motion, pure (BUILD-SPEC §1, client-card.html (б)/(в); rule 27а — the math is tested, the phone is not a browser):
 * - the compact bar «‹ Имя ⌄ ⋯» comes in once the page is scrolled past `collapseAt` (`component.objectHeader.collapseAt` 24),
 *   fading in over one bar's height (`size.hitMin`) — no jump at the threshold, no flicker when the list bounces above 0;
 * - the panel under the header opens by «⌄» or a swipe down on the header, and closes by «Свернуть» or a swipe up on it.
 *   The panel follows the finger from where the swipe took hold (no jump of the slop), stays within 0…its height, and on let go
 *   goes to the nearer of open / shut counted with the finger's speed — the same release rule as a sheet (`sheetSwipe.ts`).
 */

/** 0 … 1: how far the compact bar has come in at this scroll (0 below `at`, 1 from `at + span`) */
export function compactProgress(scrollY: number, at: number, span: number): number {
  "worklet";
  if (!(scrollY > at)) return 0;
  if (span <= 0) return 1;
  return Math.min(1, (scrollY - at) / span);
}

/** the compact bar takes touches (and the full header's «⌄» is gone off the top) */
export function isCompact(scrollY: number, at: number): boolean {
  "worklet";
  return scrollY >= at;
}

/**
 * Whether a finger on the header becomes the swipe: shut — down, mostly down, past the slop; open — up, mostly up.
 * Sideways past the slop is not ours (a QuickAction, a horizontal strip); the other direction — the page's own scroll.
 */
export function expandSwipeStart(dx: number, dy: number, slop: number, open: boolean): "activate" | "fail" | "wait" {
  const along = open ? -dy : dy;
  if (Math.abs(dx) > slop && Math.abs(dx) * 2 >= Math.abs(dy)) return "fail";
  if (along > slop && along > Math.abs(dx) * 2) return "activate";
  if (-along > slop) return "fail";
  return "wait";
}

/** the finger's travel counted from where the swipe took hold (the slop does not make the panel jump) */
export function followFrom(base: number, travel: number): number {
  "worklet";
  return travel - base;
}

/** how much of the panel is shown (0 … panelH) while the finger moves; `travel` is down-positive, counted from the hold */
export function expandShown(open: boolean, travel: number, panelH: number): number {
  "worklet";
  if (panelH <= 0) return 0;
  const at = (open ? panelH : 0) + travel;
  return Math.min(panelH, Math.max(0, at));
}

/** the release rule (tokens `component.sheetDismissRatio / sheetProjectMs / sheetSlowVelocity / sheetFlickVelocity`) */
export interface ExpandRule {
  settle: number;
  project: number;
  slow: number;
  flick: number;
}

/**
 * Let go: whether the panel ends open. A flick down opens, a flick up shuts; otherwise the nearer of the two counted from
 * where it would be after `project` ms at the finger's speed (from `slow` up). Not measured yet (`panelH` 0) — the direction decides.
 * `velocity` in pt/ms, down-positive.
 */
export function expandEndsOpen(open: boolean, travel: number, velocity: number, panelH: number, r: ExpandRule): boolean {
  if (panelH <= 0) return open ? !(travel < 0) : travel > 0;
  if (velocity >= r.flick) return true;
  if (velocity <= -r.flick) return false;
  const shown = expandShown(open, travel, panelH);
  const where = Math.abs(velocity) >= r.slow ? shown + velocity * r.project : shown;
  return where > panelH * r.settle;
}
