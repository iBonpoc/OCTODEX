/** Смета из замера (docs/specs/33-gutters-estimate.md П23, M8a): строки по разделам из прайса, деньги в центах, «Обновить смету». */
import { describe, expect, it } from "vitest";
import { computeCustomOption, computeGutterParts, DEFAULT_TAX, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { billQty, handChanges, linesFromParts, noPriceLines, resyncLines, SECTION_ORDER, type LineSource, type ModuleLine } from "../src/modules/gutters/estimate";
import { laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `l${++n}`;
const settings = { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" as const } };
const parts = computeGutterParts(sampleJob({})).parts;
/** the whole price list of the sample at real prices */
const list = (cents = 1234): CatalogItem[] => missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: cents, ...(it.kind === "material" ? { costCents: 1000, vendorTaxBps: 1025 } : {}) }));
const ours = (l: ModuleLine) => l.source as LineSource;

describe("строки сметы из замера", () => {
  it("только то, за что платит клиент; одна строка на позицию (заглушки L и R вместе); разделы по порядку, работа последней", () => {
    const lines = linesFromParts(parts, list(), name, uid);
    const client = parts.filter((p) => p.use !== "purchase");
    expect(lines.length).toBeLessThan(client.length); // L + R caps → one
    const caps = lines.find((l) => l.name.includes("end_cap") || ours(l).key.includes("part=end_cap"))!;
    expect(caps.quantity).toBe("2");
    const order = lines.map((l) => SECTION_ORDER.indexOf(ours(l).section as never));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const firstLabor = lines.findIndex((l) => l.group === "labor");
    expect(lines.slice(firstLabor).every((l) => l.group === "labor")).toBe(true);
    expect(lines.filter((l) => l.group === "labor").map((l) => ours(l).key)).toEqual(expect.arrayContaining([expect.stringContaining("work=install"), expect.stringContaining("work=downspout")]));
  });
  it("цена — позиция прайса в целых центах, себестоимость материала с налогом поставщика, id позиции", () => {
    const lines = linesFromParts(parts, list(1234), name, uid);
    for (const l of lines) {
      expect(l.unitPriceCents).toBe(1234);
      expect(Number.isSafeInteger(l.unitPriceCents)).toBe(true);
      expect(l.catalogItemId).toBeTruthy();
      if (l.group === "material") expect(l.unitCostCents).toBe(1103); // $10.00 + 10.25 % = $11.025 → $11.03
      else expect(l.unitCostCents).toBeUndefined();
    }
  });
  it("нет позиции — цена 0 с пометкой «нет цены», не тихие $0", () => {
    const lines = linesFromParts(parts, [], name, uid);
    expect(noPriceLines(lines).length).toBe(lines.length);
    expect(lines.every((l) => l.unitPriceCents === 0 && ours(l).noPrice)).toBe(true);
    expect(noPriceLines(linesFromParts(parts, list(), name, uid))).toEqual([]);
  });
  it("футы — сотые, половина вверх (230″ = 19.17 ft); штуки — целые", () => {
    expect(billQty(String(230 / 12), "ft")).toBe("19.17");
    expect(billQty("19.165", "ft")).toBe("19.17");
    expect(billQty("3", "ea")).toBe("3");
  });
  it("деньги через движок: сумма = Σ floor(qty × цена + 0.5), в центах, без float", () => {
    const one = (qty: string): PartQty => ({ key: "gutter.x", section: "gutter", qty, unit: "ft", use: "estimate", kind: "material", attrs: { profile: "k" } });
    const item: CatalogItem = { id: "g", kind: "material", name: "Gutter", unit: "ft", priceCents: 1199, attributes: { part: "gutter", profile: "k" } };
    const lines = linesFromParts([one(String(230 / 12))], [item], name, uid);
    expect(lines[0]!.quantity).toBe("19.17");
    const t = computeCustomOption({ id: "o", name: "Good", lines }, settings);
    expect(t.total).toBe(Math.floor(19.17 * 1199 + 0.5)); // 22984.83 → 22985
    expect(t.total).toBe(22985);
    // the whole sample at $12.34: the engine's total, whole cents
    const all = linesFromParts(parts, list(1234), name, uid);
    const tt = computeCustomOption({ id: "o", name: "Good", lines: all }, settings);
    expect(Number.isSafeInteger(tt.total)).toBe(true);
    expect(tt.total).toBe(all.reduce((s, l) => s + Math.floor(Number(l.quantity) * 1234 + 0.5), 0));
  });
});

describe("«Обновить смету» — правки руками и свои строки целы", () => {
  const base = () => linesFromParts(parts, list(1000), name, uid);
  const longer = () => computeGutterParts({ ...sampleJob({}), runs: sampleJob({}).runs.map((r) => (r.id === "a" ? { ...r, lengthIn: 600 } : r)) }).parts;
  it("ничего не правили — новые количества; id и место строк те же", () => {
    const old = base();
    const next = linesFromParts(longer(), list(1000), name, uid);
    const r = resyncLines(old, next);
    expect(r.map((l) => l.id)).toEqual(old.map((l) => l.id));
    const g = r.find((l) => ours(l).section === "gutter")!;
    expect(g.quantity).toBe(next.find((l) => ours(l).key === ours(g).key)!.quantity);
  });
  it("количество и цена руками остаются; имя руками остаётся; база для следующего раза — расчёт модуля", () => {
    const old = base();
    const g = old.find((l) => ours(l).section === "gutter")!;
    const edited = old.map((l) => (l.id === g.id ? { ...l, quantity: "101", unitPriceCents: 1500, name: "Мой желоб" } : l));
    const r = resyncLines(edited, linesFromParts(longer(), list(1000), name, uid));
    const g2 = r.find((l) => l.id === g.id)!;
    expect(g2).toMatchObject({ quantity: "101", unitPriceCents: 1500, name: "Мой желоб" });
    expect(handChanges(g2 as never)).toEqual({ qty: true, price: true, name: true });
  });
  it("своя строка — на месте и без изменений; часть, чью позицию уже взяла своя строка, не дублируется", () => {
    const old = base();
    const own: ModuleLine = { id: "own", name: "Вывоз мусора", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 };
    const withOwn = [old[0]!, own, ...old.slice(1)];
    const r = resyncLines(withOwn, linesFromParts(longer(), list(1000), name, uid));
    expect(r[1]).toBe(own);
  });
  it("старый телефон пересохранил: строка с той же позицией прайса без source (выбрана заново) — своя, не трогаем и не дублируем", () => {
    const old = base();
    const g = old.find((l) => ours(l).section === "gutter")!;
    const { source: _s, ...picked } = g; // an old phone re-picked the item: the line has no source
    const oldPhone = old.map((l) => (l.id === g.id ? { ...picked, quantity: "77" } : l));
    const r = resyncLines(oldPhone, linesFromParts(longer(), list(1000), name, uid));
    expect(r.find((l) => l.id === g.id)).toMatchObject({ quantity: "77" });
    expect(r.filter((l) => l.catalogItemId === g.catalogItemId)).toHaveLength(1);
  });
  it("старый телефон правил количество, source доехал (строки раскрываются) — правка видна и сохраняется", () => {
    const old = base();
    const g = old.find((l) => ours(l).section === "gutter")!;
    const json = JSON.parse(JSON.stringify(old.map((l) => (l.id === g.id ? { ...l, quantity: "55" } : l)))); // calc_inputs round trip
    const r = resyncLines(json, linesFromParts(longer(), list(1000), name, uid));
    expect(r.find((l) => l.id === g.id)!.quantity).toBe("55");
  });
  it("пропала из замера: нетронутая — убирается, тронутая — остаётся с пометкой «нет в замере»", () => {
    const old = base();
    const ds = old.filter((l) => ours(l).section === "downspouts");
    expect(ds.length).toBeGreaterThan(0);
    const noDs = computeGutterParts({ ...sampleJob({}), downspouts: [] }).parts;
    const r1 = resyncLines(old, linesFromParts(noDs, list(1000), name, uid));
    expect(r1.some((l) => l.id === ds[0]!.id)).toBe(false);
    const touched = old.map((l) => (l.id === ds[0]!.id ? { ...l, unitPriceCents: 999 } : l));
    const r2 = resyncLines(touched, linesFromParts(noDs, list(1000), name, uid));
    expect(r2.find((l) => l.id === ds[0]!.id)).toMatchObject({ unitPriceCents: 999, source: { gone: true } });
  });
  it("новая деталь — в свой раздел, после последней строки раздела; цена из прайса", () => {
    const old = linesFromParts(computeGutterParts({ ...sampleJob({}), downspouts: [] }).parts, list(1000), name, uid);
    const r = resyncLines(old, linesFromParts(parts, list(1000), name, uid));
    const secs = r.map((l) => SECTION_ORDER.indexOf(ours(l).section as never));
    expect(secs).toEqual([...secs].sort((a, b) => a - b));
    expect(r.some((l) => ours(l).section === "downspouts")).toBe(true);
  });
  it("цена появилась в прайсе — строка «нет цены» получает её, если руками не ставили", () => {
    const old = linesFromParts(parts, [], name, uid);
    const r = resyncLines(old, linesFromParts(parts, list(1000), name, uid));
    expect(r.every((l) => l.unitPriceCents === 1000 && !ours(l).noPrice)).toBe(true);
  });
  it("клиенту: в source нет себестоимости", () => {
    const l = linesFromParts(parts, list(1000), name, uid)[0]!;
    expect(Object.keys(l.source!)).not.toContain("unitCostCents");
    expect(JSON.stringify(l.source)).not.toMatch(/cost/i);
  });
});
