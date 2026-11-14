/**
 * #1323: the starter estimate templates of the Gutters module («Чистка желобов», «Только guards», «Замена желобов»; docs/specs/07 §12):
 * declared by the module, valid for the registry, added once, named in three languages, every line named in the company's
 * price list by properties and unit — and priced by TEST items (rule 9), never by a number in the code.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {}, NativeModules: {}, AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import type { CatalogItem, EstimateTemplate } from "@/data/types";
import { estimateStartersToAdd, fromTemplate, starterAllUnpriced, starterEstimateId, starterEstimateTemplate, starterItem } from "@/features/estimateTemplate";
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

describe("#1336 — the line means the company's own stock; several candidates are never settled by the alphabet", () => {
  const gutterLine = lines.find((l) => l.s === "replace" && l.key === "gutter")!;
  const gutterItem = (c: CatalogItem[]) => c.find((it) => it.attributes?.part === "gutter" && it.unit === "ft")!;
  /** a second gutter in the price list: another profile, named so that it sorts FIRST */
  const another = (c: CatalogItem[]): CatalogItem => ({ ...gutterItem(c), id: "other-gutter", name: "A — медь K6", attributes: { ...gutterItem(c).attributes, profile: "k", size: "6", material: "copper", color: "natural" } });
  const withOther = (): CatalogItem[] => {
    const c = made();
    return [...c, another(c)];
  };
  it("the module narrows the line by the company's default stock: the item of that stock, not the first by name", () => {
    const c = withOther();
    const want = gutters.starterWant!({}, gutterLine.match!);
    expect(want.profile).toBeDefined();
    expect(starterItem(c, gutterLine.match, gutterLine.unit, want)?.id).toBe(gutterItem(made()).id);
  });
  it("the narrowing follows the company's settings: another default size takes THAT size's item", () => {
    const c = made();
    const a = gutterItem(c);
    const otherSize = a.attributes!.size === "5" ? "6" : "5";
    const second: CatalogItem = { ...a, id: "second-size", name: "Z — другой размер", attributes: { ...a.attributes, size: otherSize } };
    const both = [...c, second];
    // the default size: the made item (it also sorts first); another default size: the second one, though it sorts last
    expect(starterItem(both, gutterLine.match, gutterLine.unit, gutters.starterWant!({}, gutterLine.match!))?.id).toBe(a.id);
    const want = gutters.starterWant!({ v: 1, run: { size: otherSize } }, gutterLine.match!);
    expect(want.size).toBe(otherSize);
    expect(starterItem(both, gutterLine.match, gutterLine.unit, want)?.id).toBe("second-size");
  });
  it("a hand-priced item that CONTRADICTS the company's stock is not taken: only copper in the price list, the default is aluminium → no link, «проверьте цену»", () => {
    const a = gutterItem(made());
    const copper: CatalogItem = { ...a, id: "copper", name: "Медь", attributes: { part: "gutter", material: "copper" } };
    const want = gutters.starterWant!({}, gutterLine.match!);
    expect(want.material).not.toBe("copper");
    expect(starterItem([copper], gutterLine.match, gutterLine.unit, want)).toBeUndefined();
    // the same item without a property that disagrees is a hand-priced version: it serves
    const plain: CatalogItem = { ...a, id: "plain", name: "Желоб", attributes: { part: "gutter", color: want.color! } };
    expect(starterItem([plain], gutterLine.match, gutterLine.unit, want)?.id).toBe("plain");
  });
  it("without any narrowing two equally close items are ambiguous: no link, $0, «проверьте цену» (the first by name is NOT taken)", () => {
    const c = withOther();
    expect(starterItem(c, gutterLine.match, gutterLine.unit)).toBeUndefined();
    const tpl = starterEstimateTemplate("gutters", starters.find((s) => s.key === "replace")!, { ...ctx(c, "en"), want: (m) => m })!;
    const l = tpl.doc.options[0]!.lines.find((x) => x.name.length && x.unit === "ft" && x.group === "material")!;
    expect(l.catalogItemId).toBeUndefined();
    expect(l.unitPriceCents).toBe(0);
    expect(fromTemplate(tpl.doc, c, {}, false, true).checkPrice.length).toBeGreaterThanOrEqual(1); // the gutter line says «проверьте цену»
  });
  it("one item only, priced by hand with fewer properties: it still serves (the narrowed match finds nothing, the wider one is unique)", () => {
    const hand: CatalogItem = { ...gutterItem(made()), id: "hand", name: "Желоб", attributes: { part: "gutter" } };
    const want = gutters.starterWant!({}, gutterLine.match!);
    expect(starterItem([hand], gutterLine.match, gutterLine.unit, want)?.id).toBe("hand");
  });
  it("a labor line (no part) is not narrowed", () => {
    const labor = lines.find((l) => l.match?.work === "cleaning")!;
    expect(gutters.starterWant!({}, labor.match!)).toEqual(labor.match);
  });
  it("the template of the module's starter in the screen's way: the company's stock wins among several", () => {
    const c = withOther();
    const tpl = starterEstimateTemplate("gutters", starters.find((s) => s.key === "replace")!, { ...ctx(c, "en"), want: (m) => gutters.starterWant!({}, m) })!;
    const ids = tpl.doc.options[0]!.lines.map((l) => l.catalogItemId);
    expect(ids).toContain(gutterItem(made()).id);
    expect(ids).not.toContain("other-gutter");
  });
});

describe("#1336 — a starter with no line priced is not added (starterAllUnpriced)", () => {
  const replace = starters.find((x) => x.key === "replace")!;
  const want = (m: Record<string, string>) => gutters.starterWant!({}, m);
  it("an empty price list: «none» (make the price list first)", () => {
    expect(starterAllUnpriced(replace, { catalog: [], want })).toBe("none");
    for (const s of starters) expect(starterAllUnpriced(s, { catalog: [], want })).toBe("none");
  });
  it("with the test items made: nothing blocks (null); one found line is enough (the rest are «проверьте цену»)", () => {
    for (const s of starters) expect(starterAllUnpriced(s, { catalog: made(), want })).toBeNull();
    const onlyLabor = made().filter((it) => it.attributes?.work === "tearoff");
    expect(starterAllUnpriced(replace, { catalog: onlyLabor, want })).toBeNull();
  });
  it("several equally fitting items and no other line found: «several» (a different text: sort the price list out), not «none»", () => {
    const a = made().find((it) => it.attributes?.part === "gutter" && it.unit === "ft")!;
    const twin: CatalogItem = { ...a, id: "twin", name: "A — двойник" };
    const guards = starters.find((x) => x.key === "guards")!;
    const onlyGutters = [a, twin];
    const gutterOnly = { ...replace, options: replace.options.map((o) => ({ ...o, lines: o.lines.filter((l) => l.match?.part === "gutter") })) };
    expect(starterAllUnpriced(gutterOnly, { catalog: onlyGutters })).toBe("several");
    expect(starterAllUnpriced(guards, { catalog: onlyGutters })).toBe("none");
  });
});
