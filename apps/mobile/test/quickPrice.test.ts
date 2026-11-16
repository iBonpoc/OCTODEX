/** unit:quickPrice — spec 53 §6.3 (wave 53-1): one item's price from a sheet, pure. */
import { describe, expect, it } from "vitest";
import { catalogPrice } from "@octo/estimating-engine";
import { quickChanged, quickNeed, quickNoMarkup, quickPack, quickPriceItem } from "../src/features/quickPrice";
import type { CatalogItem } from "../src/data/types";

// a material made by «Создать позиции сразу»: a TEST price, cost = the price, no tax, no markup (prices.ts missingItems)
const testMat: CatalogItem = { id: "m1", kind: "material", name: "Gutter 5 (test)", unit: "ft", priceCents: 300, costCents: 300, vendorTaxBps: 0, markupBps: 0, placeholder: true };
const labor: CatalogItem = { id: "l1", kind: "labor", name: "Install (test)", unit: "ft", priceCents: 500, placeholder: true };

describe("unit:quickPrice — the item to save", () => {
  it("a material: the typed cost and markup, the client price as the engine counts it, the test mark gone", () => {
    const x = quickPriceItem(testMat, { costCents: 231, markupBps: 3000 }, [], false);
    expect(x).toMatchObject({ costCents: 231, markupBps: 3000, placeholder: false });
    expect(x.priceCents).toBe(catalogPrice(231, 0, 3000));
    expect(x.priceCents).toBe(300);
  });
  it("with the supplier's tax: counted with it (the engine, not the sheet)", () => {
    const x = quickPriceItem({ ...testMat, vendorTaxBps: 1025 }, { costCents: 1000, markupBps: 1000 }, [], false);
    expect(x.priceCents).toBe(1213);
  });
  it("«Сохранить» without a change keeps the test mark (rule 9): an untouched test price never becomes a real one", () => {
    const x = quickPriceItem(testMat, { costCents: 300, markupBps: 0 }, [], false);
    expect(x.placeholder).toBe(true);
    expect(quickChanged(testMat, { costCents: 300 }, false)).toBe(false);
    expect(quickChanged(testMat, { costCents: 301 }, false)).toBe(true);
  });
  it("labor: the client price is typed; the test mark goes on a change", () => {
    expect(quickPriceItem(labor, { priceCents: 650 }, [], false)).toMatchObject({ priceCents: 650, placeholder: false });
    expect(quickPriceItem(labor, { priceCents: 500 }, [], false).placeholder).toBe(true);
  });
  it("who does not see costs (sales without view_costs): a material's client price is typed, the cost is not touched", () => {
    const mat: CatalogItem = { id: "m2", kind: "material", name: "Hanger", unit: "ea", priceCents: 140 };
    const x = quickPriceItem(mat, { priceCents: 150, costCents: 9 }, [], true);
    expect(x).toMatchObject({ priceCents: 150, placeholder: false });
    expect(x.costCents).toBeUndefined();
  });
});

describe("unit:quickPrice — what the sheet says", () => {
  it("missing: a material's cost, labor's price ($0 is not a price here)", () => {
    expect(quickNeed({ ...testMat, costCents: undefined }, {}, false)).toBe("cost");
    expect(quickNeed(testMat, { costCents: 0 }, false)).toBe("cost");
    expect(quickNeed(testMat, {}, false)).toBeNull();
    expect(quickNeed(labor, { priceCents: 0 }, false)).toBe("price");
    expect(quickNeed(labor, {}, false)).toBeNull();
  });
  it("no markup on a material: warned; with a markup or for labor: not", () => {
    expect(quickNoMarkup(testMat, {}, false)).toBe(true);
    expect(quickNoMarkup(testMat, { markupBps: 3000 }, false)).toBe(false);
    expect(quickNoMarkup(labor, {}, false)).toBe(false);
    expect(quickNoMarkup(testMat, {}, true)).toBe(false);
  });
  it("how the supplier sells it (audit's condition): by lb with ft in a lb, by box; none for the item's own unit", () => {
    expect(quickPack({ unit: "ft", purchaseUnit: "lb", packSize: "2.6" })).toEqual({ buy: "lb", n: "2.6", unit: "ft" });
    expect(quickPack({ unit: "ea", purchaseUnit: "box" })).toEqual({ buy: "box", unit: "ea" });
    expect(quickPack({ unit: "ea", purchaseUnit: "EA", packSize: "1" })).toBeNull();
    expect(quickPack({ unit: "ea" })).toBeNull();
  });
});
