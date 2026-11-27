/**
 * «Посчитать угол» from the first tap (founder 09.11, #696: «с первого раза не считает, окно сворачивается… надо два
 * раза нажимать»). On an iPhone the first tap after typing C may only put the number keyboard away (the sheet drops,
 * the tap misses the button) — so the triangle also counts itself when the keyboard goes, once C is typed and these
 * three lengths were not counted yet. Pure: what to count, and whether the keyboard's going should count.
 */
export interface Len { ft: string; inch: string; /** the fraction of the inch in sixteenths (#3071: a fraction, as the length window has it — not «0.125») */ e16?: number }

/** the three lengths as one key — the same lengths are counted once */
export const triKey = (a: Len, b: Len, c: Len) => [a, b, c].map((x) => `${x.ft.trim()}'${x.inch.trim()}+${x.e16 ?? 0}`).join("|");

/** a length in inches as the triangle's fields: whole feet, whole inches and sixteenths (11.97″ is a foot, never «12″») */
export function lenFields(n: number): Required<Len> {
  const q = Math.round(n * 16);
  const rest = q % (12 * 16);
  return { ft: String(Math.floor(q / (12 * 16))), inch: String(Math.floor(rest / 16)), e16: rest % 16 };
}

/** the keyboard went: count when C has a number and these lengths are new (a bad triangle says so, like the button) */
export function countOnKeyboardHide(a: Len, b: Len, c: Len, lastKey: string | null): boolean {
  if (!/\d/.test(c.ft + c.inch)) return false;
  return triKey(a, b, c) !== lastKey;
}
