/**
 * unit:catalogCard — РС-10 (spec 2026-11-12-estimate-editor Р11, §4.1): the catalog item card's data on the phone —
 * the link and the barcode as the server keeps them (db T202: the same code points), what opens (only https:, the host
 * shown first), what the item did on this device, the price history, the fields to and from the server. Test prices.
 */
import { describe, expect, it, vi } from "vitest";

const upserts: { table: string; row: Record<string, unknown> }[] = [];
let missingPriceTable = false;
const upsertErrors: ({ code: string; message: string } | null)[] = [];
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
          const error = upsertErrors.shift() ?? null;
          return { then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error }).then(ok) };
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { BARCODE_OK, PRODUCT_URL_BAD, PRODUCT_URL_SHAPE, cleanCardFields, itemDates, itemForSave, mergePriceHistory, itemUsage, localPriceEntries, normalizeBarcode, normalizeProductUrl, priceHistoryFromRow, priceHistoryOf, productLink } from "../src/features/catalogCard";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("unit:catalogCard — the phone and the server agree (code-reviewer of РС-10)", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261112230000_catalog_card.sql"), "utf8");
  it("the link's and the barcode's patterns are the migration's own text (a mismatch would drop a whole save from the queue)", () => {
    const bad = /product_url !~ '(\[[^']*\])'/.exec(sql)?.[1];
    const shape = /product_url ~ '([^']*)'/.exec(sql)?.[1];
    const barcode = /barcode ~ '([^']*)'/.exec(sql)?.[1];
    // the phone also refuses NUL (\u0000), which a server text can never hold
    expect(PRODUCT_URL_BAD.replace("\\u0000", "\\u0001")).toBe(bad);
    expect(PRODUCT_URL_SHAPE).toBe(shape);
    expect(BARCODE_OK).toBe(barcode);
    expect(/length\(product_url\) <= 500/.test(sql)).toBe(true);
  });
  it("the store keeps what the server will: normalized, a refused value keeps the item's own, a direction of the company only", () => {
    const db = { serviceCategories: [{ id: "sc1" }] } as unknown as DB;
    const prev = { id: "i1", kind: "material", name: "x", unit: "ea", priceCents: 0, barcode: "0123", productUrl: "https://old.example/" } as CatalogItem;
    expect(cleanCardFields({ ...prev, barcode: " 999 ", productUrl: "abc.example/x", serviceCategoryId: "sc1", sku: " H-5 " }, prev, db))
      .toMatchObject({ barcode: "999", productUrl: "https://abc.example/x", serviceCategoryId: "sc1", sku: "H-5" });
    expect(cleanCardFields({ ...prev, barcode: "12;34", productUrl: "http://x.example", serviceCategoryId: "gone" }, prev, db))
      .toMatchObject({ barcode: "0123", productUrl: "https://old.example/" });
    const fresh = cleanCardFields({ ...prev, id: "i2", barcode: "12;34", productUrl: "javascript:x", serviceCategoryId: "gone" }, undefined, db);
    expect("barcode" in fresh || "productUrl" in fresh || "serviceCategoryId" in fresh).toBe(false);
  });
  it("the phone's own price and markup rows of a save, as the server writes them", () => {
    let n = 0;
    const id = () => `h${++n}`;
    const prev = { id: "i1", kind: "material", name: "x", unit: "ea", priceCents: 1190, markupBps: 1000 } as CatalogItem;
    expect(localPriceEntries(prev, { ...prev, priceCents: 1213, markupBps: 1200 }, id, "t")).toEqual([
      { id: "h1", itemId: "i1", priceCents: 1213, prevPriceCents: 1190, source: "manual", at: "t", local: true },
      { id: "h2", itemId: "i1", markupBps: 1200, prevMarkupBps: 1000, source: "manual", at: "t", local: true },
    ]);
    expect(localPriceEntries(prev, { ...prev, name: "y" }, id, "t")).toEqual([]);
    expect(localPriceEntries(undefined, prev, id, "t")).toEqual([]);
  });
  it("catalog.save: a direction the server refuses (23503) — the item goes without it; a server before the migration (PGRST204) — without the card's fields", async () => {
    const item: CatalogItem = { id: "i1", kind: "material", name: "Hanger", unit: "ea", priceCents: 1213, barcode: "0123", serviceCategoryId: "sc-new" };
    upserts.length = 0;
    upsertErrors.push({ code: "23503", message: 'insert or update on table "catalog_items" violates foreign key constraint "catalog_items_service_category_fk"' });
    await applyOp({ k: "catalog.save", item }, "co", "u");
    expect(upserts.map((u) => "service_category_id" in u.row)).toEqual([true, false]);
    expect(upserts[1]!.row).toMatchObject({ unit_price_cents: 1213, barcode: "0123" });
    upserts.length = 0;
    upsertErrors.push({ code: "PGRST204", message: "Could not find the 'barcode' column of 'catalog_items'" });
    await applyOp({ k: "catalog.save", item }, "co", "u");
    expect(upserts.map((u) => "barcode" in u.row)).toEqual([true, false]);
    expect(upserts[1]!.row).toMatchObject({ unit_price_cents: 1213 });
    // another refusal stays the op's
    upserts.length = 0;
    upsertErrors.push({ code: "23514", message: "new row violates check constraint" });
    await expect(applyOp({ k: "catalog.save", item }, "co", "u")).rejects.toThrow();
    expect(upserts).toHaveLength(1);
  });
});

describe("unit:catalogCard — itemUsage, more cases (code-reviewer of РС-10)", () => {
  const line = (id: string, x: object = {}) => ({ id, name: id, group: "material", quantity: "2", unit: "ea", unitPriceCents: 1000, catalogItemId: "i1", ...x });
  const d = { options: [{ id: "o1", name: "A", recommended: true, lines: [line("a")] }, { id: "o2", name: "B", lines: [line("b", { quantity: "1.23456" })] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
  const est = (status: Estimate["status"], optionId?: string) =>
    ({ id: status + (optionId ?? ""), customerId: "c", propertyId: "p", title: "x", totalCents: 0, status, doc: d, ...(optionId ? { approval: { optionId, addonIds: [], signerName: "x", signature: "x", at: "x", channel: "on_site", totalCents: 0, depositCents: 0 } } : {}) }) as Estimate;
  it("the option the client chose, not the recommended one; the quantity as the engine counts it (4 decimals)", () => {
    const u = itemUsage({ estimates: [est("approved", "o2")], purchaseOrders: [], costsVisible: true } as unknown as DB, "i1");
    expect(u.soldQty).toBe("1.2346");
    expect(u.revenueCents).toBe(1235);
  });
  it("approved without a choice, declined with one, a choice of an option not there — nothing sold", () => {
    const u = itemUsage({ estimates: [est("approved"), est("declined", "o1"), est("approved", "gone")], purchaseOrders: [], costsVisible: true } as unknown as DB, "i1");
    expect(u).toMatchObject({ inEstimates: 3, soldQty: "0", revenueCents: 0 });
  });
});

describe("unit:catalogCard — the director's review of #1236", () => {
  it("productLink: no scheme-relative link, no international host or a look-alike letter, no tab or line break inside, no format character in the host", () => {
    const bad = ["//evil.example", "https://пример.рф/x", "https://ex\u0430mple.com/x", "https://abc.example/a\tb", "https://abc.example/a\nb", "https://ab\nc.example/",
      "https://abc\u200d.example/", "https://abc.example\u202e/x", "https://abc.example\ufeff/x"];
    for (const u of bad) {
      expect(productLink(u), JSON.stringify(u)).toBeNull();
      expect(normalizeProductUrl(u).ok, JSON.stringify(u)).toBe(false);
    }
  });
  it("the server's rows replace the phone's for that item; the phone's own stay while its save is in the queue", () => {
    const cur = [
      { id: "l1", itemId: "i1", priceCents: 1213, source: "manual", at: "2", local: true },
      { id: "s0", itemId: "i1", priceCents: 1190, source: "manual", at: "1" },
      { id: "o1", itemId: "i2", priceCents: 500, source: "manual", at: "1" },
    ];
    const rows = [{ id: "s1", itemId: "i1", priceCents: 1190, source: "manual", at: "1" }];
    expect(mergePriceHistory(cur, "i1", rows, false).map((h) => h.id)).toEqual(["s1", "o1"]);
    expect(mergePriceHistory(cur, "i1", rows, true).map((h) => h.id)).toEqual(["s1", "l1", "o1"]);
  });
  it("the phone's rows carry who; a save sends no server-owned columns", () => {
    const prev = { id: "i1", kind: "material", name: "x", unit: "ea", priceCents: 1190 } as CatalogItem;
    expect(localPriceEntries(prev, { ...prev, priceCents: 1213 }, () => "h", "t", "u1")).toEqual([{ id: "h", itemId: "i1", priceCents: 1213, prevPriceCents: 1190, source: "manual", at: "t", by: "u1", local: true }]);
    expect(itemForSave({ ...prev, createdAt: "a", createdBy: "u1", updatedAt: "b", updatedBy: "u2", barcode: "1" })).toEqual({ ...prev, barcode: "1" });
  });
});
