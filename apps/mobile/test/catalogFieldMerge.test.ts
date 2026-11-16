/**
 * unit:catalogFieldMerge — spec 53-0 (PRD 04 §9 «merge by field»): a catalog item already on the server is saved by the
 * columns this save changed, so a save queued on another phone never puts back the fields its person did not touch (the
 * risk of docs/specs/53-price-update.md §5.3). A new item, onlyNew and an op of an older build — the whole row (rule 16).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** the server's row of the item and every write the op made */
const server = { row: null as Record<string, unknown> | null, upserts: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], updateErrors: [] as ({ code: string; message: string } | null)[] };
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const done = (r: unknown) => ({ then: (ok: (x: unknown) => unknown) => Promise.resolve(r).then(ok) });
      const sel = { eq: () => sel, maybeSingle: () => done({ data: server.row ? { id: server.row.id, deleted_at: null } : null, error: null }) };
      return {
        select: () => sel,
        upsert: (row: Record<string, unknown>) => {
          if (table === "catalog_items") {
            server.upserts.push(row);
            server.row = { ...(server.row ?? {}), ...row };
          }
          return done({ data: null, error: null });
        },
        update: (row: Record<string, unknown>) => {
          const q = {
            eq: () => q,
            select: () => {
              server.updates.push(row);
              const error = server.updateErrors.shift() ?? null;
              if (error || !server.row) return done({ data: error ? null : [], error });
              server.row = { ...server.row, ...row };
              return done({ data: [{ id: server.row.id }], error: null });
            },
          };
          return q;
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { applyOp, catalogItemChange, catalogItemCols } from "../src/cloud/ops";
import type { CatalogItem } from "../src/data/types";

const base: CatalogItem = { id: "i1", kind: "material", name: "Hanger (test)", unit: "ea", priceCents: 300, costCents: 210, vendorTaxBps: 0, markupBps: 4300, placeholder: true, supplierSku: "HH5", attributes: { part: "hanger", size: "5" } };

beforeEach(() => {
  server.row = null;
  server.upserts.length = 0;
  server.updates.length = 0;
  server.updateErrors.length = 0;
});

describe("unit:catalogFieldMerge — what changed", () => {
  it("a new item: none (written whole); nothing changed: none of the columns", () => {
    expect(catalogItemChange(undefined, base)).toBeUndefined();
    expect(catalogItemChange(base, { ...base })).toEqual([]);
  });
  it("each changed field is its column; the costs are not item columns (they go by catalogCostChange)", () => {
    expect(catalogItemChange(base, { ...base, name: "Hanger 5 (test)" })).toEqual(["name"]);
    expect(catalogItemChange(base, { ...base, priceCents: 330, placeholder: false })).toEqual(["unit_price_cents", "is_placeholder_price"]);
    expect(catalogItemChange(base, { ...base, supplierSku: "" })).toEqual(["supplier_sku"]);
    expect(catalogItemChange(base, { ...base, costCents: 231, markupBps: 3000 })).toEqual([]);
    expect(catalogItemChange(base, { ...base, components: [{ itemId: "k", qty: "2" }] })).toEqual(["components"]);
  });
  it("the same value written another way is no change: properties in another order, a barcode with spaces, an unset description", () => {
    expect(catalogItemChange(base, { ...base, attributes: { size: "5", part: "hanger" } })).toEqual([]);
    expect(catalogItemChange({ ...base, barcode: "0123" }, { ...base, barcode: " 0123 " })).toEqual([]);
    expect(catalogItemChange({ ...base, description: undefined }, { ...base, description: undefined })).toEqual([]);
    expect(catalogItemChange(base, { ...base, attributes: { part: "hanger", size: "6" } })).toEqual(["attributes"]);
  });
  it("a field the phone does not carry is never sent (an older cache without the card's fields)", () => {
    expect(catalogItemChange({ ...base, sku: "H-5" }, { ...base })).toEqual([]);
    expect("sku" in catalogItemCols(base)).toBe(false);
  });
});

describe("unit:catalogFieldMerge — to the server", () => {
  it("an item there: an update of only the changed columns (and the changed costs), never the whole row", async () => {
    server.row = { id: "i1", name: "Hanger (test)", unit_price_cents: 300, is_placeholder_price: true, supplier_sku: "HH5" };
    await applyOp({ k: "catalog.save", item: { ...base, name: "Hanger 5 (test)" }, costs: {}, fields: ["name"] }, "co", "u");
    expect(server.upserts).toEqual([]);
    expect(server.updates).toEqual([{ name: "Hanger 5 (test)" }]);
  });
  it("two phones: A renames offline, B sets the price and supplier first — after both, A's name and B's price and code", async () => {
    server.row = { id: "i1", name: "Hanger (test)", unit_price_cents: 300, is_placeholder_price: true, supplier_sku: "HH5" };
    const b = { ...base, priceCents: 330, placeholder: false, supplierSku: "HH5-ABC" };
    await applyOp({ k: "catalog.save", item: b, costs: { costCents: 231 }, fields: catalogItemChange(base, b) }, "co", "u");
    // A's save was queued before B's, with the old price and the test mark on its phone
    const a = { ...base, name: "Hanger 5 (test)" };
    await applyOp({ k: "catalog.save", item: a, costs: {}, fields: catalogItemChange(base, a) }, "co", "u");
    expect(server.row).toMatchObject({ name: "Hanger 5 (test)", unit_price_cents: 330, is_placeholder_price: false, supplier_sku: "HH5-ABC" });
  });
  it("one field from two devices (the audit's condition): the later save wins, and neither loses its other fields", async () => {
    server.row = { id: "i1", name: "Hanger (test)", unit_price_cents: 300, is_placeholder_price: true, supplier_sku: "HH5" };
    // device A: the price and the code; device B, offline, the same price and the name — B reaches the server second
    const a = { ...base, priceCents: 330, supplierSku: "HH5-A" };
    const b = { ...base, priceCents: 350, name: "Hanger B (test)" };
    await applyOp({ k: "catalog.save", item: a, costs: {}, fields: catalogItemChange(base, a) }, "co", "u");
    await applyOp({ k: "catalog.save", item: b, costs: {}, fields: catalogItemChange(base, b) }, "co", "u");
    // the price: the later (B); A's code and B's name both stay; what the server keeps is what both phones read next
    expect(server.row).toMatchObject({ unit_price_cents: 350, supplier_sku: "HH5-A", name: "Hanger B (test)", is_placeholder_price: true });
  });
  it("the same op of an older build (no fields) writes the whole row, as before (rule 16)", async () => {
    server.row = { id: "i1", unit_price_cents: 330 };
    await applyOp({ k: "catalog.save", item: { ...base, name: "x" } }, "co", "u");
    expect(server.updates).toEqual([]);
    expect(server.upserts[0]).toMatchObject({ id: "i1", name: "x", unit_price_cents: 300 });
  });
  it("no row updated (not on the server yet, or not ours) — the whole row, the server decides", async () => {
    server.row = null;
    await applyOp({ k: "catalog.save", item: { ...base, name: "y" }, costs: {}, fields: ["name"] }, "co", "u");
    expect(server.updates).toEqual([{ name: "y" }]);
    expect(server.upserts[0]).toMatchObject({ id: "i1", name: "y", unit_price_cents: 300, is_placeholder_price: true });
  });
  it("nothing changed and no cost: nothing written; only a cost changed: the cost columns alone", async () => {
    server.row = { id: "i1" };
    await applyOp({ k: "catalog.save", item: base, costs: {}, fields: [] }, "co", "u");
    expect(server.updates).toEqual([]);
    expect(server.upserts).toEqual([]);
    await applyOp({ k: "catalog.save", item: { ...base, costCents: 231 }, costs: { costCents: 231 }, fields: [] }, "co", "u");
    expect(server.updates).toEqual([{ unit_cost_cents: 231 }]);
    expect(server.upserts).toEqual([]);
  });
  it("onlyNew stays «insert, or nothing»: the whole row, even with fields", async () => {
    await applyOp({ k: "catalog.save", item: base, onlyNew: true, costs: {}, fields: ["name"] }, "co", "u");
    expect(server.updates).toEqual([]);
    expect(server.upserts).toHaveLength(1);
  });
  it("the card's fields never cost the save: a server before the migration (PGRST204) or a refused direction (23503) — without them", async () => {
    server.row = { id: "i1" };
    server.updateErrors.push({ code: "PGRST204", message: "Could not find the 'barcode' column of 'catalog_items'" });
    await applyOp({ k: "catalog.save", item: { ...base, name: "z", barcode: "0123" }, costs: {}, fields: ["name", "barcode"] }, "co", "u");
    expect(server.updates).toEqual([{ name: "z", barcode: "0123" }, { name: "z" }]);
    server.updates.length = 0;
    server.updateErrors.push({ code: "23503", message: 'violates foreign key constraint "catalog_items_service_category_fk"' });
    await applyOp({ k: "catalog.save", item: { ...base, serviceCategoryId: "sc-new" }, costs: {}, fields: ["service_category_id"] }, "co", "u");
    // only the direction changed and the server takes none of it: nothing else written, the whole row never sent
    expect(server.updates).toEqual([{ service_category_id: "sc-new" }]);
    expect(server.upserts).toEqual([]);
  });
  it("a field name that is no column of the item (an inherited key, a server column) is never sent", async () => {
    server.row = { id: "i1" };
    await applyOp({ k: "catalog.save", item: { ...base, name: "v" }, costs: {}, fields: ["__proto__", "toString", "row_version", "company_id", "deleted_at", "name"] }, "co", "u");
    expect(server.updates).toEqual([{ name: "v" }]);
  });
  it("a refused direction (23503) drops the direction alone: the barcode changed in the same save is kept", async () => {
    server.row = { id: "i1" };
    server.updateErrors.push({ code: "23503", message: 'violates foreign key constraint "catalog_items_service_category_fk"' });
    await applyOp({ k: "catalog.save", item: { ...base, barcode: "0456", serviceCategoryId: "sc-new" }, costs: {}, fields: ["barcode", "service_category_id"] }, "co", "u");
    expect(server.updates).toEqual([{ barcode: "0456", service_category_id: "sc-new" }, { barcode: "0456" }]);
    expect(server.row).toMatchObject({ barcode: "0456" });
  });
  it("another refusal stays the op's", async () => {
    server.row = { id: "i1" };
    server.updateErrors.push({ code: "23514", message: "new row violates check constraint" });
    await expect(applyOp({ k: "catalog.save", item: { ...base, name: "w" }, costs: {}, fields: ["name"] }, "co", "u")).rejects.toThrow();
    expect(server.upserts).toEqual([]);
  });
});
