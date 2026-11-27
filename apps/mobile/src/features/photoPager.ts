/**
 * #3082 the photo viewer pages sideways through its strip (as iOS «Фото»): which page an offset shows, and where a page starts.
 * Pure — tested in test/photoPager.test.ts (rule 27: the math of a gesture is tested apart from the phone).
 */

/** the page an offset shows: the nearest one, never outside 0…n-1; no width yet (the first frame) — the page asked for */
export function pageOf(offsetX: number, width: number, n: number, fallback = 0): number {
  if (n <= 0) return 0;
  if (!(width > 0) || !Number.isFinite(offsetX)) return Math.min(Math.max(fallback, 0), n - 1);
  return Math.min(Math.max(Math.round(offsetX / width), 0), n - 1);
}

/** where page i starts (a width change keeps the same photo in view: the offset is set again from the page, not kept) */
export const offsetOf = (i: number, width: number): number => Math.max(0, i) * Math.max(0, width);

/** the page after a step (← / →, VoiceOver «увеличить/уменьшить»): stops at the ends, no wrap (the strip has a start and an end) */
export const stepPage = (i: number, by: 1 | -1, n: number): number => Math.min(Math.max(i + by, 0), Math.max(n - 1, 0));

/**
 * the viewer has to scroll to page `at` itself only when it is not the page in view (a tap, a «next» from outside) or the width
 * changed (a rotation); the page a swipe reached is already in view — scrolling there again fights the finger (#3082)
 */
export const needsPut = (at: number, inView: number, width: number, putAtWidth: number): boolean => at !== inView || width !== putAtWidth;
