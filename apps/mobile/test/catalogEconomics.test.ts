/**
 * Catalog card «Cost» and «Margin %» (list-cards chat, catalog list on ListCard): catalogItemEconomics.
 * Test prices only (founder rule 9). The money math is the engine's (partsCost, marginPctOf, catalogCost).
 */
import { describe, expect, it } from "vitest";
import { catalogItemEconomics, kitPrice } from "../src/features/estimateDoc";
import type { CatalogItem } from "../src/data/types";

const mat = (id: string, costCents: number | undefined, vendorTaxBps = 0, markupBps = 0): CatalogItem => ({ id, kind: "material", name: id, unit: "ea", priceCents: 0, costCents, vendorTaxBps, markupBps, placeholder: true });
const svc = (id: string, priceCents: number, costCents?: number): CatalogItem => ({ id, kind: "service", name: id, unit: "ea", priceCents, costCents, placeholder: true });
const kit = (id: string, components: { itemId: string; qty: string }[]): CatalogItem => ({ id, kind: "kit", name: id, unit: "kit", priceCents: 0, components, placeholder: true });

describe("catalogItemEconomics (test prices)", () => {
  it("a material: cost with supplier tax, price with markup, margin one decimal", () => {
    const m = mat("m", 1000, 1025, 1000); // $10.00 at 10.25% = $11.03 cost; +10% = $12.13
    expect(catalogItemEconomics(m, [m])).toEqual({ costCents: 1103, priceCents: 1213, marginPct: "9.1" });
  });
  it("a service with a cost", () => {
    const s = svc("s", 20000, 15000);
    expect(catalogItemEconomics(s, [s])).toEqual({ costCents: 15000, priceCents: 20000, marginPct: "25.0" });
  });
  it("no cost → «—»: cost and margin unknown, the price stays", () => {
    const s = svc("s", 20000);
    expect(catalogItemEconomics(s, [s])).toEqual({ costCents: null, priceCents: 20000, marginPct: null });
  });
  it("a kit: Σ component cost × qty; price is the kit price", () => {
    const a = mat("a", 1000, 1025, 1000);
    const b = svc("b", 5000, 3000);
    const k = kit("k", [{ itemId: "a", qty: "12" }, { itemId: "b", qty: "0.5" }]);
    const cat = [a, b, k];
    const r = catalogItemEconomics(k, cat);
    expect(r.costCents).toBe(1103 * 12 + 1500);
    expect(r.priceCents).toBe(kitPrice(k, cat));
    expect(r.marginPct).not.toBeNull();
  });
  it("a kit with any component without cost, or a missing component → unknown cost", () => {
    const a = mat("a", 1000);
    const b = svc("b", 5000);
    expect(catalogItemEconomics(kit("k", [{ itemId: "a", qty: "1" }, { itemId: "b", qty: "1" }]), [a, b]).costCents).toBeNull();
    expect(catalogItemEconomics(kit("k", [{ itemId: "a", qty: "1" }, { itemId: "gone", qty: "1" }]), [a]).marginPct).toBeNull();
  });
  it("price below cost → negative margin", () => {
    const s = svc("s", 9000, 10000);
    expect(catalogItemEconomics(s, [s]).marginPct).toBe("-11.1");
  });
  it("price 0 → margin unknown (no division by zero)", () => {
    const s = svc("s", 0, 500);
    expect(catalogItemEconomics(s, [s])).toEqual({ costCents: 500, priceCents: 0, marginPct: null });
  });
});
