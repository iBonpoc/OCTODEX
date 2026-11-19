/**
 * #2227 PR3 (spec 33-gutters-price-key §11.8, tests 12–16): Gutters on the core's «variant of an item». A coloured part is priced by ONE
 * item for every colour, its colour is the line's variant; before the transition (per-colour items) nothing changes; after it and after
 * «Обновить смету» the estimate is the same — lines, names, sums. Sealant and touch-up paint keep a colour of their own (COLOUR_IS_PRODUCT).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import type { PartQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, Job } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { catalogMatch } from "../src/features/catalogMatch";
import { draftsForJob } from "../src/features/purchaseOrders";
import { tFor } from "../src/i18n/translate";
import { linesFromParts, resyncLines, type LineSource, type ModuleLine } from "../src/modules/gutters/estimate";
import gutters from "../src/modules/gutters/module";
import { colourlessPart, findPriced, matchKey, missingItems, stableItemId } from "../src/modules/gutters/prices";

const C = "11111111-1111-4111-8111-111111111111";
const gutterPart = (color: string, qty = "100"): PartQty =>
  ({ key: `gutter.${color}`, section: "gutter", qty, unit: "ft", use: "estimate", kind: "material", attrs: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", color } }) as unknown as PartQty;
const sealantPart = (color: string): PartQty =>
  ({ key: `sealant.${color}`, section: "seal", qty: "2", unit: "ea", use: "estimate", kind: "material", attrs: { part: "sealant", color } }) as unknown as PartQty;
const name = (p: PartQty) => `5in K Gutter${p.attrs.color ? ` ${p.attrs.color}` : ""}`;
let n = 0;
const uid = () => `l${++n}`;
const total = (ls: readonly ModuleLine[]) => ls.reduce((s, l) => s + Math.round(Number(String(l.quantity)) * l.unitPriceCents), 0);
const ours = (l: ModuleLine) => l.source as LineSource;

/** a per-colour item of the old shape (before #2227): its own colour, its own price */
const perColour = (id: string, color: string, priceCents: number): CatalogItem => ({
  id, kind: "material", name: `5in K Gutter ${color}`, unit: "ft", priceCents, costCents: priceCents, vendorTaxBps: 0, markupBps: 0, placeholder: false,
  supplierSku: `SKU-${color}`, attributes: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", color },
});
/** the transition as PR3b writes it: one item without colour, each old item merged into it with its code as the variant's */
function transition(old: CatalogItem[]): CatalogItem[] {
  const [first] = old;
  const one: CatalogItem = {
    ...first!, id: "one", name: "5in K Gutter", supplierSku: undefined,
    attributes: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", finish: "painted" },
    variants: { color: Object.fromEntries(old.map((it) => [it.attributes!.color!.toLowerCase(), { sku: it.supplierSku }])) },
  };
  return [one, ...old.map((it) => ({ ...it, attributes: { ...it.attributes!, mergedInto: "one" } }))];
}

describe("unit:gutterVariants — test 12: the estimate is the same before the transition, after it and after «Обновить смету»", () => {
  const before = [perColour("w", "White", 900), perColour("b", "Brown", 900)];
  const parts = [gutterPart("White", "120"), gutterPart("Brown", "40")];
  it("before: each colour takes its own item, no variant (as before #2227)", () => {
    const ls = linesFromParts(parts, before, name, uid);
    expect(ls.map((l) => [l.catalogItemId, ours(l).variant])).toEqual([["w", undefined], ["b", undefined]]);
  });
  it("after: one item, the colour is the line's variant; names and sums the same", () => {
    const old = linesFromParts(parts, before, name, uid);
    const after = linesFromParts(parts, transition(before), name, uid);
    expect(after.map((l) => [l.catalogItemId, ours(l).variant])).toEqual([["one", { attr: "color", value: "white" }], ["one", { attr: "color", value: "brown" }]]);
    expect(after.map((l) => l.name)).toEqual(old.map((l) => l.name));
    expect(total(after)).toBe(total(old));
  });
  it("«Обновить смету» of a draft made before: one line per colour (none doubled), names and quantities kept, the same sum", () => {
    const old = linesFromParts(parts, before, name, uid);
    const cat = transition(before);
    const r = resyncLines(old, linesFromParts(parts, cat, name, uid), () => false, cat);
    expect(r.filter((l) => l.group === "material")).toHaveLength(2);
    expect(r.map((l) => l.name)).toEqual(old.map((l) => l.name));
    expect(r.map((l) => String(l.quantity))).toEqual(["120", "40"]);
    expect(total(r)).toBe(total(old));
  });
  it("a person's own line on the old white item holds back only the white module line, never the brown", () => {
    const cat = transition(before);
    const mine: ModuleLine = { id: "mine", name: "My white gutter", group: "material", quantity: "10", unit: "ft", unitPriceCents: 900, catalogItemId: "w" };
    const r = resyncLines([mine], linesFromParts(parts, cat, name, uid), () => false, cat);
    expect(r.map((l) => [l.catalogItemId, (l.source as LineSource | undefined)?.variant?.value])).toEqual([["w", undefined], ["one", "brown"]]);
  });
});

describe("unit:gutterVariants — test 13: the old matching stays for everything else", () => {
  it("a merged item is never found again; a colourless item of another trade (no colour asked) is found as before", () => {
    const cat = transition([perColour("w", "White", 900)]);
    expect(catalogMatch(cat, { part: "gutter", color: "White" })).toEqual([]);
    expect(catalogMatch(cat, { part: "gutter" }).map((x) => x.id)).toEqual(["one"]);
  });
  it("a mill (unpainted) item is never a colour's: a coloured part without a finish does not take it", () => {
    const mill: CatalogItem = { ...perColour("m", "x", 500), attributes: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", finish: "mill" } };
    expect(findPriced([mill], gutterPart("White")).it).toBeUndefined();
  });
  it("a part with no colour at all takes its item by the old match, no variant", () => {
    const plain = { ...gutterPart("White"), attrs: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027" } } as unknown as PartQty;
    const one = transition([perColour("w", "White", 900)])[0]!;
    expect(findPriced([one], plain)).toEqual({ it: one });
  });
});

describe("unit:gutterVariants — test 14: «Создать позиции сразу» makes one stable item for every colour", () => {
  it("white and brown, today and in another build: the same id, the key of the part without its colour", () => {
    const a = missingItems(C, [{ key: "gutter.white", part: gutterPart("White") }], [], name);
    const b = missingItems(C, [{ key: "gutter.brown", part: gutterPart("Brown") }, { key: "gutter.white", part: gutterPart("White") }], [], name);
    expect(a).toHaveLength(1);
    expect(b.map((x) => x.id)).toEqual([a[0]!.id]);
    expect(a[0]!.id).toBe(stableItemId(C, matchKey(colourlessPart(gutterPart("White")))));
    expect(a[0]!.name).toBe("5in K Gutter");
  });
  it("made once, never again: the next «Создать» with that item in the list makes nothing", () => {
    const a = missingItems(C, [{ key: "gutter.white", part: gutterPart("White") }], [], name);
    expect(missingItems(C, [{ key: "gutter.brown", part: gutterPart("Brown") }], a, name)).toEqual([]);
  });
});

describe("unit:gutterVariants — test 15: the supplier order takes only the colour's code", () => {
  function company(lines: ModuleLine[], catalog: CatalogItem[]): DB {
    const db = makeSeed();
    const est = {
      ...(db.estimates[0] as Estimate), id: "eV", status: "approved",
      doc: { settings: { tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" } } as never, options: [{ id: "o", name: "O", lines }] },
      approval: { optionId: "o", addonIds: [], signerName: "C", signature: "", at: "", channel: "on_site", totalCents: 0, depositCents: 0 },
    } as unknown as Estimate;
    const job: Job = { ...(db.jobs[0] as Job), id: "jV", estimateId: "eV" };
    return { ...db, catalog, estimates: [est, ...db.estimates], jobs: [job, ...db.jobs], purchaseOrders: [] };
  }
  const en = tFor("en");
  const words = {
    variantNotSet: (a: string) => en("po.variantNotSet", { what: a }),
    variantSkuNotSet: (a: string) => en("po.variantSkuNotSet", { what: a }),
    attrWord: (a: string) => gutters.variantWord?.(a, en) ?? a,
  };
  it("white has its code; brown has none — «Color code not set» in the order's words, never white's or the item's code", () => {
    const cat = transition([perColour("w", "White", 900)]);
    const one = { ...cat[0]!, supplierId: "s1", supplierSku: "ITEM-ANY" };
    const ls = linesFromParts([gutterPart("White"), gutterPart("Brown")], [one], name, uid);
    const order = draftsForJob(company(ls, [one]), "jV", [], false, words).flatMap((g) => g.lines);
    expect(order.find((l) => l.name.endsWith("white"))).toMatchObject({ supplierSku: "SKU-White" });
    const brown = order.find((l) => l.name.endsWith("brown"))!;
    expect(brown.supplierSku).toBeUndefined();
    expect(brown.note).toBe(en("po.variantSkuNotSet", { what: "Color" }));
  });
  it("the module names only its own property", () => {
    expect(gutters.variantWord?.("color", en)).toBe("Color");
    expect(gutters.variantWord?.("size", en)).toBeUndefined();
  });
});

describe("unit:gutterVariants — test 16: a colour that is the product itself keeps its own item (COLOUR_IS_PRODUCT)", () => {
  it("sealant: white and brown — two items with their colour, no variant on the line", () => {
    const made = missingItems(C, [{ key: "sealant.white", part: sealantPart("White") }, { key: "sealant.brown", part: sealantPart("Brown") }], [], name);
    expect(made.map((x) => x.attributes?.color).sort()).toEqual(["Brown", "White"]);
    const ls = linesFromParts([sealantPart("White")], made, name, uid);
    expect(ours(ls[0]!).variant).toBeUndefined();
    expect(ls[0]!.catalogItemId).toBe(made.find((x) => x.attributes?.color === "White")!.id);
  });
  it("touch-up paint never borrows a colourless item with a variant", () => {
    const tp = (c?: string): PartQty => ({ key: "tp", section: "seal", qty: "1", unit: "ea", use: "estimate", kind: "material", attrs: { part: "touch_up_paint", ...(c ? { color: c } : {}) } }) as unknown as PartQty;
    const plain: CatalogItem = { id: "tp0", kind: "material", name: "Touch-up", unit: "ea", priceCents: 500, attributes: { part: "touch_up_paint" } };
    expect(findPriced([plain], tp("White")).variant).toBeUndefined();
  });
});
