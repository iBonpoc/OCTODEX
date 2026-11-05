/**
 * TEMPORARY (10а PR6): the catalog list needs catalogItemEconomics(item, catalog) from features/estimateDoc.ts
 * (estimates chat, PR #98). Until it lands this stub computes nothing: cost and margin are unknown («—»), the price
 * is the catalog's own itemPrice. Replace the import in app/catalog/index.tsx and delete this file when #98 is in main.
 */
import type { CatalogItem } from "@/data/types";
import { itemPrice } from "./estimatePickers";

export function catalogItemEconomics(item: CatalogItem, catalog: CatalogItem[]): { costCents: number | null; priceCents: number; marginPct: string | null } {
  return { costCents: null, priceCents: itemPrice(item, catalog), marginPct: null };
}
