/**
 * #2000 (spec 33-gutters-price-key §10): a coloured part without an item of its own colour takes its group's price — the line, the $
 * under the drawing and the item «Создать позиции сразу» makes; the catalog is never written from an estimate. Scenario numbers — §10.5.
 */
import { describe, expect, it } from "vitest";
import type { PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { groupSource, listPreview, measuredColourRows, missingItems, newColourRows } from "../src/modules/gutters/prices";
import { priceGroupKey } from "../src/modules/gutters/prices/groups";
import { linesFromParts, resyncLines, type ModuleLine } from "../src/modules/gutters/estimate";
import { toElements } from "../src/modules/gutters/canvas/model";
import type { GutterData } from "../src/modules/gutters/data";
import type { Drawing } from "../src/modules/gutters/geometry";

const ATTRS = { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027" };
const item = (id: string, color: string | undefined, o: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  kind: "material",
  name: `5″ K-Style Gutter ${color ?? ""}`.trim(),
  unit: "ft",
  priceCents: 1000,
  placeholder: false,
  costCents: 500,
  vendorTaxBps: 0,
  // a material's price is cost × tax × markup (catalogUnitPrice): $5 × 2 = $10
  markupBps: 10000,
  ...o,
  ...(o.priceCents !== undefined && o.costCents === undefined ? { costCents: o.priceCents / 2 } : {}),
  attributes: { ...ATTRS, ...(color ? { color } : {}), ...(o.attributes ?? {}) },
});
/** an item already in the group the database keeps (after the transition) */
const grouped = (id: string, color: string, o: Partial<CatalogItem> = {}) => {
  const x = item(id, color, o);
  return { ...x, attributes: { ...x.attributes!, priceGroup: priceGroupKey(x) } };
};
const part = (color: string, o: Partial<PartQty> = {}): PartQty =>
  ({ key: "gutter", section: "gutter", qty: "100", unit: "ft", use: "estimate", kind: "material", attrs: { profile: "k", size: "5", material: "aluminum", gauge: ".027", color }, ...o }) as unknown as PartQty;
const name = (p: PartQty) => `Gutter · ${p.attrs.color}`;
let n = 0;
const uid = () => `l${++n}`;
const one = (parts: PartQty[], catalog: CatalogItem[]) => linesFromParts(parts, catalog, name, uid)[0]!;

const WB = [grouped("w", "white"), grouped("b", "brown")];

describe("цена группы для цвета без позиции (#2000, §10)", () => {
  it("С1: чёрный при белом и коричневом по $10 — строка $10 без catalogItemId, source.groupPrice, без «нет цены», имя с цветом", () => {
    const l = one([part("black")], WB);
    expect(l.unitPriceCents).toBe(1000);
    expect(l.catalogItemId).toBeUndefined();
    expect(l.source?.groupPrice).toMatch(/^[wb]$/);
    expect(l.source?.noPrice).toBeUndefined();
    expect(l.name).toBe("Gutter · black");
    // its own colour stays its own item
    expect(one([part("white")], WB).catalogItemId).toBe("w");
    expect(one([part("white")], WB).source?.groupPrice).toBeUndefined();
  });

  it("С2: сумма под чертежом считает чёрный по цене группы, как строка сметы", () => {
    const p = listPreview([part("black")], WB);
    const own = listPreview([part("white")], WB);
    expect(p.totalCents).toBeGreaterThan(0);
    expect(p.totalCents).toBe(own.totalCents);
    expect(p.unpriced).toBe(own.unpriced);
    expect(p.test).toBe(false);
  });

  it("С3: себестоимость источника ($5) — у строки, маржа посчитана", () => {
    expect(one([part("black")], WB).unitCostCents).toBe(500);
  });

  it("С4: до перехода (без priceGroup) White $8 вчера, Brown $9 сегодня — чёрный $9; белый и коричневый как до правки", () => {
    const cat = [
      item("w", "white", { priceCents: 800, updatedAt: "2026-11-17T10:00:00Z" }),
      item("b", "brown", { priceCents: 900, updatedAt: "2026-11-18T10:00:00Z" }),
    ];
    expect(one([part("black")], cat).unitPriceCents).toBe(900);
    expect(one([part("black")], cat).source?.groupPrice).toBe("b");
    expect(one([part("white")], cat).unitPriceCents).toBe(800);
    expect(one([part("brown")], cat).unitPriceCents).toBe(900);
    // the same moment — the lower id
    const tie = [item("z", "white", { priceCents: 700 }), item("a", "brown", { priceCents: 750 })];
    expect(groupSource(tie, part("black"))?.id).toBe("a");
  });

  it("С4а: группа базы впереди позиции, выпавшей из группы (старый телефон сохранил без priceGroup), даже если та изменена позже", () => {
    const cat = [grouped("w", "white", { priceCents: 1000 }), item("old", "brown", { priceCents: 1200, updatedAt: "2026-11-19T00:00:00Z" }) /* changed after the group's item: a fixed date, the clock is not read */];
    expect(groupSource(cat, part("black"))?.id).toBe("w");
  });

  it("С4б (ревью №1): позиция с лишним свойством новее точной — цена точной; ближайшие двух разных деталей (толщина) — «нет цены», не угадываем", () => {
    const cat = [
      item("w", "white", { priceCents: 1000, updatedAt: "2026-11-01T00:00:00Z" }),
      item("w2", "white", { priceCents: 1500, updatedAt: "2026-11-10T00:00:00Z", attributes: { coating: "premium" } }),
    ];
    expect(groupSource(cat, part("black"))?.id).toBe("w");
    expect(one([part("black")], cat).unitPriceCents).toBe(1000);
    const noGauge = part("black", { attrs: { profile: "k", size: "5", material: "aluminum", color: "black" } } as Partial<PartQty>);
    const gauges = [item("a", "white", { priceCents: 1000, updatedAt: "2026-11-01T00:00:00Z" }), item("b", "brown", { priceCents: 1400, updatedAt: "2026-11-10T00:00:00Z", attributes: { gauge: ".032" } })];
    expect(groupSource(gauges, noGauge)).toBeUndefined();
    expect(one([noGauge], gauges).source?.noPrice).toBe(true);
  });

  it("С4в (ревью №2, №3): настоящая цена раньше тестовой; регистр и пробелы в свойствах — как у своей позиции", () => {
    const cat = [item("w", "white", { priceCents: 1000, updatedAt: "2026-11-01T00:00:00Z" }), item("b", "brown", { priceCents: 500, placeholder: true, updatedAt: "2026-11-10T00:00:00Z" })];
    expect(groupSource(cat, part("black"))?.id).toBe("w");
    expect(one([part("black")], cat).source?.testPrice).toBeUndefined();
    const caps = [item("c", "White", { attributes: { material: "Aluminum " } })];
    expect(groupSource(caps, part("black"))?.id).toBe("c");
  });

  it("С10б (ревью #2086, К1): группа базы раньше «настоящей цены» вне группы — цена строки до «Создать» та же, что после «Обновить смету»", () => {
    // G after the transition still has the sample price; beside it an item with the same properties, no priceGroup, a real $12
    const cat = [grouped("g", "white", { priceCents: 1000, placeholder: true }), item("x", "brown", { priceCents: 1200, updatedAt: "2026-11-18T10:00:00Z" })];
    expect(groupSource(cat, part("black"))?.id).toBe("g");
    const before = one([part("black")], cat);
    const made = missingItems("c1", [{ key: "k", part: part("black") }], cat, name);
    expect(made[0]!.attributes?.priceGroup).toBe(cat[0]!.attributes!.priceGroup);
    const after = one([part("black")], [...cat, ...made]);
    expect(after.catalogItemId).toBe(made[0]!.id);
    expect(after.unitPriceCents).toBe(before.unitPriceCents);
  });

  it("§10.5а (ревью #2086): строка цвета, что уже есть среди строк деталей, показывается один раз — ключи разные, N баннера = числу строк", () => {
    const r = (c: string) => ({ key: `gutter|${c}`, part: part(c) });
    const parts = [r("white"), r("black")];
    const cols = newColourRows(parts, [r("black"), r("brown"), r("brown")]);
    expect(cols.map((x) => x.key)).toEqual(["gutter|brown"]);
    const shown = [...parts, ...cols].map((x) => x.key);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("С1а: тестовый источник — testPrice; тестовый за $0 — «нет цены» (§10.2 п.1)", () => {
    const sample = [grouped("w", "white", { priceCents: 1000, placeholder: true })];
    expect(one([part("black")], sample).source?.testPrice).toBe(true);
    const zero = [grouped("w", "white", { priceCents: 0, costCents: 0, placeholder: true })];
    expect(one([part("black")], zero).source?.noPrice).toBe(true);
  });

  it("С9б (ревью №2): источник другого ключа (старое колено «A» для 45°) — созданная позиция в ГРУППЕ ИСТОЧНИКА, не в своей отдельной", () => {
    const elA = (id: string, color: string) =>
      ({ ...item(id, color), unit: "ea", attributes: { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "A", color } }) as CatalogItem;
    const p45 = { key: "elbow", section: "downspouts", qty: "2", unit: "ea", use: "estimate", kind: "material", attrs: { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "45", color: "black" } } as unknown as PartQty;
    const inGroup = { ...elA("aw", "white"), attributes: { ...elA("aw", "white").attributes!, priceGroup: priceGroupKey(elA("aw", "white")) } };
    const made = missingItems("c1", [{ key: "k", part: p45 }], [inGroup], name)[0]!;
    expect(priceGroupKey({ unit: "ea", attributes: made.attributes! })).not.toBe(inGroup.attributes.priceGroup); // the part's own key differs
    expect(made.attributes?.priceGroup).toBe(inGroup.attributes.priceGroup);
    expect(made.priceCents).toBe(1000);
    // before the transition (no priceGroup): the source's own key — the transition gathers them
    expect(missingItems("c1", [{ key: "k", part: p45 }], [elA("aw", "white")], name)[0]!.attributes?.priceGroup).toBe(priceGroupKey(elA("aw", "white")));
  });

  it("С5: у детали нет ни одной позиции — «нет цены», как сейчас", () => {
    const l = one([part("black")], []);
    expect(l.unitPriceCents).toBe(0);
    expect(l.source?.noPrice).toBe(true);
    expect(l.source?.groupPrice).toBeUndefined();
    // another part (6″) is another group
    expect(one([part("black", { attrs: { profile: "k", size: "6", material: "aluminum", gauge: ".027", color: "black" } } as Partial<PartQty>)], WB).source?.noPrice).toBe(true);
  });

  it("С6: позиция без цвета (бетонный блок, extension без цвета) — не источник", () => {
    const plain = item("plain", undefined);
    expect(groupSource([plain], part("black"))).toBeUndefined();
    expect(one([part("black")], [plain]).source?.noPrice).toBe(true);
    // mill is another group than painted
    expect(groupSource([item("m", "white", { attributes: { finish: "mill" } })], part("black"))).toBeUndefined();
  });

  it("С7: круглое колено 45° Black без позиции, группа «A» белая — цена группы «A» (LEGACY_ROUND_ELBOW)", () => {
    const el = (id: string, color: string) =>
      ({ ...item(id, color), unit: "ea", name: `3″ Round Elbow A ${color}`, attributes: { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "A", color } }) as CatalogItem;
    const p = { key: "elbow", section: "downspouts", qty: "2", unit: "ea", use: "estimate", kind: "material", attrs: { part: "elbow", shape: "round", size: "3", material: "aluminum", style: "45", color: "black" } } as unknown as PartQty;
    expect(groupSource([el("aw", "white")], p)?.id).toBe("aw");
    expect(one([p], [el("aw", "white")]).unitPriceCents).toBe(1000);
  });

  it("С8: смета каталог не меняет — ни строка, ни сумма под чертежом (и у монтажника: функции чистые)", () => {
    const cat = WB.map((x) => ({ ...x }));
    const snap = JSON.stringify(cat);
    linesFromParts([part("black")], cat, name, uid);
    listPreview([part("black")], cat);
    expect(JSON.stringify(cat)).toBe(snap);
  });

  it("С9: экран цен — чёрный из замера компании входит в «Создать позиции сразу», позиция в группе и по цене группы", () => {
    const d: Drawing = { runs: [{ id: "r1", a: [0, 0], b: [240, 0], attrs: { profile: "k", size: "5", material: "aluminum", gauge: ".027", color: "black", story: 1, mount: "fascia", hanger: "hidden" } }], downspouts: [] };
    const g: GutterData = { measurements: [{ id: "m1", label: null, status: "draft", propertyId: null, leadId: null }], elements: toElements(d, "m1") };
    // the company's items: the black gutter's group exists (white, brown) with the same properties as the drawing's
    const rows = measuredColourRows(g, undefined, WB);
    const blk = rows.find((r) => r.part.attrs.color === "black" && r.part.key.startsWith("gutter"));
    expect(blk).toBeTruthy();
    const made = missingItems("c1", [blk!], WB, name);
    expect(made).toHaveLength(1);
    expect(made[0]!.attributes?.color).toBe("black");
    expect(made[0]!.attributes?.priceGroup).toBe(WB[0]!.attributes!.priceGroup);
    expect(made[0]!.priceCents).toBe(1000);
    expect(made[0]!.placeholder).toBe(false);
    // a part without any group, or a colour with its own item, is not offered
    expect(measuredColourRows(g, undefined, []).length).toBe(0);
    expect(measuredColourRows(g, undefined, [...WB, grouped("own", "black")]).some((r) => r.part.key.startsWith("gutter") && r.part.attrs.color === "black" && r.part.unit === "ft" && r.part.attrs.size === "5" && r.part.section === "gutter")).toBe(false);
  });

  it("С9а: до перехода созданная позиция берёт ту же цену, что строка сметы (последнюю изменённую), а не тестовую", () => {
    const cat = [item("w", "white", { priceCents: 800, updatedAt: "2026-11-17T10:00:00Z" }), item("b", "brown", { priceCents: 900, updatedAt: "2026-11-18T10:00:00Z" })];
    const made = missingItems("c1", [{ key: "k", part: part("black") }], cat, name);
    expect(made[0]!.priceCents).toBe(900);
    expect(made[0]!.costCents).toBe(450);
    expect(made[0]!.placeholder).toBe(false);
  });

  it("С10: после «Создать» «Обновить смету» привязывает строку к Black, цена та же, groupPrice уходит; правленная цена остаётся", () => {
    const before = linesFromParts([part("black")], WB, name, uid) as ModuleLine[];
    const black = grouped("k", "black");
    const next = linesFromParts([part("black")], [...WB, black], name, uid) as ModuleLine[];
    const after = resyncLines(before, next)[0]!;
    expect(after.catalogItemId).toBe("k");
    expect(after.unitPriceCents).toBe(1000);
    expect(after.source?.groupPrice).toBeUndefined();
    // a price changed by hand stays (handChanges)
    const hand = [{ ...before[0]!, unitPriceCents: 1500 }];
    expect(resyncLines(hand, next)[0]!.unitPriceCents).toBe(1500);
  });
});
