/**
 * Gutters module: the $ under the drawing while measuring (docs/specs/33-gutters-canvas.md П20.2 №3; П14.2 e8).
 * A preview, not the estimate: parts × a rate per section and unit. The real estimate prices each part from the
 * company's price list (M8). Rates here are whatever the caller gives — in the app, TEST rates marked «тестовые»
 * (CLAUDE.md rule 9). Money in whole cents, decimal math (rule 8).
 */
import { dec, roundCents } from "./decimal.js";
import type { PartQty } from "./gutterParts.js";

/** cents per unit, by `${section}.${unit}` (e.g. "gutter.ft", "corners_caps.ea", "labor.ft") */
export type PreviewRates = Readonly<Record<string, number>>;

export interface GutterPreview {
  totalCents: number;
  /** parts of the estimate with no rate (shown as «нет цены», not as $0) */
  unpriced: number;
  /** installed gutter, feet (decimal string) */
  gutterFt: string;
}

export function gutterPreview(parts: readonly PartQty[], rates: PreviewRates): GutterPreview {
  let sum = dec(0);
  let unpriced = 0;
  let gutterFt = dec(0);
  for (const p of parts) {
    if (p.use === "purchase") continue; // supplier-only (coil, sticks, boxes): not in the client's price
    if (p.section === "gutter" && p.unit === "ft") gutterFt = gutterFt.add(p.qty);
    const rate = rates[`${p.section}.${p.unit}`];
    if (rate === undefined) {
      unpriced++;
      continue;
    }
    sum = sum.add(dec(p.qty).mul(rate));
  }
  return { totalCents: roundCents(sum), unpriced, gutterFt: gutterFt.toString() };
}
