/**
 * The supplier order of the core (docs/specs/37 §3, SUP2): how many purchase units to buy for a quantity in the item's
 * own unit. Pack size = how many of the item's unit are in one purchase unit (core C3, catalog_items.pack_size). Any
 * trade; the gutter part keeps its own purchaseQty (the module's). Decimal, never floats.
 */
import { dec, roundCents, type DecLike } from "./decimal.js";

export interface PurchasePacks {
  /** whole purchase units to buy, as text ("2") */
  packs: string;
  /** no pack size on the item: one purchase unit = one unit of the item, «check the pack size» */
  checkPack: boolean;
}

/** ⌈qty ÷ packSize⌉; no (or a non-positive) pack size → ⌈qty⌉ and checkPack. qty < 0 is an error; 0 → 0 packs. */
export function purchasePacks(qty: DecLike, packSize?: DecLike | null): PurchasePacks {
  const q = dec(qty);
  if (q.isNegative()) throw new Error("quantity must be ≥ 0");
  const hasPack = packSize !== undefined && packSize !== null && String(packSize).trim() !== "" && dec(packSize).gt(0);
  const p = hasPack ? dec(packSize!) : dec(1);
  return { packs: q.div(p).ceil().toString(), checkPack: !hasPack };
}

/** the sum of quantities of one item from several lines (decimal text in, decimal text out) */
export function sumQty(qs: DecLike[]): string {
  return qs.reduce((a: ReturnType<typeof dec>, x) => a.plus(dec(x)), dec(0)).toString();
}

/** the expected cost of one purchase unit without tax: cost of one item unit × pack size (none → 1), whole cents */
export function packCostCents(unitCostCents: number, packSize?: DecLike | null): number {
  const hasPack = packSize !== undefined && packSize !== null && String(packSize).trim() !== "" && dec(packSize).gt(0);
  return roundCents(dec(unitCostCents).times(hasPack ? dec(packSize!) : dec(1)));
}

/** the expected total of an order without tax: Σ packs × cost a pack, whole cents (round half up per line) */
export function orderCostCents(lines: { qty: DecLike; costCents: number }[]): number {
  return lines.reduce((a, l) => a + roundCents(dec(l.qty).times(dec(l.costCents))), 0);
}
