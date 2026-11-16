/**
 * The price-list item editor (app/catalog/[id].tsx), pure. Material: the price is counted from the cost (+ supplier tax
 * + markup) — but only for who gets our costs (19 §9, DB.costsVisible). Who does not (sales without view_costs) has
 * no cost on the phone: the price is edited as it is, the cost fields stay as they were (nothing to send).
 */
import { catalogPrice } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { kitPrice } from "./estimateDoc";

/** is the material's price counted from its cost here */
export const countsFromCost = (it: Pick<CatalogItem, "kind">, noCosts: boolean) => it.kind === "material" && !noCosts;

export function editPrice(it: CatalogItem, catalog: CatalogItem[], noCosts: boolean): number {
  if (countsFromCost(it, noCosts)) return catalogPrice(it.costCents ?? 0, it.vendorTaxBps ?? 0, it.markupBps ?? 0);
  return it.kind === "kit" ? kitPrice(it, catalog) : it.priceCents;
}
/** a required field of the item, as in `form.field(id)` and the registry (features/requiredFields.ts) */
export type CatalogField = "name" | "cost" | "components";
/**
 * What «Сохранить» still misses, field by field, in the order of the screen (DS §11 п.3: the text under EACH missing field,
 * the scroll to the first): a name; a kit — at least one component; a material counted from its cost — the supplier's
 * price. A price of $0 is allowed (a free visit, a placeholder).
 */
export function editProblems(it: CatalogItem, noCosts: boolean): CatalogField[] {
  const out: CatalogField[] = [];
  if (!it.name.trim()) out.push("name");
  if (it.kind === "kit" && !(it.components ?? []).length) out.push("components");
  if (it.kind !== "kit" && countsFromCost(it, noCosts) && !((it.costCents ?? 0) > 0)) out.push("cost");
  return out;
}
export const editOk = (it: CatalogItem, noCosts: boolean) => editProblems(it, noCosts).length === 0;

/** what «Сохранить» stores */
export function editClean(it: CatalogItem, catalog: CatalogItem[], noCosts: boolean): CatalogItem {
  return {
    ...it,
    name: it.name.trim(),
    unit: it.unit.trim() || "ea",
    priceCents: it.kind === "kit" ? 0 : editPrice(it, catalog, noCosts),
    costCents: it.kind === "kit" ? undefined : it.costCents,
  };
}
