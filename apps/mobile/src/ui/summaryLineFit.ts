/**
 * SummaryLine's fit, pure (BUILD-PLAN §1 поток Б): the facts stand in one line, never wrap; what does not fit is cut at a whole
 * item and the line ends with «…». `widths` — each item's measured width, `sep` — the « · » between two, `tail` — the «…».
 * Returns how many items are shown and whether the tail is drawn. Not measured (room 0) — all are drawn (the line hides the overflow).
 */
export function summaryFit(widths: readonly number[], room: number, sep: number, tail: number): { shown: number; cut: boolean } {
  const n = widths.length;
  if (!(room > 0) || !n) return { shown: n, cut: false };
  const sum = (k: number) => widths.slice(0, k).reduce((a, w, i) => a + w + (i ? sep : 0), 0);
  if (sum(n) <= room) return { shown: n, cut: false };
  for (let k = n - 1; k >= 1; k--) if (sum(k) + sep + tail <= room) return { shown: k, cut: true };
  // not even one whole item with the tail: the first one stays (cut by the line), the tail after it
  return { shown: 1, cut: n > 1 };
}
