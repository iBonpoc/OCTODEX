/**
 * «Посчитать угол» from the first tap (founder 09.11, #696: «с первого раза не считает, окно сворачивается… надо два
 * раза нажимать»). On an iPhone the first tap after typing C may only put the number keyboard away (the sheet drops,
 * the tap misses the button) — so the triangle also counts itself when the keyboard goes, once C is typed and these
 * three lengths were not counted yet. Pure: what to count, and whether the keyboard's going should count.
 */
export interface Len { ft: string; inch: string }

/** the three lengths as one key — the same lengths are counted once */
export const triKey = (a: Len, b: Len, c: Len) => [a, b, c].map((x) => `${x.ft.trim()}'${x.inch.trim()}`).join("|");

/** the keyboard went: count when C has a number and these lengths are new (a bad triangle says so, like the button) */
export function countOnKeyboardHide(a: Len, b: Len, c: Len, lastKey: string | null): boolean {
  if (!/\d/.test(c.ft + c.inch)) return false;
  return triKey(a, b, c) !== lastKey;
}
