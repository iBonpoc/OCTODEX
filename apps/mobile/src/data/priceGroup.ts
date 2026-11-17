/**
 * #1913 (the price-key spec, §4.3): the core's general notion of a «price group» — catalog items of one company with
 * the same attributes.priceGroup have ONE price (the database keeps it, migration 20261117210000). The core does not know
 * WHY items are one group (a trade module: the same part in another colour — the module writes the key); it only routes a price
 * change of such an item through the group (catalog.groupPrice). Pure: test/priceGroupOp.test.ts.
 */
import type { CatalogItem } from "./types";
import type { Op } from "@/cloud/ops";

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

/** a group's price write without any cost field — what goes to the server for someone who does not see our costs */
export function withoutGroupCosts(op: Op): Op {
  if (op.k !== "catalog.groupPrice") return op;
  const { costCents: _c, vendorTaxBps: _t, markupBps: _m, expectedCostCents: _ec, expectedTaxBps: _et, expectedMarkupBps: _em, ...rest } = op;
  return rest;
}
/** does a group's price write carry costs (who sees them wrote it) */
export const carriesCosts = (op: Extract<Op, { k: "catalog.groupPrice" }>): boolean =>
  op.costCents !== undefined || op.vendorTaxBps !== undefined || op.markupBps !== undefined;

/**
 * #1913: a group with a material the server counts from its cost has its price set by who sees our costs only (the
 * server says 42501 price_from_cost to anyone else) — for them every item of that group shows its price, not changes it
 */
export const groupPriceLocked = (catalog: readonly CatalogItem[], it: Pick<CatalogItem, "attributes">): boolean => {
  const g = priceGroupOf(it);
  return !!g && catalog.some((c) => priceGroupOf(c) === g && c.kind === "material" && !!c.priceFromCost);
};

/**
 * #1913: an item that joins a group (new, or its group set / changed) takes the group's price, placeholder and costs —
 * as the server does (t29 / t98 of 20261117210000), so the phone shows meanwhile what the next read brings. Taken from a
 * loaded item of that group; none loaded — the item as typed (it is the first of its group, or the read corrects it).
 * The costs are copied only where the phone has them (who does not see our costs has none on any item) and the group has some.
 */
export function joinedGroup(catalog: readonly CatalogItem[], prev: CatalogItem | undefined, it: CatalogItem): CatalogItem {
  const g = priceGroupOf(it);
  if (!g || (prev && priceGroupOf(prev) === g)) return it;
  const peer = catalog.find((c) => c.id !== it.id && priceGroupOf(c) === g);
  if (!peer) return it;
  // the server copies the group's cost row only when there is one (t98): a group without costs leaves the item's own
  const hasCost = peer.costCents != null || peer.vendorTaxBps != null || peer.markupBps != null;
  const costs = hasCost ? { costCents: peer.costCents, vendorTaxBps: peer.vendorTaxBps, markupBps: peer.markupBps } : {};
  return { ...it, priceCents: peer.priceCents, placeholder: peer.placeholder, ...costs };
}
