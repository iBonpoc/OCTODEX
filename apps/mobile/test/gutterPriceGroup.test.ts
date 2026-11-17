/**
 * «Одна цена на все цвета» (#1913 PR3; spec 33-gutters-price-key §4.1, §4.3, §4.4 п.2, §6, §7а п.3): the module gathers the colours of a part
 * into a price group once (the transition); before it nothing moves, after it a saved estimate of an old measurement keeps its lines
 * until «Обновить смету».
 */
import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/data/types";
import type { PartQty } from "@octo/estimating-engine";
import { catalogMatch } from "../src/features/catalogMatch";
import { colouredPart, groupAttrs, groupText, priceGroupKey, transitionGroups, transitionWrites } from "../src/modules/gutters/prices/groups";
import { findItem, matchAttrs } from "../src/modules/gutters/prices";
import { linesFromParts, resyncLines } from "../src/modules/gutters/estimate";

const it_ = (id: string, color: string | undefined, o: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  kind: "material",
  name: `5″ K-Style Gutter ${color ?? ""} (test)`,
  unit: "ft",
  priceCents: 800,
  placeholder: false,
  costCents: 400,
  vendorTaxBps: 0,
  markupBps: 10000,
  supplierSku: `SKU-${id}`,
  packSize: "10",
  attributes: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", ...(color ? { color } : {}) },
  ...o,
});
const part = (color: string): PartQty =>
  ({ key: "gutter", section: "gutter", qty: "100", unit: "ft", use: "estimate", kind: "material", attrs: { profile: "k", size: "5", material: "aluminum", gauge: ".027", color } }) as unknown as PartQty;
const name = (p: PartQty) => `Gutter ${p.attrs.color}`;
let n = 0;
const uid = () => `l${++n}`;
const total = (ls: readonly { quantity: unknown; unitPriceCents: number }[]) => ls.reduce((s, l) => s + Math.round(Number(String(l.quantity)) * l.unitPriceCents), 0);

describe("группа цены (§4.1, §6 №1, 10, 14, 19)", () => {
  it("белая и коричневая одной детали — одна группа; без цвета — не в группе; цветная без finish = painted; mill и painted — разные; другая единица — другая", () => {
    const w = it_("w", "white"), b = it_("b", "brown");
    expect(priceGroupKey(w)).toBe(priceGroupKey(b));
    expect(colouredPart(it_("plain", undefined))).toBe(false);
    expect(priceGroupKey(w)).toBe(priceGroupKey(it_("p", "clay", { attributes: { ...w.attributes!, color: "clay", finish: "painted" } })));
    expect(priceGroupKey(w)).not.toBe(priceGroupKey(it_("m", "white", { attributes: { ...w.attributes!, finish: "mill" } })));
    expect(priceGroupKey(w)).not.toBe(priceGroupKey(it_("e", "white", { unit: "ea" })));
  });
  it("лишнее свойство у одной позиции (custom) — по подмножеству позиции находятся той же деталью; ключ группы строится по позиции", () => {
    // the transition groups by the item's own key (an item with `custom` is its own row); the estimate still finds both items (findItem)
    const a = it_("a", "white", { attributes: { ...it_("a", "white").attributes!, custom: "1" } });
    expect(findItem([a, it_("b", "brown")], part("white"))?.id).toBe("a");
  });
  it("ключ ≤ 120 символов, вид gutters:v1:<16 hex>, одинаков на эталонных свойствах (сторож хеша)", () => {
    const k = priceGroupKey(it_("w", "white"));
    expect(k).toMatch(/^gutters:v1:[0-9a-f]{16}$/);
    expect(k.length).toBeLessThanOrEqual(120);
    expect(groupText(it_("w", "white"))).toBe("ft|finish=painted|gauge=.027|material=aluminum|part=gutter|profile=k|size=5");
    // the reference: changes only with the version (GROUP_KEY_VERSION) or the set of properties
    expect(k).toBe("gutters:v1:7abd3a42cb111fc2");
    expect(priceGroupKey({ unit: "ft", attributes: { part: "gutter", color: "white" } })).toBe(priceGroupKey({ unit: "FT ", attributes: { color: "brown", part: "gutter", finish: "painted" } }));
  });
  it("groupAttrs: без color и priceGroup, finish выведен", () => {
    expect(groupAttrs({ part: "gutter", color: "white", priceGroup: "x" })).toEqual({ part: "gutter", finish: "painted" });
  });
  it("catalogMatch не считает priceGroup лишним: до и после перехода находится та же позиция (§6 №18)", () => {
    const w = it_("w", "white"), b = it_("b", "brown");
    const want = matchAttrs(part("white"));
    const before = catalogMatch([w, b], want)[0]?.id;
    const g = transitionGroups([w, b])[0]!;
    const after = catalogMatch(transitionWrites(g, g.suggested, true), want)[0]?.id;
    expect(after).toBe(before);
  });
});

describe("переход (§4.4 п.2, §6 №2, 3, 6, 11, 12, 15)", () => {
  it("до перехода ничего не двигается: цена каждой строки сметы та же, что у своей позиции", () => {
    const cat = [it_("w", "white"), it_("b", "brown", { priceCents: 900 })];
    expect(findItem(cat, part("white"))?.priceCents).toBe(800);
    expect(findItem(cat, part("brown"))?.priceCents).toBe(900);
  });
  it("одинаковая цена — группа «одна цена», выбирать нечего", () => {
    const gs = transitionGroups([it_("w", "white"), it_("b", "brown")]);
    expect(gs).toHaveLength(1);
    expect(gs[0]!.options).toHaveLength(1);
    expect(gs[0]!.why).toEqual({ k: "same" });
  });
  it("разные цены: у большинства цветов — предложена она и сказано почему", () => {
    const g = transitionGroups([it_("w", "white"), it_("b", "brown"), it_("c", "clay", { priceCents: 900, updatedAt: "2026-11-15T00:00:00Z" })])[0]!;
    expect(g.options[g.suggested]!.priceCents).toBe(800);
    expect(g.why).toEqual({ k: "most", n: 2, of: 3 });
  });
  it("все разные: предложена последняя правка (её день); без времени — меньший id", () => {
    const g = transitionGroups([it_("w", "white", { updatedAt: "2026-11-10T00:00:00Z" }), it_("b", "brown", { priceCents: 900, updatedAt: "2026-11-12T00:00:00Z" })])[0]!;
    expect(g.options[g.suggested]!.priceCents).toBe(900);
    expect(g.why).toEqual({ k: "last", at: "2026-11-12T00:00:00Z" });
    const h = transitionGroups([it_("z", "white"), it_("a", "brown", { priceCents: 900 })])[0]!;
    expect(h.options[h.suggested]!.sourceId).toBe("a");
  });
  it("«Сделать одну цену»: у всех priceGroup и цена выбора (цена, placeholder, себестоимость, налог, наценка); код, упаковка — свои; источник первым", () => {
    const g = transitionGroups([it_("w", "white", { updatedAt: "2026-11-10T00:00:00Z" }), it_("b", "brown", { priceCents: 900, costCents: 450, markupBps: 10000, updatedAt: "2026-11-12T00:00:00Z" })])[0]!;
    const white = g.options.findIndex((o) => o.priceCents === 800);
    const out = transitionWrites(g, white, true);
    expect(out[0]!.id).toBe("w");
    for (const x of out) {
      expect(x.attributes!.priceGroup).toBe(g.key);
      expect([x.priceCents, x.placeholder, x.costCents, x.vendorTaxBps, x.markupBps]).toEqual([800, false, 400, 0, 10000]);
    }
    expect(out.map((x) => [x.supplierSku, x.packSize])).toEqual([["SKU-w", "10"], ["SKU-b", "10"]]);
    expect(out.map((x) => x.attributes!.color)).toEqual(["white", "brown"]);
  });
  it("кто не видит себестоимость: поля себестоимости не трогаются", () => {
    const g = transitionGroups([it_("w", "white"), it_("b", "brown", { priceCents: 900, costCents: 450 })])[0]!;
    const out = transitionWrites(g, g.suggested, false);
    expect(out.find((x) => x.id === "b")!.costCents).toBe(450);
  });
  it("после перехода экран больше ничего не предлагает; позиция, выпавшая из группы (старый телефон), предлагается снова с ценой группы", () => {
    const cat = [it_("w", "white"), it_("b", "brown", { priceCents: 900 })];
    const g = transitionGroups(cat)[0]!;
    const done = transitionWrites(g, g.suggested, true);
    expect(transitionGroups(done)).toEqual([]);
    const fell = done.map((x) => (x.id === "b" ? { ...x, attributes: { ...x.attributes!, priceGroup: "" }, priceCents: 700 } : x));
    const again = transitionGroups(fell);
    expect(again).toHaveLength(1);
    expect(again[0]!.options).toHaveLength(1);
    expect(again[0]!.options[0]!.priceCents).toBe(done[0]!.priceCents);
  });
  it("позиции без цвета и других деталей (не модуля) группы не получают", () => {
    const wire = { ...it_("wire", "red"), attributes: { part: "wire", color: "red" } };
    expect(transitionGroups([it_("p", undefined), wire])).toEqual([]);
  });
});

describe("деньги: старые сметы не меняются, пока человек не нажал «Обновить смету» (условие руководителя)", () => {
  it("смета белого и коричневого: после перехода сохранённые строки те же; «Обновить» — цена группы", () => {
    const cat0 = [it_("w", "white", { updatedAt: "2026-11-12T00:00:00Z" }), it_("b", "brown", { priceCents: 900, costCents: 450 })];
    const parts = [part("white"), part("brown")];
    const saved = linesFromParts(parts, cat0, name, uid);
    const before = total(saved);
    expect(before).toBe(100 * 800 + 100 * 900);
    const g = transitionGroups(cat0)[0]!;
    const cat1 = transitionWrites(g, g.options.findIndex((o) => o.priceCents === 800), true);
    // the transition writes only the catalog: the estimate's lines are a snapshot — the same lines, the same sum
    expect(total(saved)).toBe(before);
    // the same measurement, «Обновить смету»: both colours the group's price, two lines, two items (§6 №7)
    const updated = resyncLines(saved, linesFromParts(parts, cat1, name, uid));
    expect(total(updated)).toBe(100 * 800 + 100 * 800);
    expect(updated.map((l) => l.catalogItemId).sort()).toEqual(["b", "w"]);
  });
});
