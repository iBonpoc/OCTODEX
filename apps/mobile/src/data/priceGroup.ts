/**
 * #1913 (the price-key spec, §4.3): the core's general notion of a «price group» — catalog items of one company with
 * the same attributes.priceGroup have ONE price (the database keeps it, migration 20261117210000). The core does not know
 * WHY items are one group (a trade module: the same part in another colour — the module writes the key); it only routes a price
 * change of such an item through the group (catalog.groupPrice). Pure: test/priceGroupOp.test.ts.
 */
import type { CatalogItem } from "./types";

/** the item's price group; absent — none (an empty or blank text is none, as app.price_group) */
export const priceGroupOf = (it: Pick<CatalogItem, "attributes"> | null | undefined): string | undefined => {
  const g = it?.attributes?.priceGroup?.trim();
  return g ? g : undefined;
};

/** what a group's price write sets: the price and the placeholder; the costs only for who sees them */
export interface GroupPriceInput {
  priceCents: number;
  placeholder?: boolean;
  costCents?: number;
  vendorTaxBps?: number;
  markupBps?: number;
}

/** does this save change what the group shares (spec §4.2): the price, the placeholder, the cost, the tax, the markup */
export const groupPriceChanged = (prev: CatalogItem, it: CatalogItem): boolean =>
  prev.priceCents !== it.priceCents ||
  !!prev.placeholder !== !!it.placeholder ||
  (prev.costCents ?? null) !== (it.costCents ?? null) ||
  (prev.vendorTaxBps ?? null) !== (it.vendorTaxBps ?? null) ||
  (prev.markupBps ?? null) !== (it.markupBps ?? null);
