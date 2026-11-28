/**
 * The downspout's own height as typed (#2985): feet, a half foot at most fine; empty — by the storey (null); out of 1–100 ft or not a
 * number — "bad" (said, written nowhere). Pure: the window reads it at once (AttrPanel `DsLength`).
 */
export const DS_OWN_FT_MAX = 100;
export function dsOwnFt(v: string): number | null | "bad" {
  const x = v.trim().replace(",", ".");
  if (x === "") return null;
  const n = Math.round(Number(x) * 2) / 2;
  return Number.isFinite(n) && n >= 1 && n <= DS_OWN_FT_MAX ? n : "bad";
}
