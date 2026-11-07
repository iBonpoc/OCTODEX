/**
 * The same rules for an item's properties, purchase unit and pack size as the server's CHECKs (migration
 * 20261107170000, docs/specs/33 П16; security check C3 №3). Applied before an item is saved, so a wrong value from a module
 * or a typo never makes the server refuse the whole save (the name and the price would be lost with it): a bad property
 * is left out, a bad purchase unit or pack size is not sent (the stored one stays). Pure.
 */
import type { CatalogItem } from "@/data/types";

const NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
// control characters and bidirectional overrides (they reach screens, supplier orders and PDFs)
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
const MAX_BYTES = 4000;

const okValue = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && [...v].length <= 120 && !BAD.test(v);

/** the properties the server takes; null = none left */
export function cleanAttributes(a: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (NAME.test(k) && okValue(v)) out[k] = v;
  // the whole map at most 4000 bytes (as jsonb text): drop the last ones until it fits
  const keys = Object.keys(out);
  while (keys.length && new TextEncoder().encode(JSON.stringify(out)).length > MAX_BYTES) delete out[keys.pop()!];
  return out;
}

/** "" = clear; undefined = not valid, leave the stored one */
export function cleanPurchaseUnit(v: string): string | undefined {
  const s = v.replace(/^[ \t]+|[ \t]+$/g, "");
  if (s === "") return "";
  return s.length <= 20 && !BAD.test(s) ? s : undefined;
}

/** "" = clear; a positive number with at most 3 decimals that does not round to 0 (numeric(12,3)); else undefined */
export function cleanPackSize(v: string): string | undefined {
  const s = v.trim();
  if (s === "") return "";
  if (!/^\d{1,9}(\.\d+)?$/.test(s)) return undefined;
  const n = Math.round(Number(s) * 1000) / 1000;
  return n > 0 ? String(n) : undefined;
}

/** the item as it will be saved: the new fields cleaned, an invalid one not sent (undefined) */
export function cleanCatalogItem(it: CatalogItem): CatalogItem {
  const { attributes, purchaseUnit, packSize, ...rest } = it;
  const out: CatalogItem = { ...rest };
  if (attributes !== undefined) out.attributes = cleanAttributes(attributes);
  const pu = purchaseUnit === undefined ? undefined : cleanPurchaseUnit(purchaseUnit);
  if (pu !== undefined) out.purchaseUnit = pu;
  const ps = packSize === undefined ? undefined : cleanPackSize(packSize);
  if (ps !== undefined) out.packSize = ps;
  return out;
}
