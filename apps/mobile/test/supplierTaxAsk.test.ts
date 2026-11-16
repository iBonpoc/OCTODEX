/**
 * unit:supplierTaxAsk — #1835 (the audit's variant Б, 16.11). «Сохранить в каталог» keeps a line's cost, which already has
 * the supplier's tax in it, as the item's cost with no tax; picking a supplier with a tax then added the tax a second time:
 * $100 + 8 % = $108 at 30 % → $140.40 became $116.64 / $151.63. Now the picking asks once, only when it matters, and
 * «Да, с налогом» keeps the cost without the tax — the client's price stays.
 */
import { describe, expect, it } from "vitest";
import { catalogCost } from "@octo/estimating-engine";
import type { CatalogItem, Supplier } from "../src/data/types";
import { catalogUnitPrice } from "../src/features/estimateDoc";
import { catalogOffer } from "../src/features/estimateRows";
import { pickSupplier, supplierTaxAsk } from "../src/features/suppliers";

const s8: Supplier = { id: "s8", name: "ABC Supply (test)", active: true, taxBps: 800 };
/** the catalog item «Сохранить в каталог» makes from a line: our cost $108.00 (with the tax), the client's $140.40 */
const fromLine = (): CatalogItem => {
  const o = catalogOffer({ id: "l", name: "Bracket (test)", group: "material", quantity: "1", unit: "ea", unitPriceCents: 14040, unitCostCents: 10800 }, true);
  if (o.state !== "offered") throw new Error("not offered");
  return { id: "i", ...o.item };
};

describe("unit:supplierTaxAsk — #1835", () => {
  it("the bug as it was: the supplier picked without the question doubles the tax (116.64 / 151.63)", () => {
    const it0 = fromLine();
    expect(catalogUnitPrice(it0)).toBe(14040);
    const old = pickSupplier(it0, s8);
    expect(catalogCost(old.costCents!, old.vendorTaxBps)).toBe(11664);
    expect(catalogUnitPrice(old)).toBe(15163);
  });
  it("asked: $108.00 with the tax (8 %) → $100.00; each answer says the client's price after it", () => {
    const ask = supplierTaxAsk(fromLine(), s8)!;
    expect(ask).toEqual({ costCents: 10800, taxBps: 800, netCents: 10000, priceWithTax: 14040, priceWithoutTax: 15163, priceNow: 14040 });
  });
  it("«Да, с налогом»: the cost is kept without the tax — the client's price and our cost stay to the cent", () => {
    const it1 = pickSupplier(fromLine(), s8, "withTax");
    expect(it1.costCents).toBe(10000);
    expect(it1.vendorTaxBps).toBe(800);
    expect(catalogCost(it1.costCents!, it1.vendorTaxBps)).toBe(10800);
    expect(catalogUnitPrice(it1)).toBe(14040);
  });
  it("«Нет, без налога»: the cost stays, the tax is added on top — the price the question named", () => {
    const it1 = pickSupplier(fromLine(), s8, "withoutTax");
    expect(it1.costCents).toBe(10800);
    expect(catalogUnitPrice(it1)).toBe(supplierTaxAsk(fromLine(), s8)!.priceWithoutTax);
  });
  it("half up: $10.00 at 10.25 % → $9.07 (9.0703…), back → $10.00", () => {
    const it0: CatalogItem = { id: "x", kind: "material", name: "x", unit: "ea", priceCents: 1300, costCents: 1000, vendorTaxBps: 0, markupBps: 3000 };
    const ask = supplierTaxAsk(it0, { ...s8, taxBps: 1025 })!;
    expect(ask.netCents).toBe(907);
    expect(catalogCost(ask.netCents, 1025)).toBe(1000);
  });
  it("asked only when it matters: no question for a second picking, a supplier tax of 0, no cost, a tax of its own, not a material", () => {
    const base = fromLine();
    expect(supplierTaxAsk({ ...base, supplierId: "s1", vendorTaxBps: 800 }, s8)).toBeNull(); // a supplier with its tax before — no question
    expect(supplierTaxAsk(pickSupplier(base, s8, "withTax"), s8)).toBeNull(); // after the answer: never again
    expect(supplierTaxAsk(base, { ...s8, taxBps: 0 })).toBeNull();
    expect(supplierTaxAsk(base, { ...s8, taxBps: undefined })).toBeNull();
    expect(supplierTaxAsk({ ...base, costCents: undefined }, s8)).toBeNull();
    expect(supplierTaxAsk({ ...base, costCents: 0 }, s8)).toBeNull();
    expect(supplierTaxAsk({ ...base, vendorTaxBps: 950 }, s8)).toBeNull();
    expect(supplierTaxAsk({ ...base, kind: "labor" }, s8)).toBeNull();
  });
  it("review #1904 №1: a supplier with no tax before, then one with 8 % — still asked (the tax would double silently)", () => {
    expect(supplierTaxAsk({ ...fromLine(), supplierId: "s0", vendorTaxBps: 0 }, s8)).not.toBeNull();
    expect(supplierTaxAsk({ ...fromLine(), supplierId: "", vendorTaxBps: 0 }, s8)).not.toBeNull();
  });
  it("review #1904 №2: «Да» changes only the cost the question named — a cost changed meanwhile is not touched", () => {
    const it0 = fromLine();
    const asked = supplierTaxAsk(it0, s8)!;
    expect(pickSupplier(it0, s8, "withTax", asked).costCents).toBe(10000);
    expect(pickSupplier({ ...it0, costCents: 9000 }, s8, "withTax", asked).costCents).toBe(9000);
  });
  it("closing without an answer changes nothing: the item is only changed by an answer (no default)", () => {
    const it0 = fromLine();
    // the screen calls pickSupplier only with an answer; without one the item stays as it was
    expect(supplierTaxAsk(it0, s8)).not.toBeNull();
    expect(it0.supplierId).toBeUndefined();
  });
});
