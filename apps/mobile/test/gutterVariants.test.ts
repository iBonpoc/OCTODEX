/**
 * #2227 PR3 (spec 33-gutters-price-key §11.8, tests 12–16): Gutters on the core's «variant of an item». A coloured part is priced by ONE
 * item for every colour, its colour is the line's variant; before the transition (per-colour items) nothing changes; after it and after
 * «Обновить смету» the estimate is the same — lines, names, sums. Sealant and touch-up paint too (#2262, founder №48): their colour is only the specification, their item has no finish.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import type { PartQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, Estimate, Job } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { DEFAULT_TAX } from "@octo/estimating-engine";
import { portalFromEstimate } from "../src/cloud/portal";
import { estimateHtml } from "../src/features/estimatePdf";
import { catalogMatch } from "../src/features/catalogMatch";
import { draftsForJob } from "../src/features/purchaseOrders";
import { tFor } from "../src/i18n/translate";
import { linesFromParts, resyncLines, type LineSource, type ModuleLine } from "../src/modules/gutters/estimate";
import gutters from "../src/modules/gutters/module";
import { colourlessPart, findPriced, matchKey, missingItems, priceFromOtherDegree, stableItemId } from "../src/modules/gutters/prices";

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
  it("audit блок. 3: the client's PDF is the same in the three points — before, after the transition, after «Обновить смету» (own line, a price edited by hand)", () => {
    const db = makeSeed();
    const e = db.estimates.find((x) => x.doc?.options?.length)!;
    const own: ModuleLine = { id: "own1", name: "Haul away", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 };
    const pdf = (lines: readonly ModuleLine[]) =>
      estimateHtml(portalFromEstimate(db, { ...e, doc: { options: [{ id: "o1", name: "Option", lines: lines as never }], settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } } } }, "Co"), { lang: "en" });
    let k = 0;
    const ids = () => `p${++k}`;
    const made = linesFromParts(parts, before, name, ids);
    const draft = [...made.map((l, i) => (i === 1 ? { ...l, unitPriceCents: 950 } : l)), own]; // brown priced by hand
    const cat = transition(before);
    const resynced = resyncLines(draft, linesFromParts(parts, cat, name, ids), () => false, cat);
    expect(resynced.find((l) => l.id === draft[1]!.id)!.unitPriceCents).toBe(950);
    expect(pdf(resynced)).toBe(pdf(draft)); // after «Обновить смету»
    // after the transition alone nothing in the estimate changes (it writes only the catalog): the same PDF by construction
    expect(pdf(draft)).toContain("5in K Gutter White");
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

/** an approved estimate of a job with these lines (the supplier order reads it) */
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
describe("unit:gutterVariants — test 15: the supplier order takes only the colour's code", () => {
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

describe("unit:gutterVariants — test 16 (#2262, founder №48): sealant and touch-up paint — one item for every colour, the colour is the line's variant", () => {
  const paintPart = (color: string): PartQty =>
    ({ key: `paint.${color}`, section: "consumables", qty: "1", unit: "ea", use: "purchase", kind: "material", attrs: { part: "touch_up_paint", color } }) as unknown as PartQty;
  const sealPer = (id: string, color: string, priceCents: number): CatalogItem => ({
    id, kind: "material", name: `Sealant ${color}`, unit: "ea", priceCents, costCents: priceCents, vendorTaxBps: 0, markupBps: 0, placeholder: false,
    supplierSku: `SEAL-${color}`, attributes: { part: "sealant", color },
  });
  /** the transition for a part without a finish: the item without colour has no «painted» */
  const merge = (old: CatalogItem[], attrs: Record<string, string>): CatalogItem[] => [
    { ...old[0]!, id: "one", name: "Sealant", supplierSku: undefined, attributes: attrs,
      variants: { color: Object.fromEntries(old.map((it) => [it.attributes!.color!.toLowerCase(), { sku: it.supplierSku }])) } },
    ...old.map((it) => ({ ...it, attributes: { ...it.attributes!, mergedInto: "one" } })),
  ];
  /** the line's name as the module makes it (an item of the module has the same name) */
  const sname = (p: PartQty) => `${p.attrs.part === "sealant" ? "Sealant" : "Touch-up"}${p.attrs.color ? ` ${p.attrs.color}` : ""}`;
  const plainSeal: CatalogItem = { id: "s0", kind: "material", name: "Sealant", unit: "ea", priceCents: 700, placeholder: false, attributes: { part: "sealant" } };

  it("sealant: white and brown on the company's plain «Sealant» item — one item, two variants, no second item made", () => {
    const ls = linesFromParts([sealantPart("White"), sealantPart("Brown")], [plainSeal], sname, uid);
    expect(ls.map((l) => [l.catalogItemId, ours(l).variant?.value])).toEqual([["s0", "white"], ["s0", "brown"]]);
    expect(ls.map((l) => l.unitPriceCents)).toEqual([700, 700]);
    expect(missingItems(C, [{ key: "sealant.white", part: sealantPart("White") }], [plainSeal], sname)).toEqual([]);
  });
  it("«Создать позиции сразу»: one stable item without colour and without «painted» for every colour", () => {
    const made = missingItems(C, [{ key: "sealant.white", part: sealantPart("White") }, { key: "sealant.brown", part: sealantPart("Brown") }], [], sname);
    expect(made).toHaveLength(1);
    expect(made[0]!.attributes).toMatchObject({ part: "sealant" });
    expect(made[0]!.attributes?.color).toBeUndefined();
    expect(made[0]!.attributes?.finish).toBeUndefined();
    expect(made[0]!.id).toBe(stableItemId(C, matchKey(colourlessPart(sealantPart("Brown")))));
    expect(missingItems(C, [{ key: "sealant.black", part: sealantPart("Black") }], made, sname)).toEqual([]);
  });
  it("touch-up paint takes the item without colour, the colour is the variant", () => {
    const plain: CatalogItem = { id: "tp0", kind: "material", name: "Touch-up", unit: "ea", priceCents: 500, attributes: { part: "touch_up_paint" } };
    expect(findPriced([plain], paintPart("White"))).toEqual({ it: plain, variant: { attr: "color", value: "white" } });
    const made = missingItems(C, [{ key: "paint.White", part: paintPart("White") }, { key: "paint.Brown", part: paintPart("Brown") }], [], sname);
    expect(made).toHaveLength(1);
    expect(made[0]!.attributes?.finish).toBeUndefined();
  });
  it("before the transition nothing moves: an item of that colour wins over the one without colour", () => {
    const white = sealPer("sw", "White", 800);
    expect(findPriced([plainSeal, white], sealantPart("White"))).toEqual({ it: white });
    expect(findPriced([plainSeal, white], sealantPart("Brown"))).toEqual({ it: plainSeal, variant: { attr: "color", value: "brown" } });
  });
  it("an old estimate is the same — lines, names, sums, the client's PDF — before the transition, after it and after «Обновить смету»", () => {
    const db = makeSeed();
    const e = db.estimates.find((x) => x.doc?.options?.length)!;
    const pdf = (lines: readonly ModuleLine[]) =>
      estimateHtml(portalFromEstimate(db, { ...e, doc: { options: [{ id: "o1", name: "Option", lines: lines as never }], settings: { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" } } } }, "Co"), { lang: "en" });
    const before = [sealPer("sw", "White", 800), sealPer("sb", "Brown", 800)];
    const parts = [sealantPart("White"), sealantPart("Brown")];
    let k = 0;
    const ids = () => `q${++k}`;
    const made = linesFromParts(parts, before, sname, ids);
    expect(made.map((l) => [l.catalogItemId, ours(l).variant])).toEqual([["sw", undefined], ["sb", undefined]]);
    const own: ModuleLine = { id: "own1", name: "Haul away", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 };
    const draft = [...made.map((l, i) => (i === 1 ? { ...l, unitPriceCents: 850 } : l)), own]; // brown priced by hand
    const cat = merge(before, { part: "sealant" });
    const after = linesFromParts(parts, cat, sname, ids);
    expect(after.map((l) => [l.catalogItemId, ours(l).variant?.value])).toEqual([["one", "white"], ["one", "brown"]]);
    expect(after.map((l) => l.name)).toEqual(made.map((l) => l.name));
    expect(total(after)).toBe(total(made));
    const r = resyncLines(draft, after, () => false, cat);
    expect(r.filter((l) => l.group === "material")).toHaveLength(2);
    expect(r.map((l) => l.name)).toEqual(draft.map((l) => l.name));
    expect(r.find((l) => l.id === draft[1]!.id)!.unitPriceCents).toBe(850);
    expect(total(r)).toBe(total(draft));
    expect(pdf(r)).toBe(pdf(draft));
  });
  it("the supplier order: each colour with its colour's code; a colour without one — «Color code not set», never the item's code", () => {
    const one = { ...merge([sealPer("sw", "White", 800)], { part: "sealant" })[0]!, supplierId: "s1", supplierSku: "SEAL-ANY" };
    const ls = linesFromParts([sealantPart("White"), sealantPart("Brown")], [one], sname, uid);
    const order = draftsForJob(company(ls, [one]), "jV", [], false, words).flatMap((g) => g.lines);
    expect(order.find((l) => l.name.endsWith("white"))).toMatchObject({ supplierSku: "SEAL-White" });
    const brown = order.find((l) => l.name.endsWith("brown"))!;
    expect(brown.supplierSku).toBeUndefined();
    expect(brown.note).toBe(en("po.variantSkuNotSet", { what: "Color" }));
  });
});

describe("unit:gutterVariants — review #2249", () => {
  const elbow = (style: string, color = "White"): PartQty =>
    ({ key: `elbow.${style}`, section: "downspout", qty: "4", unit: "ea", use: "estimate", kind: "material", attrs: { part: "elbow", shape: "round", size: "3", material: "aluminum", style, color } }) as unknown as PartQty;
  const item = (id: string, attrs: Record<string, string>, o: Partial<CatalogItem> = {}): CatalogItem =>
    ({ id, kind: "material", name: id, unit: "ea", priceCents: 500, placeholder: false, attributes: attrs, ...o });
  it("№1: a placeholder of the same colour (an old build made it) gives way to the priced item for every colour", () => {
    const one = { ...transition([perColour("w", "White", 900)])[0]!, id: "one", placeholder: false };
    const stub = { ...perColour("stubB", "Brown", 300), placeholder: true };
    expect(findPriced([one, stub], gutterPart("Brown"))).toEqual({ it: one, variant: { attr: "color", value: "brown" } });
    // a priced item of that colour still wins (before the transition nothing moves)
    const real = perColour("realB", "Brown", 950);
    expect(findPriced([one, real], gutterPart("Brown"))).toEqual({ it: real });
  });
  it("№3: a round elbow of the default degree (75°) takes the exact item without colour before the white 45° through the fallback", () => {
    const one75 = item("one75", { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "75", finish: "painted" });
    const white45 = item("w45", { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "45", color: "White" });
    expect(findPriced([white45, one75], elbow("75"))).toEqual({ it: one75, variant: { attr: "color", value: "white" } });
    expect(priceFromOtherDegree([white45, one75], elbow("75"))).toBe(false);
    // only the 45° one without colour: it still prices the 75° (the old fallback), and says «проверьте цену»
    const one45 = { ...one75, id: "one45", attributes: { ...one75.attributes!, style: "45" } };
    expect(findPriced([one45], elbow("75")).it?.id).toBe("one45");
    expect(priceFromOtherDegree([one45], elbow("75"))).toBe(true);
  });
  it("№3: a copper screw takes the item without metal and colour through the old fallback", () => {
    const screw: PartQty = { key: "screw", section: "fastener", qty: "10", unit: "ea", use: "estimate", kind: "material", attrs: { part: "screw", metal: "copper", color: "White" } } as unknown as PartQty;
    const plain = item("scr", { part: "screw", finish: "painted" });
    expect(findPriced([plain], screw).it?.id).toBe("scr");
  });
  it("№3: a coloured part without a finish takes only a «painted» item — never a mill or a company's plain item", () => {
    const base = { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027" };
    const mill = { ...perColour("mill", "x", 500), attributes: { ...base, finish: "mill" } };
    const plain = { ...perColour("plain", "x", 500), attributes: { ...base } };
    expect(findPriced([mill], gutterPart("White")).it).toBeUndefined();
    expect(findPriced([plain], gutterPart("White")).it).toBeUndefined();
    expect(missingItems(C, [{ key: "g", part: gutterPart("White") }], [mill, plain], name)).toHaveLength(1);
  });
  it("№2: the name of a line made on an old per-colour item stays at the 4th update too, and the line is not «changed by hand»", () => {
    const before = [{ ...perColour("w", "White", 900), name: "Seamless 5in gutter — white (shop)" }];
    const parts = [gutterPart("White", "120")];
    let ls = linesFromParts(parts, before, name, uid);
    expect(ls[0]!.name).toBe("Seamless 5in gutter — white (shop)"); // the item's own name, not name(part)
    const cat = transition(before);
    for (let i = 0; i < 4; i++) ls = resyncLines(ls, linesFromParts(parts, cat, name, uid), () => false, cat);
    expect(ls.map((l) => [l.name, l.catalogItemId, ours(l).name])).toEqual([["Seamless 5in gutter — white (shop)", "one", "Seamless 5in gutter — white (shop)"]]);
    // the part leaves the measurement: the line goes (it is not kept as «gone» — nothing was changed by hand)
    expect(resyncLines(ls, [], () => false, cat)).toEqual([]);
  });
  it("№4: a person's line on the old white holds back the white module line even when the new item has no variants written", () => {
    const [one, ...old] = transition([perColour("w", "White", 900)]);
    const bare = { ...one!, variants: undefined };
    const cat = [bare, ...old];
    const mine: ModuleLine = { id: "mine", name: "My white", group: "material", quantity: "10", unit: "ft", unitPriceCents: 900, catalogItemId: "w" };
    const r = resyncLines([mine], linesFromParts([gutterPart("White"), gutterPart("Brown")], cat, name, uid), () => false, cat);
    expect(r.map((l) => [l.catalogItemId, (l.source as LineSource | undefined)?.variant?.value])).toEqual([["w", undefined], ["one", "brown"]]);
  });
});
