/**
 * The Gutters module's estimate lines from a measurement (docs/specs/33-gutters-estimate.md П23, M8a; stub S5g). Pure.
 *
 * Lines of the core's estimate (CustomLine), one per price-list item (`matchKey`): what the client pays for (the engine's
 * estimate and both parts), in the engine's section order, labor last on its own lines (founder О4). The price is the
 * company's item's (M7d, whole cents); no item → price 0 and `noPrice` (never a silent $0 — the screen says «нет цены»).
 *
 * Each module line carries `source` — what the module wrote: its key, section, quantity, price and name. «Обновить
 * смету» (resyncLines) tells a hand change by comparing the line with its `source`, not by a flag: an older app
 * version that knows nothing of `source` keeps it on edits (lines are spread) and its hand changes are still seen.
 * A line without `source` (typed by hand, or re-picked from the price list on an old phone) is the person's own: never
 * changed, never removed; a part whose price-list item such a line already uses is not added again.
 */
import { catalogCost, dec, type CustomLine, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { findItem, matchKey } from "./prices";

/** the engine's sections in the order the estimate shows them; labor last (О4) */
export const SECTION_ORDER = ["gutter", "corners_caps", "fasteners", "downspouts", "adapters", "ds_bottom", "guards", "consumables", "labor"] as const;
const sectionAt = (s: string) => {
  const i = (SECTION_ORDER as readonly string[]).indexOf(s);
  return i < 0 ? SECTION_ORDER.length - 1 : i;
};

/** what the module wrote into a line (П23.1): the base for telling a hand change at the next update */
export interface LineSource {
  module: "gutters";
  /** matchKey of the part: one line per price-list item */
  key: string;
  section: string;
  /** the quantity the module wrote (decimal text) */
  qty: string;
  /** the client price per unit the module wrote, cents */
  priceCents: number;
  name: string;
  /** no item in the price list: price 0 until someone sets it */
  noPrice?: true;
  /** gone from the measurement, kept because someone changed it by hand */
  gone?: true;
  /** the measurement revision the line was made from (M8b) */
  revisionId?: string;
}
export type ModuleLine = CustomLine & { source?: LineSource };

const isOurs = (l: ModuleLine): l is ModuleLine & { source: LineSource } => !!l.source && l.source.module === "gutters" && typeof l.source.key === "string";

/**
 * Feet to bill: hundredths, half up (the estimate's quantity is numeric(14,4); 230″ = 19.1666… ft → 19.17).
 * Each and pounds are whole already.
 */
export const billQty = (q: string, unit: string) => (unit === "ft" ? dec(q).toDecimalPlaces(2).toString() : dec(q).toString());

/**
 * The module's lines for the parts of one measurement: one per item (the same item's parts add up — end caps left and
 * right), in section order. `name(p)` — the part's name in the app's language when no item has one; `uid()` — new ids.
 */
export function linesFromParts(parts: readonly PartQty[], catalog: readonly CatalogItem[], name: (p: PartQty) => string, uid: () => string, revisionId?: string): ModuleLine[] {
  const byKey = new Map<string, { part: PartQty; qty: ReturnType<typeof dec> }>();
  for (const p of parts) {
    if (p.use === "purchase") continue; // the supplier order's (stage 2), never the client's price
    const key = matchKey(p);
    const was = byKey.get(key);
    if (was) was.qty = was.qty.add(p.qty);
    else byKey.set(key, { part: p, qty: dec(p.qty) });
  }
  const rows = [...byKey.entries()].sort(([, a], [, b]) => sectionAt(a.part.section) - sectionAt(b.part.section));
  return rows.map(([key, { part, qty }]) => {
    const it = findItem(catalog, part);
    const quantity = billQty(qty.toString(), part.unit);
    const priceCents = it && Number.isSafeInteger(it.priceCents) && it.priceCents >= 0 ? it.priceCents : 0;
    const lineName = it?.name ?? name(part);
    // our cost of a bought item includes the supplier's tax (the core's catalog, catalogCost); labor has none
    const cost = it?.costCents !== undefined ? catalogCost(it.costCents, it.vendorTaxBps ?? 0) : undefined;
    return {
      id: uid(),
      name: lineName,
      group: part.kind === "labor" ? "labor" : it?.kind === "service" ? "service" : "material",
      quantity,
      unit: part.unit,
      unitPriceCents: priceCents,
      ...(cost !== undefined ? { unitCostCents: cost } : {}),
      ...(it ? { catalogItemId: it.id } : {}),
      source: { module: "gutters", key, section: part.section, qty: quantity, priceCents, name: lineName, ...(it ? {} : { noPrice: true as const }), ...(revisionId ? { revisionId } : {}) },
    };
  });
}

/** what a person changed in a module line since the module wrote it */
export function handChanges(l: ModuleLine & { source: LineSource }) {
  return {
    qty: !dec(String(l.quantity)).eq(dec(l.source.qty)),
    price: l.unitPriceCents !== l.source.priceCents,
    name: l.name !== l.source.name,
  };
}

/**
 * «Обновить смету» (П23.1): the option's lines with the measurement's new ones.
 * - a person's own line (no source): as it is, where it is;
 * - a module line still in the measurement: the new quantity, price and name unless a person changed that one; its id,
 *   place and everything else (optional, description) stay;
 * - a module line gone from the measurement: removed if nobody changed it, else kept and marked `gone`;
 * - a new part: after the last line of its section (else after the module's last line before it), — unless an own
 *   line already uses its price-list item (an old phone re-picked it).
 */
export function resyncLines(old: readonly ModuleLine[], next: readonly ModuleLine[]): ModuleLine[] {
  const nextByKey = new Map(next.filter(isOurs).map((l) => [l.source.key, l]));
  const ownItems = new Set(old.filter((l) => !isOurs(l) && l.catalogItemId).map((l) => l.catalogItemId!));
  const seen = new Set<string>();
  const out: ModuleLine[] = [];
  for (const l of old) {
    if (!isOurs(l)) {
      out.push(l);
      continue;
    }
    const n = nextByKey.get(l.source.key);
    const ch = handChanges(l);
    if (!n || seen.has(l.source.key)) {
      if (ch.qty || ch.price || ch.name) out.push({ ...l, source: { ...l.source, gone: true } });
      continue;
    }
    seen.add(l.source.key);
    const { gone: _g, ...src } = n.source!;
    out.push({
      ...l,
      quantity: ch.qty ? l.quantity : n.quantity,
      name: ch.name ? l.name : n.name,
      unitPriceCents: ch.price ? l.unitPriceCents : n.unitPriceCents,
      // a hand price keeps its own cost; else the item's
      ...(ch.price ? {} : n.unitCostCents !== undefined ? { unitCostCents: n.unitCostCents } : { unitCostCents: undefined }),
      catalogItemId: n.catalogItemId ?? l.catalogItemId,
      // what the module computed now: the base for the next update
      source: src as LineSource,
    });
  }
  for (const n of next) {
    if (!isOurs(n) || seen.has(n.source.key)) continue;
    if (n.catalogItemId && ownItems.has(n.catalogItemId)) continue;
    const at = sectionAt(n.source.section);
    // after the last module line of this section or an earlier one
    let pos = -1;
    out.forEach((l, i) => {
      if (isOurs(l) && sectionAt(l.source.section) <= at) pos = i;
    });
    out.splice(pos + 1, 0, n);
  }
  return out.map((l) => (l.unitCostCents === undefined && "unitCostCents" in l ? (({ unitCostCents: _c, ...r }) => r)(l) : l));
}

/** «нет цены» lines: the screen and the check before sending (C5) say how many */
export const noPriceLines = (lines: readonly ModuleLine[]) => lines.filter((l) => isOurs(l) && l.source.noPrice && l.unitPriceCents === 0);
