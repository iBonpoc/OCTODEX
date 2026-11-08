/** Смета из замера (docs/specs/33-gutters-estimate.md П23, M8a): строки по разделам из прайса, деньги в центах, «Обновить смету». */
import { describe, expect, it } from "vitest";
import { computeCustomOption, computeGutterParts, DEFAULT_TAX, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { billQty, goneLines, handChanges, linesFromParts, noPriceLines, resyncLines, sectionAt, SECTION_ORDER, testPriceLines, type LineSource, type ModuleLine } from "../src/modules/gutters/estimate";
import { findItem, laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";
const findIn = (c: CatalogItem[], p: PartQty) => !!findItem(c, p);

const C = "11111111-1111-4111-8111-111111111111";
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
let n = 0;
const uid = () => `l${++n}`;
const settings = { discount: null, tax: DEFAULT_TAX, deposit: { kind: "none" as const } };
const parts = computeGutterParts(sampleJob({})).parts;
/** the whole price list of the sample at real prices */
const list = (cents = 1234): CatalogItem[] => missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: cents, ...(it.kind === "material" ? { costCents: cents, vendorTaxBps: 0, markupBps: 0 } : {}) }));
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
  it("цена — позиция прайса в целых центах, как в ядре; id позиции", () => {
    const lines = linesFromParts(parts, list(1234), name, uid);
    for (const l of lines) {
      expect(l.unitPriceCents).toBe(1234);
      expect(Number.isSafeInteger(l.unitPriceCents)).toBe(true);
      expect(l.catalogItemId).toBeTruthy();
      if (l.group === "material") expect(l.unitCostCents).toBe(1234);
      else expect(l.unitCostCents).toBeUndefined();
    }
  });
  it("материал: цена = закупка × налог поставщика × наценка (как строка из прайса в ядре), себестоимость = закупка × налог (ревью №1)", () => {
    const g = parts.find((p) => p.key.startsWith("gutter."))!;
    const base = list().find((x) => findIn([x], g))!;
    const it = { ...base, priceCents: 0, costCents: 1000, vendorTaxBps: 1025, markupBps: 1000 };
    const [l] = linesFromParts([g], [it], name, uid);
    expect(l!.unitPriceCents).toBe(1213); // $10.00 + 10.25 % + 10 % = $12.1275 → $12.13
    expect(l!.unitCostCents).toBe(1103); // $11.025 → $11.03
    expect(l!.source!.noPrice).toBeUndefined();
  });
  it("тестовая цена — пометка testPrice; тестовые $0 — «нет цены»; настоящие $0 компании — цена (ревью №2–3)", () => {
    const made = missingItems(C, [...materialRows({}), ...laborRows()], [], name);
    const lines = linesFromParts(parts, made, name, uid);
    expect(testPriceLines(lines).length).toBe(lines.length);
    const zero = lines.filter((l) => l.unitPriceCents === 0);
    expect(zero.length).toBeGreaterThan(0); // hangers, straps: TEST_RATES 0
    expect(zero.every((l) => l.source!.noPrice)).toBe(true);
    const real = linesFromParts(parts, made.map((x) => ({ ...x, placeholder: false, priceCents: 0, ...(x.kind === "material" ? { costCents: 0 } : {}) })), name, uid);
    expect(noPriceLines(real)).toEqual([]);
    expect(testPriceLines(real)).toEqual([]);
    // a broken price in the list: «нет цены», never used
    const broken = linesFromParts(parts.slice(0, 3), made.map((x) => ({ ...x, placeholder: false, priceCents: 12.5, costCents: undefined, kind: "labor" as const })), name, uid);
    expect(broken.every((l) => l.unitPriceCents === 0)).toBe(true);
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
    // the sample: 100 ft gutter, 1 cap line × 2, … — the module's quantities are exact decimals; check one line by hand
    const gl = all.find((l) => ours(l).section === "gutter")!;
    expect(gl.quantity).toBe("90"); // 40 + 30 + 20 ft
    expect(tt.lineTotals[all.indexOf(gl)]).toBe(111060); // 90 × $12.34
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
    expect(handChanges(g2 as never)).toMatchObject({ qty: true, price: true, name: true });
  });
  it("своя строка — на месте и без изменений; часть, чью позицию уже взяла своя строка, не дублируется", () => {
    const old = base();
    const own: ModuleLine = { id: "own", name: "Вывоз мусора", group: "service", quantity: "1", unit: "ea", unitPriceCents: 5000 };
    const withOwn = [old[0]!, own, ...old.slice(1)];
    const r = resyncLines(withOwn, linesFromParts(longer(), list(1000), name, uid));
    expect(r[1]).toBe(own);
    // an own line with a part's item: that part is not added again
    const g = old.find((l) => ours(l).section === "gutter")!;
    const mine: ModuleLine = { id: "mine", name: "Мой желоб", group: "material", quantity: "10", unit: "ft", unitPriceCents: 900, catalogItemId: g.catalogItemId };
    const r2 = resyncLines([mine, ...old.filter((l) => l.id !== g.id)], linesFromParts(longer(), list(1000), name, uid));
    expect(r2.filter((l) => l.catalogItemId === g.catalogItemId)).toEqual([mine]);
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
  it("цена появилась в прайсе — строка «нет цены» получает её, если руками не ставили; поставили руками — строка выходит из «нет цены»", () => {
    const old = linesFromParts(parts, [], name, uid);
    const r = resyncLines(old, linesFromParts(parts, list(1000), name, uid));
    expect(r.every((l) => l.unitPriceCents === 1000 && !ours(l).noPrice)).toBe(true);
    const hand = old.map((l, i) => (i === 0 ? { ...l, unitPriceCents: 700 } : l));
    expect(noPriceLines(hand).map((l) => l.id)).not.toContain(old[0]!.id);
  });
  it("копия строки детали (разбили работу) — не удаляется и не помечается пропавшей (ревью №4)", () => {
    const old = base();
    const g = old.find((l) => ours(l).section === "gutter")!;
    const copy = { ...g, id: "copy" };
    const r = resyncLines([...old, copy], linesFromParts(longer(), list(1000), name, uid));
    expect(r.find((l) => l.id === "copy")).toEqual(copy);
  });
  it("пропавшая тронутая строка — в goneLines (проверка перед отправкой, двойной счёт — ревью №6); описание и «доп.» — тоже правка (№7)", () => {
    const old = base();
    const ds = old.find((l) => ours(l).section === "downspouts")!;
    const noDs = computeGutterParts({ ...sampleJob({}), downspouts: [] }).parts;
    const r = resyncLines(old.map((l) => (l.id === ds.id ? { ...l, description: "у крыльца" } : l)), linesFromParts(noDs, list(1000), name, uid));
    expect(goneLines(r).map((l) => l.id)).toEqual([ds.id]);
    const r2 = resyncLines(old.map((l) => (l.id === ds.id ? { ...l, optional: true } : l)), linesFromParts(noDs, list(1000), name, uid));
    expect(goneLines(r2).map((l) => l.id)).toEqual([ds.id]);
  });
  it("позиция пропала из прайса, цену руками не ставили — «нет цены» и без ссылки на старую позицию (ревью №8)", () => {
    const old = base();
    const r = resyncLines(old, linesFromParts(parts, [], name, uid));
    expect(r.every((l) => l.catalogItemId === undefined && l.unitPriceCents === 0 && ours(l).noPrice)).toBe(true);
  });
  it("неизвестный раздел — перед работой: работа последней (ревью №9)", () => {
    expect(sectionAt("new_section")).toBeGreaterThan(sectionAt("consumables"));
    expect(sectionAt("new_section")).toBeLessThan(sectionAt("labor"));
  });
  it("новая деталь, когда строк модуля её раздела и ранее нет — перед первой строкой модуля позже, не в самое начало (ревью №10)", () => {
    const own: ModuleLine = { id: "own", name: "Вывоз", group: "service", quantity: "1", unit: "ea", unitPriceCents: 100 };
    const onlyLabor = base().filter((l) => ours(l).section === "labor");
    const r = resyncLines([own, ...onlyLabor], linesFromParts(parts, list(1000), name, uid));
    expect(r[0]).toBe(own);
    const firstLabor = r.findIndex((l) => l.source && ours(l).section === "labor");
    expect(r.slice(1, firstLabor).every((l) => l.source && ours(l).section !== "labor")).toBe(true);
    // no module lines at all: at the end
    const r2 = resyncLines([own], linesFromParts(parts, list(1000), name, uid));
    expect(r2[0]).toBe(own);
  });
  it("странное количество в строке не роняет «Обновить»: строка считается правленой и остаётся (ревью №11)", () => {
    const old = base();
    const odd = old.map((l, i) => (i === 0 ? { ...l, quantity: "1,5" } : l));
    const r = resyncLines(odd, linesFromParts(longer(), list(1000), name, uid));
    expect(r[0]!.quantity).toBe("1,5");
  });
  it("номер ревизии замера записывается в source", () => {
    expect(linesFromParts(parts, list(), name, uid, "rev-1").every((l) => l.source!.revisionId === "rev-1")).toBe(true);
  });
  it("клиенту: в source нет себестоимости", () => {
    const l = linesFromParts(parts, list(1000), name, uid)[0]!;
    expect(Object.keys(l.source!)).not.toContain("unitCostCents");
    expect(JSON.stringify(l.source)).not.toMatch(/cost/i);
  });
});
