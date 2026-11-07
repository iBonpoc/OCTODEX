/**
 * Price-list items by their properties (docs/specs/33-gutters-module.md П16, core K1). A hint for a trade module, not the
 * decision: the module's explicit «part → item» binding wins (П14.2 e3). Pure.
 * An item matches when every wanted property is there with the same value (case and spaces ignored); the closest first —
 * the fewest properties beyond the wanted ones, then by name. Nothing wanted → nothing (never «any item»).
 */
import type { CatalogItem } from "@/data/types";

const norm = (v: string) => v.trim().toLowerCase();

export function catalogMatch(catalog: readonly CatalogItem[], want: Record<string, string>): CatalogItem[] {
  const keys = Object.keys(want);
  if (!keys.length) return [];
  const hits = catalog.filter((it) => {
    const a = it.attributes;
    return !!a && keys.every((k) => a[k] !== undefined && norm(a[k]!) === norm(want[k]!));
  });
  const extra = (it: CatalogItem) => Object.keys(it.attributes ?? {}).length - keys.length;
  return hits.sort((x, y) => extra(x) - extra(y) || x.name.localeCompare(y.name));
}

/** «k · 6 · aluminum · white» for a screen: the values only, in a stable order (by property name). The names are the
 *  module's codes, not words of the app (rule 7) — the values are data, like the item's name */
export const attributesLine = (a: Record<string, string> | undefined): string =>
  Object.entries(a ?? {})
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([, v]) => v)
    .join(" · ");
