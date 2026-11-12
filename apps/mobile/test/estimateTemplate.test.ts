import { describe, expect, it, vi } from "vitest";
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { computeCustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateDoc } from "@/data/types";
import { clientSectionsOf } from "@/features/estimateDoc";
import { cleanEstimateTemplate, fromTemplate, pickableTemplates, splitCosts, templateFromCents, toTemplateDoc, validTemplateDoc } from "@/features/estimateTemplate";
import { estimateTemplateFromDb } from "../src/cloud/repo";
import { estimateTemplateToDb } from "../src/cloud/ops";

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


describe("unit:estimateTemplate — the server's check on the phone, costs apart, rows (review E3b)", () => {
  const one = (x: Partial<EstimateDoc["options"][0]["lines"][0]>) =>
    toTemplateDoc({ ...estimate, options: [{ ...estimate.options[0]!, lines: [{ ...estimate.options[0]!.lines[1]!, ...x }] }] }, true);
  it("long names and units are cut to what the server takes; a quantity that is not a number is refused, never 0", () => {
    const t = one({ name: "x".repeat(400), unit: "linear feet of gutter" });
    expect(t.options[0]!.lines[0]!.unit.length).toBe(20);
    expect(validTemplateDoc(t)).toBe(true);
    expect(validTemplateDoc(one({ quantity: "abc" }))).toBe(false);
    expect(validTemplateDoc(one({ unitPriceCents: 10.5 }))).toBe(false);
    expect(validTemplateDoc({ ...t, settings: { ...t.settings, deposit: { kind: "pct", bps: 10001 } } })).toBe(false);
    expect(validTemplateDoc({ ...t, settings: { ...t.settings, discount: { kind: "pct", value: "1.5" } } })).toBe(false);
  });
  it("a tax-exempt client's estimate does not make a template without tax", () => {
    const off = { ...estimate, settings: { ...estimate.settings, tax: { ...estimate.settings.tax, enabled: false } } };
    expect(toTemplateDoc(off, true, true).settings.tax.enabled).toBe(false); // the company default (DEFAULT_TAX)
    expect(toTemplateDoc(off, true, true).settings.tax).not.toBe(off.settings.tax);
  });
  it("save keeps our costs apart from the doc, and an estimate from it right away keeps them (no reload)", () => {
    const clean = cleanEstimateTemplate({ id: "t1", name: " Tpl ", doc: toTemplateDoc(estimate, true) })!;
    expect(clean.name).toBe("Tpl");
    expect(clean.doc.options[0]!.lines.every((l) => l.unitCostCents === undefined)).toBe(true);
    const { doc } = fromTemplate(clean.doc, [], clean.costs ?? {}, true);
    expect(doc.options[0]!.lines[1]!.unitCostCents).toBe(333);
    expect(cleanEstimateTemplate({ id: "t1", name: "  ", doc: clean.doc })).toBeNull();
    expect(splitCosts(toTemplateDoc(estimate, true)).costs).toBeTruthy();
  });
  it("the row: costs merged back for the server, module_key only as sent; reading counts uses and the latest", () => {
    const clean = cleanEstimateTemplate({ id: "t1", name: "Tpl", doc: toTemplateDoc(estimate, true), module: "gutters" })!;
    const row = estimateTemplateToDb(clean, "c1") as { doc: EstimateDoc; module_key: string };
    expect(row.doc.options[0]!.lines.filter((l) => l.unitCostCents !== undefined).length).toBe(2);
    expect(row.module_key).toBe("gutters");
    const t = estimateTemplateFromDb({ id: "t1", name: "Tpl", doc: clean.doc, module_key: null, archived_at: null },
      [{ template_id: "t1", line_id: "a", unit_cost_cents: 5 }, { template_id: "t2", line_id: "b", unit_cost_cents: 7 }],
      [{ template_id: "t1", estimate_id: "e1", used_at: "2026-11-08T10:00:00Z" }, { template_id: "t1", estimate_id: "e2", used_at: "2026-11-08T12:00:00Z" }]);
    expect(t).toMatchObject({ costs: { a: 5 }, uses: 2, lastUsedAt: "2026-11-08T12:00:00Z" });
  });
  it("the picker: live only, last used first, then by name", () => {
    const d = estimate;
    const list = pickableTemplates([
      { id: "a", name: "B", doc: d }, { id: "b", name: "A", doc: d }, { id: "c", name: "C", doc: d, lastUsedAt: "2026-11-08" }, { id: "d", name: "D", doc: d, archivedAt: "x" },
    ]);
    expect(list.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("unit:estimateTemplate — #1232: the hidden $0 lines and the sections stay in a template", () => {
  const ch = (code: number) => String.fromCharCode(code);
  const withSections: EstimateDoc = {
    options: [
      {
        id: "o1", name: "Good",
        sections: [
          { id: "s1", title: `  Roof ${ch(0x200b)}work  ` },
          { id: "s1b", title: "Flashing", parentId: "s1" },
          { id: "s2", kind: "labor" },
          { id: "s3", title: "Gutters", kind: "module", module: "gutters" },
          { id: "s1", title: "Twice" },
          { id: "orphan", parentId: "nope" },
        ],
        lines: [
          { id: "l1", name: "Shingles", group: "material", quantity: "10", unit: "sq", unitPriceCents: 12000, sectionId: "s1b" },
          { id: "l2", name: "Hanger kit", group: "material", quantity: "40", unit: "ea", unitPriceCents: 0, clientVisible: false, sectionId: "s3" },
          { id: "l3", name: "Hidden but priced", group: "labor", quantity: "1", unit: "hr", unitPriceCents: 5000, clientVisible: false, sectionId: "s2" },
          { id: "l4", name: "No section", group: "service", quantity: "1", unit: "ea", unitPriceCents: 9900, sectionId: "x".repeat(65) },
        ],
      },
    ],
    settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } }, deposit: { kind: "none" } },
  } as unknown as EstimateDoc;

  it("the template keeps the sections as the client reads them, each line's section and «hidden» only at $0", () => {
    const tpl = toTemplateDoc(withSections, true, false, true);
    const o = tpl.options[0]!;
    expect(o.sections).toEqual([{ id: "s1", title: "Roof work" }, { id: "s1b", title: "Flashing", parentId: "s1" }, { id: "s2", kind: "labor" }, { id: "s3", title: "Gutters", kind: "module" }]);
    expect(o.lines.map((l) => [l.id, l.sectionId, l.clientVisible])).toEqual([["l1", "s1b", undefined], ["l2", "s3", false], ["l3", "s2", undefined], ["l4", undefined, undefined]]);
    expect(validTemplateDoc(tpl)).toBe(true);
  });
  it("an estimate from the template has them all again (fresh ids, the same sections)", () => {
    const tpl = toTemplateDoc(withSections, true);
    const { doc } = fromTemplate(tpl, [], {}, true);
    const o = doc.options[0]!;
    expect(o.sections).toEqual([{ id: "s1", title: "Roof work" }, { id: "s1b", title: "Flashing", parentId: "s1" }, { id: "s2", kind: "labor" }, { id: "s3", title: "Gutters", kind: "module" }]);
    expect(o.lines.map((l) => [l.name, l.sectionId, l.clientVisible])).toEqual([["Shingles", "s1b", undefined], ["Hanger kit", "s3", false], ["Hidden but priced", "s2", undefined], ["No section", undefined, undefined]]);
  });
  it("the check on the phone refuses what the server would: sections not a list, hidden with a price or not a boolean, a long sectionId", () => {
    const tpl = toTemplateDoc(withSections, true);
    const opt = (x: object) => ({ ...tpl, options: [{ ...tpl.options[0]!, ...x }] }) as EstimateDoc;
    const line0 = (x: object) => opt({ lines: [{ ...tpl.options[0]!.lines[0]!, ...x }] });
    expect(validTemplateDoc(opt({ sections: "s1" }))).toBe(false);
    expect(validTemplateDoc(line0({ clientVisible: false }))).toBe(false);
    expect(validTemplateDoc(line0({ clientVisible: "false" }))).toBe(false);
    expect(validTemplateDoc(line0({ clientVisible: 0 }))).toBe(false);
    expect(validTemplateDoc(line0({ sectionId: "x".repeat(65) }))).toBe(false);
    // sections in another form (an older or newer phone's cleaning): the server puts them in the client's form itself
    // (trigger t02, db T203) — never a refusal for that
    expect(validTemplateDoc(opt({ sections: withSections.options[0]!.sections }))).toBe(true);
  });
  it("a $0 line hidden the way another copy writes it («false», 0) stays hidden in the template, as a boolean", () => {
    const d = { ...withSections, options: [{ ...withSections.options[0]!, lines: [
      { id: "a", name: "Kit", group: "material", quantity: "1", unit: "ea", unitPriceCents: 0, clientVisible: "false" },
      { id: "b", name: "Kit 2", group: "material", quantity: "1", unit: "ea", unitPriceCents: 0, clientVisible: 0 },
    ] }] } as unknown as EstimateDoc;
    const tpl = toTemplateDoc(d, true);
    expect(tpl.options[0]!.lines.map((l) => l.clientVisible)).toEqual([false, false]);
    expect(validTemplateDoc(tpl)).toBe(true);
  });
  it("the shared examples (test/fixtures/clientSections.json, the server's T199 and T203 the same): the phone's client form is the server's", async () => {
    const fx = (await import("./fixtures/clientSections.json")).default as { cases: { name: string; sections: unknown; client: unknown }[] };
    for (const c of fx.cases) {
      expect(clientSectionsOf({ sections: c.sections as never }), c.name).toEqual(c.client);
      const tpl = toTemplateDoc({ ...withSections, options: [{ ...withSections.options[0]!, sections: c.sections as never }] }, true);
      expect(tpl.options[0]!.sections ?? [], c.name).toEqual(c.client);
      expect(validTemplateDoc(tpl), c.name).toBe(true);
    }
  });

});
