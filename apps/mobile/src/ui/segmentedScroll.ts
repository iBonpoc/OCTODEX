/**
 * Segmented with `scroll` (a line of tabs that slides sideways on a narrow phone): the selected tab is always brought
 * into view — a remembered «Файлы» of the next lead is never left past the edge («Карточки» №8, #438; «Лиды» №13).
 * Pure: the offset to scroll to, or null when the tab is already wholly visible.
 */
export function offsetToShow(tab: { x: number; w: number }, view: { w: number; offset: number; content: number }, margin: number): number | null {
  if (view.w <= 0) return null;
  const left = tab.x - margin;
  const right = tab.x + tab.w + margin;
  if (left >= view.offset && right <= view.offset + view.w) return null;
  const max = Math.max(0, view.content - view.w);
  const to = left < view.offset ? left : right - view.w;
  return Math.min(max, Math.max(0, to));
}
