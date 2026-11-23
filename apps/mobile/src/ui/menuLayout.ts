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

/**
 * Where a value menu stands (DS §9б.4, #2412): as wide as its words between `minW` and `maxW`. A field at least `maxW` wide — the
 * menu's right edge on the field's right edge (iOS pop-up); a narrower field — the menu starts at the field's left edge, but never
 * past the window's edges.
 */
export function fitMenuPlace(o: { x: number; w: number; winW: number; minW: number; maxW: number; edgeL: number; edgeR: number }): { left?: number; right?: number; minWidth: number; maxWidth: number } {
  if (o.w >= o.maxW) return { right: Math.max(o.edgeR, o.winW - (o.x + o.w)), minWidth: o.minW, maxWidth: o.maxW };
  return { left: Math.max(o.edgeL, Math.min(o.x, o.winW - o.edgeR - o.maxW)), minWidth: o.minW, maxWidth: o.maxW };
}

/** more than `maxItems`, a picture or a line under the name make a list, not a menu (DS §9б.1 п.6); long names — the place that
 *  knows its words says `list` (a count of letters would flip with the language and the data) */
export function opensList(items: { leading?: unknown; subtitle?: string }[], maxItems: number): boolean {
  return items.length > maxItems || items.some((i) => !!i.leading || !!i.subtitle);
}
