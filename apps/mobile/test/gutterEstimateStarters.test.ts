/**
 * #1323: the starter estimate templates of the Gutters module («Чистка гаттеров», «Только guards», «Замена гаттеров»; docs/specs/07 §12):
 * declared by the module, valid for the registry, added once, named in three languages, every line named in the company's
 * price list by properties and unit — and priced by TEST items (rule 9), never by a number in the code.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {}, NativeModules: {}, AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import type { CatalogItem, EstimateTemplate } from "@/data/types";
import { estimateStartersToAdd, fromTemplate, starterEstimateId, starterEstimateTemplate, starterItem } from "@/features/estimateTemplate";
import { tFor } from "@/i18n/translate";
import { registerModule } from "@/modules/registry";
import gutters from "../src/modules/gutters/module";
import { laborRows, materialRows, missingItems, partName } from "../src/modules/gutters/prices";

const starters = gutters.estimateTemplates ?? [];
const lines = starters.flatMap((s) => s.options.flatMap((o) => o.lines.map((l) => ({ s: s.key, ...l }))));
const companyId = "11111111-2222-4333-8444-555555555555";
/** the company's price list after «Создать позиции сразу»: test items only (placeholder) */
const made = (): CatalogItem[] => missingItems(companyId, [...materialRows({}), ...laborRows()], [], (p) => partName((k) => String(k), p));
const ctx = (catalog: CatalogItem[], lang: "ru" | "en" | "es") => ({ id: "t", catalog, tApp: tFor("ru"), tDoc: tFor(lang), depositBps: 1000, costsVisible: true });

describe("the Gutters module declares three starter estimates", () => {
  it("«Чистка», «Только guards», «Замена» — and the registry accepts them", () => {
    expect(starters.map((s) => s.key)).toEqual(["clean", "guards", "replace"]);
    expect(() => registerModule({ ...gutters, key: "gutters_probe" })).not.toThrow();
  });
  it("each is named in ru, en and es, and the names differ between the languages", () => {
    for (const s of starters) {
      const names = (["ru", "en", "es"] as const).map((l) => tFor(l)(s.nameKey));
      expect(names.every((n) => n && !n.startsWith("mod.gutters."))).toBe(true);
      expect(new Set(names).size).toBeGreaterThanOrEqual(2);
      for (const o of s.options) for (const l of o.lines) expect((["ru", "en", "es"] as const).every((lang) => !!tFor(lang)(l.nameKey) && !tFor(lang)(l.nameKey).startsWith("mod.gutters."))).toBe(true);
    }
  });
  it("offered once: a company that has them gets none again (an archived one counts as added); another company gets all three", () => {
    const mods = [{ key: "gutters", estimateTemplates: starters }];
    expect(estimateStartersToAdd(mods, [], companyId).map((x) => x.starter.key)).toEqual(["clean", "guards", "replace"]);
    const have: EstimateTemplate[] = starters.map((s) => ({ id: starterEstimateId(companyId, "gutters", s.key), name: s.key, doc: { options: [], settings: {} as never } }));
    expect(estimateStartersToAdd(mods, have, companyId)).toEqual([]);
    expect(estimateStartersToAdd(mods, have.slice(0, 2), companyId).map((x) => x.starter.key)).toEqual(["replace"]);
    expect(estimateStartersToAdd(mods, have, "another-company")).toHaveLength(3);
  });
});

describe("the lines are the company's price-list items, priced by test items", () => {
  it("with the test items made: every line finds its item (by properties and unit), marked as a test price (placeholder)", () => {
    const catalog = made();
    for (const l of lines) {
      const it = starterItem(catalog, l.match, l.unit);
      expect(it, `${l.s}/${l.key}`).toBeDefined();
      expect(it!.placeholder).toBe(true);
    }
  });
  it("the template takes today's price of the item: change the item's price, the next template line has it (the line's price is the catalog's, not the code's)", () => {
    const catalog = made();
    const clean = starters.find((s) => s.key === "clean")!;
    const base = starterEstimateTemplate("gutters", clean, ctx(catalog, "en"))!;
    const itemId = base.doc.options[0]!.lines[0]!.catalogItemId!;
    const repriced = catalog.map((it) => (it.id === itemId ? { ...it, priceCents: 123456 } : it));
    const next = starterEstimateTemplate("gutters", clean, ctx(repriced, "en"))!;
    expect(next.doc.options[0]!.lines[0]!.unitPriceCents).toBe(123456);
    expect(fromTemplate(next.doc, repriced, {}, false, true).doc.options[0]!.lines[0]).toMatchObject({ unitPriceCents: 123456 });
  });
  it("an empty price list: the lines are there at $0 and say «проверьте цену»; the names follow the company's document language", () => {
    for (const s of starters) {
      const tpl = starterEstimateTemplate("gutters", s, ctx([], "es"))!;
      expect(tpl.doc.options[0]!.lines.every((l) => l.unitPriceCents === 0)).toBe(true);
      expect(fromTemplate(tpl.doc, [], {}, false, true).checkPrice.length).toBe(tpl.doc.options[0]!.lines.length);
    }
    const en = starterEstimateTemplate("gutters", starters[0]!, ctx([], "en"))!;
    const es = starterEstimateTemplate("gutters", starters[0]!, ctx([], "es"))!;
    expect(en.doc.options[0]!.lines[0]!.name).not.toBe(es.doc.options[0]!.lines[0]!.name);
  });
  it("a starter never touches a measurement's lines (no source link on any line)", () => {
    for (const s of starters) {
      const tpl = starterEstimateTemplate("gutters", s, ctx(made(), "en"))!;
      for (const o of tpl.doc.options) for (const l of o.lines) expect((l as unknown as Record<string, unknown>).source).toBeUndefined();
    }
  });
});
