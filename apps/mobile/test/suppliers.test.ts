/**
 * unit:suppliers — spec 36 SUP1: the server's rules on the phone (cleanSupplier, SKU), picking a supplier for an item
 * (S0c: the link, the name into vendor, the tax copied → a new estimate line counts with it), «Применить к N позициям»,
 * the phone's own history row, who sees suppliers, the expense chips and the server rows.
 */
import { describe, expect, it } from "vitest";
import { catalogPrice } from "@octo/estimating-engine";
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB, Supplier } from "../src/data/types";
import { catalogUnitPrice } from "../src/features/estimateDoc";
import {
  canSeeSuppliers, cleanSupplier, cleanSupplierLink, emailBad, expenseVendors, historyFromRow, historyOf, itemsOfSupplier,
  itemsWithOtherTax, keepCostHistory, localHistoryEntry, mergeHistory, pickSupplier, supplierFromRow, supplierName, supplierToRow,
} from "../src/features/suppliers";

const sup = (over: Partial<Supplier> = {}): Supplier => ({ id: "s1", name: "ABC Supply (test)", active: true, ...over });
const mat = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "i1", kind: "material", name: "Bracket (test)", unit: "ea", priceCents: 0, costCents: 1000, vendorTaxBps: 0, markupBps: 1000, ...over,
});

describe("unit:suppliers — the server's rules", () => {
  it("a name is needed; text is trimmed, cut and cleaned", () => {
    expect(cleanSupplier(sup({ name: "   " }))).toBeNull();
    const x = cleanSupplier(sup({ name: "  ABC‮ Supply  ", phone: " 555 ", contactName: "a".repeat(100), email: "bad", accountNumber: "" }))!;
    expect(x.name).toBe("ABC Supply");
    expect(x.phone).toBe("555");
    expect([...x.contactName!].length).toBe(80);
    expect(x.email).toBeUndefined();
    expect(x.accountNumber).toBeUndefined();
  });
  it("the terms note only with «custom»; the tax only 0..100%", () => {
    expect(cleanSupplier(sup({ terms: "net_30", termsNote: "x" }))!.termsNote).toBeUndefined();
    expect(cleanSupplier(sup({ terms: "custom", termsNote: " 2/10 net 30 " }))!.termsNote).toBe("2/10 net 30");
    expect(cleanSupplier(sup({ taxBps: 10001 }))!.taxBps).toBeUndefined();
    expect(cleanSupplier(sup({ taxBps: 0 }))!.taxBps).toBe(0);
  });
  it("the notes keep line breaks, not other control characters", () => {
    expect(cleanSupplier(sup({ notes: "gate code\n1234\u0007" }))!.notes).toBe("gate code\n1234");
  });
  it("an email the server would refuse is flagged", () => {
    expect(emailBad("orders@abc.test")).toBe(false);
    expect(emailBad("orders abc")).toBe(true);
    expect(emailBad("")).toBe(false);
  });
  it("the SKU: cleaned, a blank one is «cleared», a never-set one stays absent", () => {
    expect(cleanSupplierLink(mat({ supplierSku: " 12-345 " })).supplierSku).toBe("12-345");
    expect(cleanSupplierLink(mat({ supplierSku: "  " })).supplierSku).toBe("");
    expect("supplierSku" in cleanSupplierLink(mat())).toBe(false);
  });
  it("only owner/admin/office see suppliers (the account number)", () => {
    expect(canSeeSuppliers("director")).toBe(true);
    expect(canSeeSuppliers("dispatcher")).toBe(true);
    expect(canSeeSuppliers("sales")).toBe(false);
    expect(canSeeSuppliers("tech")).toBe(false);
  });
});

describe("unit:suppliers — S0c: an item ↔ its supplier", () => {
  it("picking: the link, the name into vendor, the supplier's tax copied", () => {
    const it0 = mat({ vendor: "HD", vendorTaxBps: 0 });
    const it1 = pickSupplier(it0, sup({ taxBps: 1025 }));
    expect(it1).toMatchObject({ supplierId: "s1", vendor: "ABC Supply (test)", vendorTaxBps: 1025 });
    // a new estimate line from the item counts with the copied tax: $10 + 10.25% + 10% = $12.13 (engine)
    expect(catalogUnitPrice(it1)).toBe(catalogPrice(1000, 1025, 1000));
    expect(catalogUnitPrice(it1)).toBe(1213);
    expect(catalogUnitPrice(it0)).toBe(1100);
  });
  it("a supplier without a tax keeps the item's own", () => {
    expect(pickSupplier(mat({ vendorTaxBps: 950 }), sup()).vendorTaxBps).toBe(950);
  });
  it("«Без поставщика»: the link is cleared (sent as null), the old text stays", () => {
    const x = pickSupplier(mat({ supplierId: "s1", supplierSku: "A1", vendor: "ABC" }), null);
    expect(x).toMatchObject({ supplierId: "", supplierSku: "", vendor: "ABC" });
    expect(pickSupplier(mat(), null)).toEqual(mat());
  });
  it("the name shown: the supplier's, else the old text", () => {
    const db = { ...makeSeed(), suppliers: [sup()], catalog: [mat({ supplierId: "s1", vendor: "old" }), mat({ id: "i2", vendor: " HD " })] } as DB;
    expect(supplierName(db, db.catalog[0]!)).toBe("ABC Supply (test)");
    expect(supplierName(db, db.catalog[1]!)).toBe("HD");
  });
  it("«Применить к N позициям»: only its materials with another tax", () => {
    const db = {
      ...makeSeed(),
      catalog: [mat({ supplierId: "s1", vendorTaxBps: 0 }), mat({ id: "i2", supplierId: "s1", vendorTaxBps: 1025 }), mat({ id: "i3", vendorTaxBps: 0 })],
    } as DB;
    expect(itemsWithOtherTax(db, sup({ taxBps: 1025 })).map((x) => x.id)).toEqual(["i1"]);
    expect(itemsWithOtherTax(db, sup())).toEqual([]);
    expect(itemsOfSupplier(db, "s1").map((x) => x.id)).toEqual(["i1", "i2"]);
  });
});

describe("unit:suppliers — history", () => {
  it("a row only when the cost or the tax changed", () => {
    const a = mat({ supplierId: "s1" });
    expect(localHistoryEntry(a, a, "h1", "2026-11-08T12:00:00Z")).toBeNull();
    expect(localHistoryEntry(a, { ...a, markupBps: 2000 }, "h1", "2026-11-08T12:00:00Z")).toBeNull();
    expect(localHistoryEntry(a, { ...a, costCents: 1100 }, "h1", "2026-11-08T12:00:00Z")).toEqual({
      id: "h1", itemId: "i1", supplierId: "s1", costCents: 1100, vendorTaxBps: 0, source: "manual", at: "2026-11-08T12:00:00Z", local: true,
    });
    expect(localHistoryEntry(undefined, mat({ costCents: undefined, vendorTaxBps: undefined }), "h", "t")).toBeNull();
  });
  it("of an item and of a supplier, newest first, at most N", () => {
    const db = {
      ...makeSeed(),
      catalog: [mat({ supplierId: "s1" }), mat({ id: "i2" })],
      costHistory: [
        { id: "a", itemId: "i1", source: "manual", at: "2026-11-01T00:00:00Z", costCents: 900 },
        { id: "b", itemId: "i1", source: "manual", at: "2026-11-05T00:00:00Z", costCents: 1000 },
        { id: "c", itemId: "i2", source: "manual", at: "2026-11-06T00:00:00Z", costCents: 5 },
      ],
    } as DB;
    expect(historyOf(db, { itemId: "i1" }, 5).map((h) => h.id)).toEqual(["b", "a"]);
    expect(historyOf(db, { supplierId: "s1" }, 1).map((h) => h.id)).toEqual(["b"]);
  });
});

describe("unit:suppliers — the server's rows on open (director's check of #459 Н4)", () => {
  const base = () =>
    ({
      ...makeSeed(),
      catalog: [mat({ supplierId: "s1" }), mat({ id: "i2" })],
      costHistory: [
        { id: "loc", itemId: "i1", supplierId: "s1", source: "manual", at: "2026-11-08T12:00:00Z", costCents: 1100, local: true },
        { id: "old", itemId: "i1", supplierId: "s1", source: "manual", at: "2026-11-01T00:00:00Z", costCents: 900 },
        { id: "other", itemId: "i2", source: "manual", at: "2026-11-07T00:00:00Z", costCents: 5 },
      ],
    }) as DB;
  it("an item's rows replace the phone's for that item (its own local row too), the rest stays", () => {
    const rows = [{ id: "srv", itemId: "i1", supplierId: "s1", source: "manual", at: "2026-11-08T12:00:01Z", costCents: 1100 }];
    expect(mergeHistory(base(), { itemId: "i1" }, rows).map((h) => h.id)).toEqual(["srv", "other"]);
  });
  it("a full read keeps the history read on open; not for whom costs are gone", () => {
    const cur = base();
    expect(keepCostHistory({ ...cur, costHistory: [] }, cur).costHistory).toHaveLength(3);
    expect(keepCostHistory({ ...cur, costHistory: [], costsVisible: false }, cur).costHistory).toEqual([]);
  });
  it("a supplier's rows: its rows and the local rows of its items are replaced", () => {
    const rows = [{ id: "srv", itemId: "i1", supplierId: "s1", source: "manual", at: "2026-11-08T12:00:01Z", costCents: 1100 }];
    expect(mergeHistory(base(), { supplierId: "s1" }, rows).map((h) => h.id)).toEqual(["srv", "other"]);
  });
});

describe("unit:suppliers — expense chips and server rows", () => {
  it("the company's active suppliers first, then the usual, no doubles", () => {
    const db = { ...makeSeed(), suppliers: [sup({ name: "Home Depot" }), sup({ id: "s2", name: "Zed Lumber" }), sup({ id: "s3", name: "Old", active: false })] } as DB;
    expect(expenseVendors(db, ["home depot", "Chevron"])).toEqual(["Home Depot", "Zed Lumber", "Chevron"]);
  });
  it("a supplier there and back", () => {
    const x = sup({ phone: "555", terms: "net_30", taxBps: 1025, active: false });
    const row = supplierToRow(x, "c1");
    expect(row).toMatchObject({ company_id: "c1", payment_terms: "net_30", purchase_tax_bps: 1025, is_active: false, email: null });
    expect(supplierFromRow(row)).toEqual(x);
  });
  it("a history row", () => {
    expect(historyFromRow({ id: "h", item_id: "i", supplier_id: null, unit_cost_cents: "1200", vendor_tax_bps: 1025, source: "initial", at: "t" })).toEqual({
      id: "h", itemId: "i", costCents: 1200, vendorTaxBps: 1025, source: "initial", at: "t",
    });
  });
});
