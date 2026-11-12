/**
 * unit:catalogCard — РС-10 (spec 2026-11-12-estimate-editor Р11, §4.1): the catalog item card's data on the phone —
 * the link and the barcode as the server keeps them (db T202: the same code points), what opens (only https:, the host
 * shown first), what the item did on this device, the price history, the fields to and from the server. Test prices.
 */
import { describe, expect, it, vi } from "vitest";

const upserts: { table: string; row: Record<string, unknown> }[] = [];
let missingPriceTable = false;
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "order", "limit"]) q[k] = () => q;
      q.then = (ok: (r: unknown) => unknown) =>
        Promise.resolve(
          missingPriceTable
            ? { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.catalog_price_history'" } }
            : { data: [{ id: "h1", item_id: "i1", unit_price_cents: 1213, prev_unit_price_cents: 1190, markup_bps: null, prev_markup_bps: null, source: "manual", at: "2026-11-12T10:00:00Z", by: "u1" }], error: null },
        ).then(ok);
      return {
        ...q,
        upsert: (row: Record<string, unknown>) => {
          upserts.push({ table, row });
          return { then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok) };
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { itemDates, itemUsage, normalizeBarcode, normalizeProductUrl, priceHistoryFromRow, priceHistoryOf, productLink } from "../src/features/catalogCard";
import { applyOp, catalogCardCols } from "../src/cloud/ops";
import { catalogCardFromRow, loadPriceHistory } from "../src/cloud/repo";
import { keepCostHistory } from "../src/features/suppliers";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import type { CatalogItem, DB, Estimate, EstimateDoc, PurchaseOrder } from "../src/data/types";

const ch = (code: number) => String.fromCharCode(code);

describe("unit:catalogCard — the link", () => {
  it("kept as the server keeps it: trimmed, the scheme in lowercase, https:// added to a bare host", () => {
    expect(normalizeProductUrl("  https://abc.example/hanger?id=5 ")).toEqual({ ok: true, url: "https://abc.example/hanger?id=5" });
    expect(normalizeProductUrl("HTTPS://abc.example/x")).toEqual({ ok: true, url: "https://abc.example/x" });
    expect(normalizeProductUrl("abc.example/x")).toEqual({ ok: true, url: "https://abc.example/x" });
    expect(normalizeProductUrl("abc.example:8443/x")).toEqual({ ok: true, url: "https://abc.example:8443/x" });
    expect(normalizeProductUrl("https://abc.example?q=1")).toEqual({ ok: true, url: "https://abc.example?q=1" });
    expect(normalizeProductUrl("")).toEqual({ ok: true, url: "" });
  });
  it("only https: javascript:, data:, http: and any other scheme in any case — refused", () => {
    for (const u of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "DATA:x", "http://abc.example", "vbscript:x", "ftp://abc.example", "mailto:a@b.example"])
      expect(normalizeProductUrl(u), u).toEqual({ ok: false, why: "scheme" });
  });
  it("no host, userinfo, blanks or invisible characters — refused (the same code points as the server)", () => {
    const bad = ["https:///x", "https://a@b.example/x", "https://user:pw@b.example/x", "https://abc_example/", "https://abc.example:x/", "https://",
      `https://abc.example/${ch(0xa0)}x`, `https://abc.example/${ch(0x2028)}x`, `https://abc.example/${ch(0x3000)}x`, `https://abc.example${ch(0x200b)}/x`,
      `https://abc.example/${ch(0x202e)}x`, `https://abc.example/${ch(0xfeff)}x`, `https://abc.example/${ch(0xad)}x`, "https://abc.example/a b"];
    for (const u of bad) expect(normalizeProductUrl(u).ok, JSON.stringify(u)).toBe(false);
    expect(normalizeProductUrl("https://x.example/" + "a".repeat(490))).toEqual({ ok: false, why: "long" });
  });
  it("what opens: parsed again, only https:, the host to show first", () => {
    expect(productLink("https://abc.example:8443/hanger?id=5")).toEqual({ href: "https://abc.example:8443/hanger?id=5", host: "abc.example:8443" });
    expect(productLink("HTTPS://ABC.example/x")?.host).toBe("abc.example");
    for (const u of [undefined, "", "javascript:alert(1)", "http://abc.example", "https://a@b.example/"]) expect(productLink(u), String(u)).toBeNull();
  });
});

describe("unit:catalogCard — the barcode", () => {
  it("letters, digits, space . _ / - only, ≤ 64, trimmed; a blank or invisible one — refused", () => {
    expect(normalizeBarcode(" 0123-456 A/B.c_d ")).toEqual({ ok: true, barcode: "0123-456 A/B.c_d" });
    expect(normalizeBarcode("")).toEqual({ ok: true, barcode: "" });
    // a blank only (NBSP too — trimmed away) is no barcode: nothing reaches the server
    expect(normalizeBarcode(ch(0xa0))).toEqual({ ok: true, barcode: "" });
    for (const b of [`0123${ch(0x200b)}456`, `01${ch(0xa0)}23`, "АБВ123", "12;34", "<b>"]) expect(normalizeBarcode(b).ok, JSON.stringify(b)).toBe(false);
    expect(normalizeBarcode("1".repeat(65))).toEqual({ ok: false, why: "long" });
  });
});

describe("unit:catalogCard — to and from the server", () => {
  it("catalog.save sends the card's fields only once set; a link or barcode the server would refuse is left out", async () => {
    expect(catalogCardCols({})).toEqual({});
    expect(catalogCardCols({ sku: " H-5 ", barcode: " 0123 ", productUrl: "HTTPS://abc.example/x", serviceCategoryId: "sc1" }))
      .toEqual({ sku: "H-5", barcode: "0123", product_url: "https://abc.example/x", service_category_id: "sc1" });
    expect(catalogCardCols({ sku: "", barcode: "", productUrl: "", serviceCategoryId: "" })).toEqual({ sku: null, barcode: null, product_url: null, service_category_id: null });
    expect(catalogCardCols({ barcode: "12;34", productUrl: "javascript:alert(1)" })).toEqual({});
    upserts.length = 0;
    const item: CatalogItem = { id: "i1", kind: "material", name: "Hanger", unit: "ea", priceCents: 1213, barcode: "0123", productUrl: "abc.example/x" };
    await applyOp({ k: "catalog.save", item }, "co", "u");
    expect(upserts[0]!.row).toMatchObject({ id: "i1", barcode: "0123", product_url: "https://abc.example/x" });
    expect("sku" in upserts[0]!.row || "service_category_id" in upserts[0]!.row).toBe(false);
  });
  it("the item's fields and who made / changed it are read; empty ones are left out", () => {
    expect(catalogCardFromRow({ sku: "H-5", barcode: "0123", product_url: "https://abc.example/x", service_category_id: "sc1", created_at: "2026-11-03T10:00:00Z", created_by: "u1", updated_at: "2026-11-10T10:00:00Z", updated_by: "u2" }))
      .toEqual({ sku: "H-5", barcode: "0123", productUrl: "https://abc.example/x", serviceCategoryId: "sc1", createdAt: "2026-11-03T10:00:00Z", createdBy: "u1", updatedAt: "2026-11-10T10:00:00Z", updatedBy: "u2" });
    expect(catalogCardFromRow({ sku: "", barcode: null })).toEqual({});
    expect(itemDates({ createdAt: "a", createdBy: "u1", updatedAt: "a" })).toEqual({ created: { at: "a", by: "u1" }, changed: undefined });
    expect(itemDates({ createdAt: "a", updatedAt: "b", updatedBy: "u2" }).changed).toEqual({ at: "b", by: "u2" });
  });
  it("the price history: $11.90 → $12.13, who; newest first; a server before the migration — none", async () => {
    missingPriceTable = false;
    expect(await loadPriceHistory("co", "i1")).toEqual([{ id: "h1", itemId: "i1", priceCents: 1213, prevPriceCents: 1190, source: "manual", at: "2026-11-12T10:00:00Z", by: "u1" }]);
    missingPriceTable = true;
    expect(await loadPriceHistory("co", "i1")).toEqual([]);
    expect(priceHistoryFromRow({ id: "h2", item_id: "i1", markup_bps: 1200, prev_markup_bps: null, at: "x" })).toEqual({ id: "h2", itemId: "i1", markupBps: 1200, source: "manual", at: "x" });
    const db = { priceHistory: [{ id: "a", itemId: "i1", source: "manual", at: "2026-11-01" }, { id: "b", itemId: "i1", source: "manual", at: "2026-11-05" }, { id: "c", itemId: "i2", source: "manual", at: "2026-11-09" }] };
    expect(priceHistoryOf(db, "i1", 5).map((h) => h.id)).toEqual(["b", "a"]);
    // a full read keeps it; for whom the server no longer gives costs — none
    const cur = { priceHistory: db.priceHistory, costHistory: [] } as unknown as DB;
    expect(keepCostHistory({ costsVisible: true } as DB, cur).priceHistory).toHaveLength(3);
    expect(keepCostHistory({ costsVisible: false } as DB, cur).priceHistory).toEqual([]);
  });
});

describe("unit:catalogCard — what the item did on this device (itemUsage)", () => {
  const line = (id: string, x: object = {}) => ({ id, name: id, group: "material", quantity: "2", unit: "ea", unitPriceCents: 1213, catalogItemId: "i1", unitCostCents: 1100, ...x });
  const doc = (lines: object[]): EstimateDoc => ({ options: [{ id: "o1", name: "A", lines }, { id: "o2", name: "B", lines: [line("b1", { quantity: "9" })] }], settings: DEFAULT_SETTINGS }) as unknown as EstimateDoc;
  const est = (id: string, status: Estimate["status"], d: EstimateDoc, approval?: { optionId: string; addonIds: string[] }): Estimate =>
    ({ id, customerId: "c", propertyId: "p", title: id, totalCents: 0, status, doc: d, ...(approval ? { approval: { ...approval, signerName: "x", signature: "x", at: "x", channel: "on_site", totalCents: 0, depositCents: 0 } } : {}) }) as Estimate;
  const po = (status: PurchaseOrder["status"], qty: string) => ({ id: status, status, lines: [{ id: "pl", position: 0, catalogItemId: "i1", name: "x", qty: "5", unit: "box", receivedQty: qty, checkPack: false }] }) as unknown as PurchaseOrder;
  it("in estimates (any status); sold, revenue and profit of the signed choice; bought on purchase orders", () => {
    const db = {
      costsVisible: true,
      estimates: [
        est("e1", "approved", doc([line("l1"), line("l2", { optional: true }), line("l3", { catalogItemId: "other" })]), { optionId: "o1", addonIds: ["l2"] }),
        est("e2", "awaiting_countersign", doc([line("l1", { quantity: "1.5" })]), { optionId: "o1", addonIds: [] }),
        est("e3", "draft", doc([line("l1")])),
        est("e4", "approved", doc([line("l1", { optional: true })]), { optionId: "o1", addonIds: [] }),
        est("e5", "sent", { options: [{ id: "o1", name: "A", lines: [line("x", { catalogItemId: "other" })] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc),
      ],
      purchaseOrders: [po("received", "3"), po("partially_received", "1.5"), po("cancelled", "7")],
    } as unknown as Pick<DB, "estimates" | "purchaseOrders" | "costsVisible">;
    const u = itemUsage(db, "i1");
    expect(u.inEstimates).toBe(4);
    // e1: l1 2 + the add-on l2 2 (taken); e2: 1.5; e4: the add-on not taken; the other option and a draft — not sold
    expect(u.soldQty).toBe("5.5");
    expect(u.revenueCents).toBe(2426 + 2426 + 1820); // 2 × 12.13 twice; 1.5 × 12.13 = 18.195 → 18.20
    expect(u.profitCents).toBe(226 + 226 + 170); // 2 × (12.13 − 11.00) twice; 1.5 × 1.13 = 1.695 → 1.70
    expect(u.boughtQty).toBe("4.5");
  });
  it("profit only for who sees costs and only with every cost known", () => {
    const d = doc([line("l1"), line("l2", { unitCostCents: undefined })]);
    const db = { estimates: [est("e1", "approved", d, { optionId: "o1", addonIds: [] })], purchaseOrders: [] } as unknown as Pick<DB, "estimates" | "purchaseOrders" | "costsVisible">;
    expect(itemUsage(db, "i1").profitCents).toBeNull();
    expect(itemUsage({ ...db, estimates: [est("e1", "approved", doc([line("l1")]), { optionId: "o1", addonIds: [] })], costsVisible: false }, "i1").profitCents).toBeNull();
    expect(itemUsage({ estimates: [], purchaseOrders: undefined } as unknown as DB, "i1")).toEqual({ inEstimates: 0, soldQty: "0", revenueCents: 0, profitCents: 0, boughtQty: "0" });
  });
});
