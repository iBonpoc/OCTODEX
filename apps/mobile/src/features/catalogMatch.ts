/**
 * Price-list items by their properties (docs/specs/33-gutters-module.md П16, core K1). A hint for a trade module, not the
 * decision: the module's explicit «part → item» binding wins (П14.2 e3). Pure.
 * An item matches when every wanted property is there with the same value (case and spaces ignored); the closest first —
 * the fewest properties beyond the wanted ones, then by name. Nothing wanted → nothing (never «any item»).
 */
import type { CatalogItem } from "@/data/types";

const norm = (v: string) => v.trim().toLowerCase();

/** #1913 (the price-key spec, §4.3): properties the core keeps for itself, not the item's own (a price group): they
 *  are never «extra» when matching and never shown on a card */
export const SERVICE_PROPS: readonly string[] = ["priceGroup", "mergedInto"];
/**
 * #2227 (spec 33-price-key §11.7.6): an item another item took over (attributes.mergedInto = its id) — kept for the estimates
 * that name it, never offered again: not matched, not listed, not picked. The id it went into, or undefined
 */
export const mergedInto = (it: Pick<CatalogItem, "attributes">): string | undefined => {
  const v = it.attributes?.mergedInto?.trim();
  return v ? v : undefined;
};
/** the items a person or a search may use: without the merged ones */
export const usableItems = <T extends Pick<CatalogItem, "attributes">>(items: readonly T[]): T[] => items.filter((it) => !mergedInto(it));
/**
 * #2227: the item and variant a line of a merged item stands for now — the item it went into, and the value of that item's
 * variant property taken from the old item's own properties. Not merged — the item itself, no variant from here
 */
export function resolveMerged(catalog: readonly CatalogItem[], it: CatalogItem): { item: CatalogItem; variant?: { attr: string; value: string } } {
  const to = mergedInto(it);
  const target = to ? catalog.find((c) => c.id === to && !mergedInto(c)) : undefined;
  if (!target) return { item: it };
  const attr = Object.keys(target.variants ?? {})[0];
  const value = attr ? it.attributes?.[attr]?.trim().toLowerCase() : undefined;
  // review #2241 №1: the new item names no property, or the old one has no value of it — the old item stands for itself, never
  // the new one without a variant (two old values would fold into one line with the item's code)
  if (!attr || !value) return { item: it };
  return { item: target, variant: { attr, value } };
}
/**
 * #2227 (review #2241): a variant as the server takes it (app.variant_skus_ok) — checked on the phone before the queue, so a
 * write the server would refuse never waits in it. `values` — how many values the property has with this one.
 */
export function variantOk(value: string, d: import("@/data/types").ItemVariant | null, values: number): boolean {
  if (!value || value !== value.trim().toLowerCase() || value.length > 120 || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) return false;
  if (!d) return true;
  if (values > 50) return false;
  if (d.sku !== undefined && (d.sku.length > 60 || /[\u0000-\u001f\u007f]/.test(d.sku))) return false;
  if (d.supplierId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.supplierId)) return false;
  if (d.purchaseUnit !== undefined && (d.purchaseUnit !== d.purchaseUnit.trim() || d.purchaseUnit.length > 20 || /[\u0000-\u001f\u007f]/.test(d.purchaseUnit))) return false;
  if (d.packSize !== undefined && (!/^[0-9]{1,9}(\.[0-9]{1,4})?$/.test(d.packSize) || Number(d.packSize) <= 0)) return false;
  return true;
}
/** how many own properties an item has (its service ones not counted) */
export const propertyCount = (a: Record<string, string> | undefined): number =>
  Object.keys(a ?? {}).filter((k) => !SERVICE_PROPS.includes(k)).length;

export function catalogMatch(catalog: readonly CatalogItem[], want: Record<string, string>): CatalogItem[] {
  const keys = Object.keys(want);
  if (!keys.length) return [];
  const hits = catalog.filter((it) => {
    // #2227: a merged item is never found again (its estimates still name it by id)
    if (mergedInto(it)) return false;
    const a = it.attributes;
    // own properties only: «constructor» or «toString» is never found on the object's prototype (security check C3 №5)
    return !!a && keys.every((k) => Object.prototype.hasOwnProperty.call(a, k) && typeof a[k] === "string" && norm(a[k]!) === norm(want[k]!));
  });
  const extra = (it: CatalogItem) => propertyCount(it.attributes) - keys.length;
  return hits.sort((x, y) => extra(x) - extra(y) || x.name.localeCompare(y.name));
}

/** «k · 6 · aluminum · white» for a screen: the values only, in a stable order (by property name). The names are the
 *  module's codes, not words of the app (rule 7) — the values are data, like the item's name */
export const attributesLine = (a: Record<string, string> | undefined): string =>
  Object.entries(a ?? {})
    .filter(([k]) => !SERVICE_PROPS.includes(k))
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([, v]) => v)
    .join(" · ");
