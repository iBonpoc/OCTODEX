/**
 * РС-10 (docs/audit/2026-11-12-estimate-editor-spec.md Р11, §4.1): the data of a catalog item's card — its link and
 * barcode as the server keeps them (migration 20261112230000_catalog_card.sql, db T202), what the item did on this
 * device (itemUsage), the history of its selling price and markup (catalog_price_history). Pure: test/catalogCard.test.ts.
 */
import { activeLines, dec, lineProfit } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, ID, PriceHistoryEntry } from "@/data/types";
import { mainOption, optionTotals, withAddons } from "@/features/estimateDoc";

/** the characters the server refuses in a link: control, blank (NBSP, the Unicode spaces, line / paragraph separators,
 *  ideographic space) and invisible format ones (zero-width, bidirectional, BOM, soft hyphen) — the same code points as
 *  the check catalog_items_product_url_check */
const URL_BAD = /[\u0000-\u0020\u007f-\u00a0\u00ad\u0600-\u0605\u061c\u06dd\u070f\u08e2\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2064\u2066-\u206f\u3000\ufeff\ufff9-\ufffb]/;
/** https://, a host of letters, digits, dots and hyphens (no userinfo, not empty), an optional port, then the end or / ? # */
const URL_SHAPE = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/|\?|#|$)/;
export const PRODUCT_URL_MAX = 500;
export const BARCODE_MAX = 64;

/**
 * A typed product link as the server keeps it, or why not. Trimmed; a scheme typed in capitals («HTTPS://») is written
 * in lowercase; a link typed without a scheme («abc.com/x») gets https://. Only https — javascript:, data:, http: or any
 * other scheme is refused. "" — no link (the field cleared).
 */
export function normalizeProductUrl(typed: string): { ok: true; url: string } | { ok: false; why: "scheme" | "shape" | "long" } {
  const t = typed.trim();
  if (t === "") return { ok: true, url: "" };
  // «word:» not followed by a digit is a scheme («javascript:», «HTTPS:»); «abc.com:8080/x» is a host with a port
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):(?![0-9])/.exec(t);
  let url: string;
  if (m) {
    if (m[1]!.toLowerCase() !== "https") return { ok: false, why: "scheme" };
    url = "https:" + t.slice(m[0].length);
  } else {
    url = "https://" + t;
  }
  if (URL_BAD.test(url) || !URL_SHAPE.test(url)) return { ok: false, why: "shape" };
  if (url.length > PRODUCT_URL_MAX) return { ok: false, why: "long" };
  return { ok: true, url };
}

/**
 * What the card opens: a stored link parsed once more (the URL parser, not a pattern), the protocol only https:, and the
 * host to show before it is opened («abc.example ↗»). null — nothing to open (none, not https, broken).
 */
export function productLink(url: string | undefined): { href: string; host: string } | null {
  if (!url) return null;
  const n = normalizeProductUrl(url);
  if (!n.ok || !n.url) return null;
  try {
    const u = new URL(n.url);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null;
    return { href: u.href, host: u.host };
  } catch {
    return null;
  }
}

/** a typed barcode as the server keeps it: trimmed; letters, digits, space and . _ / - only, at most 64; "" — none */
export function normalizeBarcode(typed: string): { ok: true; barcode: string } | { ok: false; why: "chars" | "long" } {
  const t = typed.trim();
  if (t === "") return { ok: true, barcode: "" };
  if (t.length > BARCODE_MAX) return { ok: false, why: "long" };
  if (!/^[A-Za-z0-9 ._/-]+$/.test(t)) return { ok: false, why: "chars" };
  return { ok: true, barcode: t };
}

export interface ItemUsage {
  /** estimates whose document has a line of this item (any status) */
  inEstimates: number;
  /** signed by the client (awaiting the company or approved), the chosen option with its add-ons: the quantity, the money
   *  of those lines (before the estimate's discount and tax) */
  soldQty: string;
  revenueCents: number;
  /** the profit of those lines — only who sees costs, and only when every such line has its cost; else null */
  profitCents: number | null;
  /** received on purchase orders, in packs of the purchase unit */
  boughtQty: string;
}

const signed = (e: Estimate) => (e.status === "approved" || e.status === "awaiting_countersign") && !!e.approval && !!e.doc?.options?.length;

/** what an item did, from what this device has (the spec's counters — no server table) */
export function itemUsage(db: Pick<DB, "estimates" | "purchaseOrders" | "costsVisible">, itemId: ID): ItemUsage {
  let inEstimates = 0;
  let sold = dec(0);
  let revenue = 0;
  let profit: number | null = 0;
  for (const e of db.estimates) {
    const doc = e.doc;
    if (!doc?.options?.length) continue;
    if (doc.options.some((o) => (o.lines ?? []).some((l) => l.catalogItemId === itemId))) inEstimates++;
    if (!signed(e)) continue;
    const base = doc.options.find((o) => o.id === e.approval!.optionId) ?? mainOption(doc);
    const o = withAddons(base, e.approval!.addonIds ?? []);
    const t = optionTotals(doc, o);
    activeLines(o.lines).forEach((l, i) => {
      if (l.catalogItemId !== itemId || (l.optional && !l.selected)) return;
      try {
        sold = sold.add(dec(l.quantity));
      } catch {
        return;
      }
      revenue += t.lineTotals[i] ?? 0;
      const p = l.unitCostCents === undefined ? null : lineProfit(l);
      profit = profit === null || p === null ? null : profit + p;
    });
  }
  let bought = dec(0);
  for (const po of db.purchaseOrders ?? []) {
    if (po.status === "cancelled") continue;
    for (const l of po.lines ?? []) {
      if (l.catalogItemId !== itemId) continue;
      try {
        bought = bought.add(dec(l.receivedQty || "0"));
      } catch {
        /* a broken quantity counts nothing */
      }
    }
  }
  return {
    inEstimates, soldQty: sold.toString(), revenueCents: revenue,
    profitCents: db.costsVisible === false ? null : profit, boughtQty: bought.toString(),
  };
}

/** catalog_price_history row → the card's entry (a broken number is left out) */
export function priceHistoryFromRow(r: Record<string, unknown>): PriceHistoryEntry {
  const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) ? Number(v) : undefined);
  const out: PriceHistoryEntry = { id: String(r.id), itemId: String(r.item_id), source: String(r.source ?? "manual"), at: String(r.at) };
  const price = num(r.unit_price_cents), prevPrice = num(r.prev_unit_price_cents), markup = num(r.markup_bps), prevMarkup = num(r.prev_markup_bps);
  if (price !== undefined) out.priceCents = price;
  if (prevPrice !== undefined) out.prevPriceCents = prevPrice;
  if (markup !== undefined) out.markupBps = markup;
  if (prevMarkup !== undefined) out.prevMarkupBps = prevMarkup;
  if (typeof r.by === "string") out.by = r.by;
  return out;
}

/** the newest price / markup changes of an item, as read for its card */
export const priceHistoryOf = (db: Pick<DB, "priceHistory">, itemId: ID, limit: number): PriceHistoryEntry[] =>
  (db.priceHistory ?? []).filter((h) => h.itemId === itemId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);

/** «created / changed, by whom» of an item (catalog_items' own columns) */
export const itemDates = (it: Pick<CatalogItem, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">) => ({
  created: it.createdAt ? { at: it.createdAt, by: it.createdBy } : undefined,
  // a change only when it is not the creation itself
  changed: it.updatedAt && it.updatedAt !== it.createdAt ? { at: it.updatedAt, by: it.updatedBy } : undefined,
});
