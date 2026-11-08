import { describe, expect, it } from "vitest";
import { computeCustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateDoc } from "@/data/types";
import { fromTemplate, templateFromCents, toTemplateDoc } from "@/features/estimateTemplate";

// test prices («тестовые», rule 9)
const catalog: CatalogItem[] = [
  { id: "svc", kind: "service", name: "Service call", unit: "ea", priceCents: 15000, placeholder: true },
  { id: "mat", kind: "material", name: "Material", unit: "ft", priceCents: 0, costCents: 1000, vendorTaxBps: 0, markupBps: 5000, placeholder: true },
];
const estimate: EstimateDoc = {
  options: [
    {
      id: "o1", name: "Good", recommended: true,
      lines: [
        { id: "l1", name: "Service call", group: "service", quantity: "1", unit: "ea", unitPriceCents: 12999, unitCostCents: 4000, catalogItemId: "svc" },
        { id: "l2", name: "Haul away", group: "labor", quantity: "2.5", unit: "hr", unitPriceCents: 1050, unitCostCents: 333 },
        { id: "l3", name: "Old part", group: "material", quantity: "1", unit: "ea", unitPriceCents: 700, catalogItemId: "gone" },
        { id: "l4", name: "Guards", group: "material", quantity: "3", unit: "ft", unitPriceCents: 900, optional: true, selected: true,
          source: { module: "gutters", key: "guard" } },
      ],
    },
  ],
  settings: { discount: { kind: "pct", value: "0.05" }, tax: { enabled: true, rateBps: 925, groups: { service: false, labor: false, material: true } }, deposit: { kind: "pct", bps: 1000 }, caHic: true },
  note: "Scope: front",
};

describe("unit:estimateTemplate — save as template, estimate from template (docs/specs/07 §11, S5t)", () => {
  it("save: fresh ids, no module source, add-ons unticked, settings and note kept", () => {
    const t = toTemplateDoc(estimate, true);
    const ids = t.options[0]!.lines.map((l) => l.id);
    expect(ids).not.toContain("l1");
    expect(new Set(ids).size).toBe(4);
    expect(t.options[0]!.lines.some((l) => "source" in l)).toBe(false);
    expect(t.options[0]!.lines[3]).toMatchObject({ optional: true, selected: false });
    expect(t.settings).toEqual(estimate.settings);
    expect(t.note).toBe("Scope: front");
    expect(t.options[0]!.lines[0]!.unitCostCents).toBe(4000);
  });
  it("save by who does not see costs: no cost key at all (the server keeps what it had)", () => {
    const t = toTemplateDoc(estimate, false);
    expect(t.options[0]!.lines.every((l) => !("unitCostCents" in l))).toBe(true);
  });
  it("save: quantity becomes the engine's decimal", () => {
    const t = toTemplateDoc({ ...estimate, options: [{ ...estimate.options[0]!, lines: [{ ...estimate.options[0]!.lines[1]!, quantity: " 2.50 " }] }] }, true);
    expect(t.options[0]!.lines[0]!.quantity).toBe("2.5");
  });
  it("from template: catalog line takes the current price and cost, a typed line the template's, a gone item is marked", () => {
    const tpl = toTemplateDoc(estimate, false);
    const costs = { [tpl.options[0]!.lines[1]!.id]: 333 };
    const { doc, checkPrice } = fromTemplate(tpl, catalog, costs, true);
    const [l1, l2, l3] = doc.options[0]!.lines;
    expect(l1).toMatchObject({ unitPriceCents: 15000, catalogItemId: "svc" });
    expect(l1!.unitCostCents).toBeUndefined(); // the catalog item has no cost
    expect(l2).toMatchObject({ unitPriceCents: 1050, unitCostCents: 333 });
    expect(l3!.unitPriceCents).toBe(700);
    expect(checkPrice).toEqual([l3!.id]);
    expect(doc.options[0]!.id).not.toBe(tpl.options[0]!.id);
  });
  it("from template for a tech: no cost reaches the phone, also from the catalog", () => {
    const tpl = toTemplateDoc({ ...estimate, options: [{ ...estimate.options[0]!, lines: [{ ...estimate.options[0]!.lines[0]!, catalogItemId: "mat" }] }] }, true);
    const { doc } = fromTemplate(tpl, catalog, { x: 1 }, false);
    expect(doc.options[0]!.lines[0]!.unitCostCents).toBeUndefined();
  });
  it("money: the totals of an estimate from a template = the engine's totals of the same lines (rule 8)", () => {
    const tpl = toTemplateDoc(estimate, false);
    const { doc } = fromTemplate(tpl, catalog, {}, false);
    const same = {
      id: "x", name: "Good",
      lines: [
        { id: "a", name: "Service call", group: "service" as const, quantity: "1", unit: "ea", unitPriceCents: 15000 },
        { id: "b", name: "Haul away", group: "labor" as const, quantity: "2.5", unit: "hr", unitPriceCents: 1050 },
        { id: "c", name: "Old part", group: "material" as const, quantity: "1", unit: "ea", unitPriceCents: 700 },
        { id: "d", name: "Guards", group: "material" as const, quantity: "3", unit: "ft", unitPriceCents: 900, optional: true, selected: false },
      ],
    };
    const want = computeCustomOption(same, estimate.settings);
    const got = computeCustomOption(doc.options[0]!, doc.settings);
    expect(got.total).toBe(want.total);
    expect(got.deposit).toBe(want.deposit);
    // 15000 + 2625 + 700 = 18325; −5% = 916.25 → 916; tax 9.25% on material 700 (discount spread) — the engine's numbers
    expect(got.subtotal).toBe(18325);
    expect(templateFromCents(tpl, catalog)).toBe(want.total);
  });
});
