/**
 * The geometry of a long menu (DS А2, #1164). Pure, so it is tested by its numbers: how high the list is, and where it
 * scrolls to so the chosen row is in view.
 */

/** the list's height: its rows, but no more than `maxRows` (the last one half — it scrolls), and never more than the window leaves */
export function menuListHeight(o: { count: number; rowH: number; maxRows: number; room: number; pad: number; titleH: number }): number {
  return Math.max(0, Math.min(o.count * o.rowH, o.maxRows * o.rowH, o.room - o.pad * 2 - o.titleH));
}

/** where to scroll so the row at `rowY` is in the middle of the window; a list that fits does not scroll; never past the ends */
export function menuScrollTo(o: { rowY: number; rowH: number; viewH: number; contentH: number }): number {
  if (o.contentH <= o.viewH) return 0;
  return Math.max(0, Math.min(o.rowY - (o.viewH - o.rowH) / 2, o.contentH - o.viewH));
}
