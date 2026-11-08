/**
 * Gutters module: the $ under the drawing while measuring (docs/specs/33-gutters-canvas.md П20.2 №3; П14.2 e8).
 * A preview, not the estimate: parts × a rate per section and unit. The real estimate prices each part from the
 * company's price list (M8); the preview already takes the list's price of a part where the company has one (M7d). Rates here are whatever the caller gives — in the app, TEST rates marked «тестовые»
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
  /** parts priced from the company's price list (M7d, spec 33 П22.10); the rest — at the caller's rates */
  listed: number;
}

/** the company's price of one part, cents per unit (found in its price list), or undefined — then the rate is used */
export type PartPrice = (p: PartQty) => number | undefined;

export function gutterPreview(parts: readonly PartQty[], rates: PreviewRates, priceOf?: PartPrice): GutterPreview {
  let sum = dec(0);
  let unpriced = 0;
  let listed = 0;
  let gutterFt = dec(0);
  for (const p of parts) {
    if (p.use === "purchase") continue; // supplier-only (coil, sticks, boxes): not in the client's price
    if (p.section === "gutter" && p.unit === "ft") gutterFt = gutterFt.add(p.qty);
    const own = priceOf?.(p);
    // a price from the list is whole cents ≥ 0 (catalog_items.unit_price_cents); anything else is not a price
    if (own !== undefined && Number.isSafeInteger(own) && own >= 0) {
      listed++;
      sum = sum.add(dec(p.qty).mul(own));
      continue;
    }
    const rate = rates[`${p.section}.${p.unit}`];
    if (rate === undefined) {
      unpriced++;
      continue;
    }
    sum = sum.add(dec(p.qty).mul(rate));
  }
  return { totalCents: roundCents(sum), unpriced, gutterFt: gutterFt.toString(), listed };
}
