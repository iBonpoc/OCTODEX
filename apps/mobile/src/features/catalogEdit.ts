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
/**
 * #1807 (53-0б, spec 53 §5.3б п.4): the server counts this material's price from its cost, and this person does not see
 * our costs — the price is shown, not changed (the server would keep its own; no number tells why)
 */
export const priceLocked = (it: Pick<CatalogItem, "kind" | "priceFromCost">, noCosts: boolean) =>
  it.kind === "material" && noCosts && !!it.priceFromCost;

export function editPrice(it: CatalogItem, catalog: CatalogItem[], noCosts: boolean): number {
  if (countsFromCost(it, noCosts)) return catalogPrice(it.costCents ?? 0, it.vendorTaxBps ?? 0, it.markupBps ?? 0);
  return it.kind === "kit" ? kitPrice(it, catalog) : it.priceCents;
}
export const editOk = (it: CatalogItem, noCosts: boolean) =>
  it.name.trim().length > 0 && (it.kind === "kit" ? (it.components ?? []).length > 0 : countsFromCost(it, noCosts) ? (it.costCents ?? 0) > 0 : it.priceCents >= 0);

/** what «Сохранить» stores */
export function editClean(it: CatalogItem, catalog: CatalogItem[], noCosts: boolean): CatalogItem {
  return {
    ...it,
    name: it.name.trim(),
    unit: it.unit.trim() || "ea",
    // a locked price is the one the phone read (never another one the server would replace)
    priceCents: it.kind === "kit" ? 0 : priceLocked(it, noCosts) ? (catalog.find((c) => c.id === it.id)?.priceCents ?? it.priceCents) : editPrice(it, catalog, noCosts),
    costCents: it.kind === "kit" ? undefined : it.costCents,
  };
}
