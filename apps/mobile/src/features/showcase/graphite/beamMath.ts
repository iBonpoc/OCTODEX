/**
 * «Графит» (пилот #2254): where the «Прожектор» beam stands, apart from the animation so it is unit-tested (rule 27 (а)).
 * The nav is a glass pill of `width` with `count` equal slots; the beam is centred over the selected slot, `beamW` wide,
 * and never leaves the pill. The «＋» slot is not a tab: the beam does not go to it.
 */
export function slotWidth(width: number, count: number): number {
  return count > 0 ? width / count : 0;
}

/** the beam's left edge over slot `index` */
export function beamX(
  index: number,
  width: number,
  count: number,
  beamW: number,
): number {
  if (count <= 0 || width <= 0) return 0;
  const i = Math.min(count - 1, Math.max(0, Math.round(index)));
  const w = slotWidth(width, count);
  const x = i * w + (w - beamW) / 2;
  return Math.min(width - beamW, Math.max(0, x));
}

/** the beam's width: most of a slot, never wider than the slot */
export const beamWidth = (width: number, count: number, share = 0.6): number =>
  Math.max(0, slotWidth(width, count) * share);

/** the slot the beam may stand on: a tap on «＋» (or outside) keeps it where it was */
export function nextBeamSlot(
  tapped: number,
  current: number,
  plusIndex: number,
  count: number,
): number {
  if (tapped === plusIndex || tapped < 0 || tapped >= count) return current;
  return tapped;
}

/** «rgba(r,g,b,a)» → «rgb(r,g,b)» and a: an SVG stop takes its opacity apart */
export const rgbOf = (c: string): string =>
  c.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, "rgb($1,$2,$3)");
export const alphaOf = (c: string): number => {
  const m = /^rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)$/.exec(c);
  return m ? Number(m[1]) : 1;
};
