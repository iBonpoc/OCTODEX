/**
 * The Gutters module's estimate lines from a measurement (docs/specs/33-gutters-estimate.md П23, M8a; stub S5g). Pure.
 *
 * Lines of the core's estimate (CustomLine), one per price-list item (`matchKey`): what the client pays for (the engine's
 * estimate and both parts), in the engine's section order, labor last on its own lines (founder О4). The price is the
 * company's item's (M7d, whole cents); no item → price 0 and `noPrice` (never a silent $0 — the screen says «нет цены»).
 *
 * Each module line carries `source` — what the module wrote: its key, section, quantity, price, name and unit. It is
 * the company's, not the client's: the core's clientDoc drops it before anything leaves the app for the client, the stored document keeps it and the server's page cuts it (C4, П23.7). «Обновить
 * смету» (resyncLines) tells a hand change by comparing the line with its `source`, not by a flag: an older app
 * version that knows nothing of `source` keeps it on edits (lines are spread) and its hand changes are still seen.
 * A line without `source` (typed by hand, or re-picked from the price list on an old phone) is the person's own: never
 * changed, never removed; a part whose price-list item such a line already uses is not added again.
 */
import { dec, type CustomLine, type LineSource as CoreLineSource, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { catalogUnitCost, catalogUnitPrice } from "@/features/estimateDoc";
import { findItem, matchKey } from "./prices";

/** the engine's sections in the order the estimate shows them; labor last (О4) */
export const SECTION_ORDER = ["gutter", "corners_caps", "fasteners", "downspouts", "adapters", "ds_bottom", "guards", "consumables", "labor"] as const;
/** a section the module does not know yet (a newer engine) goes right before labor: labor stays last (О4) */
export const sectionAt = (s: string) => {
  const i = (SECTION_ORDER as readonly string[]).indexOf(s);
  return i < 0 ? SECTION_ORDER.length - 1.5 : i;
};

/** what the module wrote into a line (П23.1): the base for telling a hand change at the next update */
export interface LineSource extends CoreLineSource {
  module: "gutters";
  /** matchKey of the part: one line per price-list item */
  key: string;
  section: string;
  /** the quantity the module wrote (decimal text) */
  qty: string;
  /** the gutter parts rule's version the quantity was computed with (#1165, GUTTER_PARTS_VERSION): an older one says «расчёт изменился» */
  engineVersion?: string;
  /** the client price per unit the module wrote, cents */
  priceCents: number;
  name: string;
  unit: string;
  /** no price: no item in the price list, or its price is broken, or a $0 TEST price — price 0 until someone sets it */
  noPrice?: true;
  /** the item's price is a TEST one (rule 9): the check before sending says so (C5) */
  testPrice?: true;
  /** gone from the measurement, kept because someone changed it by hand */
  gone?: true;
  /** the measurement revision the line was made from (M8b) */
  revisionId?: string;
  /** the measurement the line was made from (M8b): «Обновить смету» of that measurement finds its lines by it */
  measurementId?: string;
  /** when «Смета» / «Обновить смету» wrote it (ISO): the measurement's newest estimate is the one written last (review M8b №3) */
  at?: string;
}
export type ModuleLine = Omit<CustomLine, "source"> & { source?: LineSource };

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
export function linesFromParts(parts: readonly PartQty[], catalog: readonly CatalogItem[], name: (p: PartQty) => string, uid: () => string, revisionId?: string, measurementId?: string, at?: string, engineVersion?: string): ModuleLine[] {
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
    // the core's price and cost of an item (a material: cost × supplier tax × markup) — as a line picked from the list
    const listPrice = it ? catalogUnitPrice(it) : undefined;
    const valid = listPrice !== undefined && Number.isSafeInteger(listPrice) && listPrice >= 0;
    const priceCents = valid ? listPrice : 0;
    // never a silent $0 (П23.1): no item, a broken price, or a $0 test price is «нет цены»; a real $0 is the company's choice
    const noPrice = !it || !valid || (priceCents === 0 && !!it.placeholder);
    const lineName = it?.name ?? name(part);
    const cost = it ? catalogUnitCost(it) : undefined;
    return {
      id: uid(),
      name: lineName,
      group: part.kind === "labor" ? "labor" : it?.kind === "service" ? "service" : "material",
      quantity,
      unit: part.unit,
      unitPriceCents: priceCents,
      ...(cost !== undefined ? { unitCostCents: cost } : {}),
      ...(it ? { catalogItemId: it.id } : {}),
      source: {
        module: "gutters", key, section: part.section, qty: quantity, priceCents, name: lineName, unit: part.unit,
        ...(noPrice ? { noPrice: true as const } : {}), ...(it?.placeholder ? { testPrice: true as const } : {}), ...(revisionId ? { revisionId } : {}), ...(measurementId ? { measurementId } : {}), ...(at ? { at } : {}), ...(engineVersion ? { engineVersion } : {}),
      },
    };
  });
}

/** what a person changed in a module line since the module wrote it; a quantity that is not a number counts as changed
 *  (an update never fails on one odd line, and never overwrites it) */
export function handChanges(l: ModuleLine & { source: LineSource }) {
  let qty = true;
  try {
    qty = !dec(String(l.quantity)).eq(dec(String(l.source.qty)));
  } catch {
    qty = true;
  }
  return {
    qty,
    price: l.unitPriceCents !== l.source.priceCents,
    name: l.name !== l.source.name,
    // what the module never sets: a description, an add-on, another unit or group
    other: !!l.description || !!l.optional || (l.source.unit !== undefined && l.unit !== l.source.unit),
  };
}
const touched = (l: ModuleLine & { source: LineSource }) => Object.values(handChanges(l)).some(Boolean);

/**
 * «Обновить смету» (П23.1): the option's lines with the measurement's new ones.
 * - a person's own line (no source): as it is, where it is;
 * - a module line still in the measurement: the new quantity, price and name unless a person changed that one; its id,
 *   place and everything else (optional, description) stay;
 * - a module line gone from the measurement: removed if nobody changed it, else kept and marked `gone`;
 * - a second module line of one part (a copy): the person's, as it is;
 * - a new part: before the first module line of a later section (else after the module's last line, else at the end) —
 *   unless an own line already uses its price-list item.
 * `other` — lines that belong to something else (another measurement's, M8b): left as they are, where they are, and
 * they neither block nor place a new line (review M8b №5).
 */
export function resyncLines(old: readonly ModuleLine[], next: readonly ModuleLine[], other: (l: ModuleLine) => boolean = () => false): ModuleLine[] {
  const nextByKey = new Map(next.filter(isOurs).map((l) => [l.source.key, l]));
  // the engine this update computed with: a line kept by hand but no longer computed was looked at too (#1165)
  const engineNow = next.find(isOurs)?.source.engineVersion;
  const ownItems = new Set(old.filter((l) => !isOurs(l) && !other(l) && l.catalogItemId).map((l) => l.catalogItemId!));
  const mine = (l: ModuleLine): l is ModuleLine & { source: LineSource } => isOurs(l) && !other(l);
  const seen = new Set<string>();
  const out: ModuleLine[] = [];
  for (const l of old) {
    if (!mine(l)) {
      out.push(l);
      continue;
    }
    // a second line of the same part (copied to split the work): the person's — as it is, never removed (review M8a №4)
    // (its version stamp is renewed with the rest: the update looked at the part, the note must go — #1165)
    if (seen.has(l.source.key)) {
      out.push(engineNow ? { ...l, source: { ...l.source, engineVersion: engineNow } } : l);
      continue;
    }
    const n = nextByKey.get(l.source.key);
    if (!n) {
      if (touched(l)) out.push({ ...l, source: { ...l.source, gone: true, ...(engineNow ? { engineVersion: engineNow } : {}) } });
      continue;
    }
    seen.add(l.source.key);
    const ch = handChanges(l);
    const { gone: _g, ...src } = n.source!;
    const merged: ModuleLine = {
      ...l,
      quantity: ch.qty ? l.quantity : n.quantity,
      name: ch.name ? l.name : n.name,
      unitPriceCents: ch.price ? l.unitPriceCents : n.unitPriceCents,
      // what the module computed now: the base for the next update
      source: src as LineSource,
    };
    if (!ch.price) {
      // the item's price, cost and link — or none, when the item is gone from the list (review M8a №8)
      if (n.unitCostCents !== undefined) merged.unitCostCents = n.unitCostCents;
      else delete merged.unitCostCents;
      if (n.catalogItemId) merged.catalogItemId = n.catalogItemId;
      else delete merged.catalogItemId;
    }
    out.push(merged);
  }
  for (const n of next) {
    if (!isOurs(n) || seen.has(n.source.key)) continue;
    if (n.catalogItemId && ownItems.has(n.catalogItemId)) continue;
    const at = sectionAt(n.source.section);
    // before the first module line of a later section; else after the module's last line; else at the end (review №10)
    const later = out.findIndex((l) => mine(l) && sectionAt(l.source.section) > at);
    let pos = later;
    if (later < 0) {
      pos = out.length;
      for (let i = out.length - 1; i >= 0; i--) if (mine(out[i]!)) { pos = i + 1; break; }
    }
    out.splice(pos, 0, n);
  }
  return out;
}

/** what the check before sending (C5) and the estimate's marks (C4) say: «нет цены», a test price still there, a changed
 *  line no longer in the measurement (it would bill a part twice — review M8a №6) */
export const noPriceLines = (lines: readonly ModuleLine[]) => lines.filter((l) => isOurs(l) && l.source.noPrice && l.unitPriceCents === 0);
export const testPriceLines = (lines: readonly ModuleLine[]) => lines.filter((l) => isOurs(l) && l.source.testPrice && l.unitPriceCents === l.source.priceCents);
export const goneLines = (lines: readonly ModuleLine[]) => lines.filter((l) => isOurs(l) && l.source.gone);
