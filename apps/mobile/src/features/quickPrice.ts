/**
 * Quick price of one catalog item (spec 53 §6.3, wave 53-1): two taps — the card, then «Сохранить» in a sheet. Pure.
 * A material whose cost this person sees: the cost and the markup are typed, the client price is counted by the
 * engine (editClean → catalogPrice). Labor, a service and who does not see costs (sales without view_costs): the
 * client price is typed. The «test price» mark (rule 9) goes only when something was changed — «Сохранить» on an
 * untouched test price never makes it a real one (the full editor does the same, catalog/[id].tsx `set`).
 */
import type { CatalogItem } from "@/data/types";
import { countsFromCost, editClean, priceLocked } from "./catalogEdit";

export type QuickPriceInput = { costCents?: number; markupBps?: number; priceCents?: number };

/** does the sheet ask for the cost (and markup) — or for the client price */
export const quickAsksCost = (it: Pick<CatalogItem, "kind">, noCosts: boolean) => countsFromCost(it, noCosts);

/** the typed fields that differ from the item */
function changedOf(it: CatalogItem, input: QuickPriceInput, noCosts: boolean, catalog?: readonly CatalogItem[]): Partial<CatalogItem> {
  // #1807: a price counted by the server from a cost this person does not see is not changed here (no save, no «saved»)
  // #1913: …and with the catalog, any item of a price group that has such a material
  if (priceLocked(it, noCosts, catalog)) return {};
  const want: Partial<CatalogItem> = quickAsksCost(it, noCosts)
    ? { costCents: input.costCents ?? it.costCents, markupBps: input.markupBps ?? it.markupBps }
    : { priceCents: input.priceCents ?? it.priceCents };
  const out: Partial<CatalogItem> = {};
  for (const [k, v] of Object.entries(want) as [keyof CatalogItem, number | undefined][]) {
    if ((it[k] ?? 0) !== (v ?? 0)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** was anything typed that changes the item */
export const quickChanged = (it: CatalogItem, input: QuickPriceInput, noCosts: boolean, catalog?: readonly CatalogItem[]) =>
  Object.keys(changedOf(it, input, noCosts, catalog)).length > 0;

/** the item «Сохранить» stores: the typed fields, the price as the engine counts it, the test mark gone only on a change */
export function quickPriceItem(it: CatalogItem, input: QuickPriceInput, catalog: CatalogItem[], noCosts: boolean): CatalogItem {
  const patch = changedOf(it, input, noCosts, catalog);
  const changed = Object.keys(patch).length > 0;
  return editClean({ ...it, ...patch, placeholder: changed ? false : it.placeholder }, catalog, noCosts);
}

/** what is still missing before «Сохранить» (the button stays active, DS §11 п.3): the cost of a material, else the price */
export function quickNeed(it: CatalogItem, input: QuickPriceInput, noCosts: boolean): "cost" | "price" | null {
  if (quickAsksCost(it, noCosts)) return (input.costCents ?? it.costCents ?? 0) > 0 ? null : "cost";
  return (input.priceCents ?? it.priceCents) > 0 ? null : "price";
}

/** a material with no markup: the client would pay the cost (spec 53 §7.5) — the sheet warns */
export const quickNoMarkup = (it: CatalogItem, input: QuickPriceInput, noCosts: boolean) =>
  quickAsksCost(it, noCosts) && (input.markupBps ?? it.markupBps ?? 0) === 0;

/**
 * How the supplier sells it, when the item says (audit's condition for 53-1): «за lb (2.6 ft)», «за box (100 ea)» —
 * so a box's price is not typed as one unit's. None when the item has no purchase unit or it is the item's own unit.
 */
export function quickPack(it: Pick<CatalogItem, "unit" | "purchaseUnit" | "packSize">): { buy: string; n?: string; unit: string } | null {
  const buy = it.purchaseUnit?.trim();
  if (!buy || buy.toLowerCase() === it.unit.trim().toLowerCase()) return null;
  const n = it.packSize?.trim();
  return { buy, unit: it.unit, ...(n && Number(n) > 0 ? { n } : {}) };
}

/**
 * The key of the price sheet's body (#1826, money: the sheet kept what was typed for the previous item and «Сохранить»
 * wrote it to the next one): a new opening OR another item → a fresh form. Each opening of the sheet and each item has its
 * own key, so the typed cost, markup and price never carry over.
 */
export const quickSheetKey = (opening: number, item: { id: string } | null | undefined): string => `${opening}:${item?.id ?? ""}`;
