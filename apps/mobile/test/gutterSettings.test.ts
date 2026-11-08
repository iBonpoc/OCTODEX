/** Настройки модуля Gutters у компании (docs/specs/33-gutters-settings.md П22, M7b): чтение, умолчания, шторка от выбора компании. */
import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { changeDs, changeRun, COLORS, hangerKitsFor, MATERIALS, PROFILES, SIZES_BY_PROFILE, wallKitsFor, wallOf, withCurrent } from "../src/modules/gutters/canvas/attrs";
import { setCornerMethod, setDsAttrs, setRunAttrs } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { findCorners, toMeasurement, type Drawing } from "../src/modules/gutters/geometry";
import {
  choicesFor, colorName, keepsOne, MAX_PALETTE, MODULE_CHOICES, MODULE_OFFER, newDsAttrs, newRunAttrs, PALETTES, readPalette, readRules, readUse, settingsFit, setSetting, toRulesOverride,
} from "../src/modules/gutters/settings";

describe("чтение настроек", () => {
  it("пустые настройки = то, что шторка предлагала до M7 (e2e 148 и старые рисунки не меняются)", () => {
    for (const raw of [undefined, null, {}, [], "x", 5]) {
      const ch = choicesFor(raw);
      expect(ch.offer).toEqual(MODULE_OFFER);
      expect(ch.palette).toEqual([...COLORS]);
    }
    expect(MODULE_OFFER.profiles).toEqual([...PROFILES]);
    expect(MODULE_OFFER.materials).toEqual([...MATERIALS]);
    // новая линия и даунспот без настроек — как раньше (DEFAULT_RUN_ATTRS / DEFAULT_DS_ATTRS)
    expect(newRunAttrs(MODULE_CHOICES)).toEqual({ ...DEFAULT_RUN_ATTRS, finish: "painted" });
    expect(newDsAttrs(MODULE_CHOICES)).toEqual({ ...DEFAULT_DS_ATTRS, dsStyle: "plain", finish: "painted", gauge: ".027" });
  });
  it("мусор не роняет и не протекает: чужие значения отбрасываются, пустой список = умолчание модуля", () => {
    const ch = choicesFor({
      offer: { profiles: ["k", "roofing", 7], sizes: { k: ["9"], half_round: "6" }, materials: [], gauges: { aluminum: [".032", ".099"] }, hangers: ["nope"], dsSizes: { rect: ["3x4", "1x1"] }, bottoms: ["drain"] },
      palette: ["  Musket   Brown ", "musket brown", "", "x".repeat(41), "bad\u0007", 12, "Clay"],
      run: { profile: "roofing", size: 99, color: "Nope" },
      hangerByMount: { k: { fascia: "hr_shank_fascia", rafter: "spike" } },
    });
    expect(ch.offer.profiles).toEqual(["k"]);
    expect(ch.offer.sizes.k).toEqual([...SIZES_BY_PROFILE.k]); // «9» не размер K — список модуля
    expect(ch.offer.materials).toEqual([...MATERIALS]);
    expect(ch.offer.gauges.aluminum).toEqual([".032"]);
    expect(ch.offer.gauges.zinc).toEqual([]);
    expect(ch.offer.hangers).toEqual(MODULE_OFFER.hangers);
    expect(ch.offer.dsSizes.rect).toEqual(["3x4"]);
    expect(ch.offer.bottoms).toEqual(["drain"]);
    expect(ch.palette).toEqual(["Musket Brown", "Clay"]);
    // умолчания всегда из того, что компания ставит
    expect(ch.run.profile).toBe("k");
    expect(ch.run.size).toBe("5");
    expect(ch.run.gauge).toBe(".032");
    expect(ch.run.color).toBe("Musket Brown");
    // крепление другого семейства (shank на K) не принимается; spike — да
    expect(ch.hangerByMount.k.fascia).toBe("hidden");
    expect(ch.hangerByMount.k.rafter).toBe("spike");
    expect(ch.ds.size).toBe("3x4");
    expect(ch.ds.bottom).toBe("drain");
  });
  it("палитра: имя 1–40 знаков, без повторов (регистр не важен), не больше 60; пусто — слова модуля", () => {
    expect(colorName("  Dark   Bronze ")).toBe("Dark Bronze");
    expect(colorName("")).toBeNull();
    expect(colorName("a\nb")).toBeNull();
    expect(colorName("x".repeat(41))).toBeNull();
    expect(readPalette(["Black", "BLACK", "black "])).toEqual(["Black"]);
    expect(readPalette(Array.from({ length: 80 }, (_, i) => `C${i}`))).toHaveLength(MAX_PALETTE);
    expect(readPalette([])).toEqual([...COLORS]);
    expect(PALETTES.berger).toHaveLength(8);
    expect(PALETTES.servicePartners).toHaveLength(24);
  });
  it("медь и цинк — без покраски и цвета; цинк без толщины", () => {
    const ch = choicesFor({ run: { material: "copper", color: "white", finish: "painted" }, ds: { material: "zinc", gauge: ".027" } });
    expect(ch.run).toMatchObject({ material: "copper", finish: "mill", gauge: "16oz" });
    expect(ch.run.color).toBeUndefined();
    expect(ch.ds.gauge).toBeUndefined();
    expect(ch.ds.color).toBeUndefined();
  });
});

describe("запись настроек", () => {
  it("одна правка не трогает остальное, даже незнакомые ключи (настройки новой версии M7c)", () => {
    const raw = { v: 1, rules: { wastePct: "0.1" }, future: { x: 1 }, offer: { profiles: ["k"] } };
    const next = setSetting(raw, "offer", "materials", ["aluminum"]);
    expect(next).toEqual({ v: 1, rules: { wastePct: "0.1" }, future: { x: 1 }, offer: { profiles: ["k"], materials: ["aluminum"] } });
    expect(raw.offer).toEqual({ profiles: ["k"] }); // не на месте
    expect(setSetting(undefined, "palette", null, ["Black"])).toEqual({ v: 1, palette: ["Black"] });
  });
  it("размер: полная палитра 60 и все разделы влезают в 32 KB; огромное — нет", () => {
    const big = { offer: MODULE_OFFER, palette: Array.from({ length: 60 }, (_, i) => `Color number ${i} long name xx`), run: MODULE_CHOICES.run, ds: MODULE_CHOICES.ds, hangerByMount: MODULE_CHOICES.hangerByMount, wallKitByWall: MODULE_CHOICES.wallKitByWall };
    expect(settingsFit(big)).toBe(true);
    expect(settingsFit({ junk: "x".repeat(40000) })).toBe(false);
  });
  it("последнюю галочку снять нельзя", () => {
    expect(keepsOne([])).toBe(false);
    expect(keepsOne(["k"])).toBe(true);
  });
});

describe("шторка и новые элементы по настройкам компании", () => {
  const ch = choicesFor({
    offer: { profiles: ["k", "half_round"], sizes: { k: ["6"] }, hangers: ["hidden", "spike", "rafter", "hr_shank_fascia"], wallKits: ["ds_strap", "sickle_hook", "brick_hook", "hinged_hook"] },
    palette: ["Musket Brown", "Black"],
    run: { profile: "k", size: "6", material: "aluminum", gauge: ".032", color: "Black", mount: "fascia" },
    hangerByMount: { k: { fascia: "spike" } },
    wallKitByWall: { rect: { wood: "sickle_hook" } },
    ds: { shape: "rect", size: "3x4", color: "Black", wall: "wood" },
  });
  it("новая линия — профиль, размер, толщина, цвет и крепление компании", () => {
    expect(newRunAttrs(ch, 2)).toMatchObject({ profile: "k", size: "6", gauge: ".032", color: "Black", finish: "painted", mount: "fascia", hanger: "spike", story: 2 });
  });
  it("новый даунспот — набор к стене компании записан явно, движок считает его", () => {
    const d = newDsAttrs(ch);
    expect(d).toMatchObject({ shape: "rect", size: "3x4", color: "Black", wall: "sickle_hook" });
    const D: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: newRunAttrs(ch) }], downspouts: [{ ...d, id: "d", runId: "r", atIn: 120 }] };
    const parts = computeGutterParts(toMeasurement(D)).parts;
    expect(parts.some((p) => p.attrs.part === "sickle_hook")).toBe(true);
    expect(parts.some((p) => p.attrs.part === "ds_strap")).toBe(false);
    expect(parts.some((p) => p.attrs.hanger === "spike" || p.attrs.part === "spike")).toBe(true);
  });
  it("списки шторки — только то, что ставим; своё значение элемента остаётся (не стираем)", () => {
    expect(hangerKitsFor("k", ch)).toEqual(["hidden", "spike", "rafter"]);
    expect(hangerKitsFor("half_round", ch)).toEqual(["hr_shank_fascia"]);
    // набор компании для стены — первым
    expect(wallKitsFor("rect", "wood", ch)).toEqual(["sickle_hook", "ds_strap"]);
    expect(withCurrent(ch.palette, "white")).toEqual(["Musket Brown", "Black", "white"]);
    expect(withCurrent(ch.offer.profiles, "box")).toEqual(["k", "half_round", "box"]);
    expect(withCurrent(ch.offer.profiles, "k")).toEqual(["k", "half_round"]);
  });
  it("старая линия с размером и цветом, которых компания больше не ставит, правится без потери", () => {
    const old = { ...DEFAULT_RUN_ATTRS, profile: "k" as const, size: "5", color: "white" };
    const n = changeRun(old, { story: 2 }, ch);
    expect(n).toMatchObject({ size: "5", color: "white", story: 2 });
  });
  it("смена профиля: замена из того, что ставит компания; смена края — её крепление", () => {
    const r = changeRun({ ...DEFAULT_RUN_ATTRS, profile: "half_round", size: "5" }, { profile: "k" }, ch);
    expect(r.size).toBe("5"); // 5″ — размер K, остаётся
    const box = changeRun({ ...DEFAULT_RUN_ATTRS }, { profile: "fascia" }, ch);
    expect(box.size).toBe("6"); // 5″ не fascia: первый размер fascia, что есть
    const m = changeRun({ ...DEFAULT_RUN_ATTRS, hanger: "hidden" }, { mount: "rafter" }, ch);
    expect(m.hanger).toBe("rafter");
    const f = changeRun({ ...DEFAULT_RUN_ATTRS, hanger: "rafter", mount: "rafter" }, { mount: "fascia" }, ch);
    expect(f.hanger).toBe("spike");
    // без настроек — как раньше (M5c)
    expect(changeRun({ ...DEFAULT_RUN_ATTRS, hanger: "rafter", mount: "rafter" }, { mount: "fascia" }).hanger).toBe("hidden");
  });
  it("покраска после меди — цвет компании; стена — набор компании", () => {
    const r = changeRun({ ...DEFAULT_RUN_ATTRS, material: "copper", finish: "mill", color: undefined }, { material: "aluminum", finish: "painted" }, ch);
    expect(r.color).toBe("Black");
    const d = changeDs({ ...DEFAULT_DS_ATTRS, wall: "brick" }, { wall: "wood" }, ch);
    expect(d.wall).toBe("sickle_hook");
    expect(wallOf(d.shape, d.wall)).toEqual({ wall: "wood", kit: "sickle_hook" });
    // набор модуля по умолчанию — записывается типом стены, как раньше
    expect(changeDs({ ...DEFAULT_DS_ATTRS }, { wall: "brick" }, ch).wall).toBe("brick");
  });
  it("правка рисунка берёт выбор компании", () => {
    const D: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: { ...DEFAULT_RUN_ATTRS, mount: "rafter", hanger: "rafter" } }], downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "r", atIn: 120 }] };
    expect(setRunAttrs(D, "r", { mount: "fascia" }, ch).runs[0]!.attrs.hanger).toBe("spike");
    expect(setDsAttrs(D, "d", { wall: "wood" }, ch).downspouts[0]!.wall).toBe("sickle_hook");
  });
});

describe("M7c: правила и расходники компании → движок", () => {
  // L-образный дом: две линии 40 ft с наружным углом, даунспот на первой
  const D: Drawing = {
    runs: [
      { id: "r1", a: [0, 0], b: [480, 0], attrs: { ...DEFAULT_RUN_ATTRS } },
      { id: "r2", a: [480, 0], b: [480, -480], attrs: { ...DEFAULT_RUN_ATTRS } },
    ],
    downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d1", runId: "r1", atIn: 10 }],
  };
  const parts = (raw: unknown, d: Drawing = D) => {
    const r = readRules(raw);
    return computeGutterParts(toMeasurement(d, { method: r.corner }), toRulesOverride(raw)).parts;
  };
  const qty = (ps: ReturnType<typeof parts>, pred: (p: ReturnType<typeof parts>[number]) => boolean) => ps.filter(pred).reduce((s, p) => s + Number(p.qty), 0);

  it("пустые настройки считают ровно как движок по умолчанию", () => {
    expect(parts({})).toEqual(computeGutterParts(toMeasurement(D)).parts);
    expect(parts({ rules: "junk", use: [1] })).toEqual(computeGutterParts(toMeasurement(D)).parts);
  });
  it("чужие и вне диапазона значения — умолчание", () => {
    const r = readRules({ rules: { storyFt: 99, wastePct: -1, hangerSpacingIn: 24.5, dsStickFt: 11, corner: "glue", rainBasis: "x" } });
    expect(r).toMatchObject({ storyFt: 10, wastePct: 5, hangerSpacingIn: 24, dsStickFt: 10, corner: "cut", rainBasis: "smacna" });
    const u = readUse({ use: { joints: { endcap: { rivets: 99 } }, pointsPerTube: 0 } });
    expect(u.joints.endcap).toEqual({ rivets: 2, sealant: 1 });
    expect(u.pointsPerTube).toBe(8);
  });
  it("запас 10 % и шаг креплений 18″ меняют рулон и крепления", () => {
    const base = parts({});
    const p = parts({ rules: { wastePct: 10, hangerSpacingIn: 18 } });
    expect(qty(p, (x) => x.key.startsWith("coil."))).toBeGreaterThan(qty(base, (x) => x.key.startsWith("coil.")));
    expect(qty(p, (x) => x.attrs.part === "hanger")).toBe(2 * Math.ceil(480 / 18));
    expect(qty(base, (x) => x.attrs.part === "hanger")).toBe(2 * Math.ceil(480 / 24));
    expect(toRulesOverride({ rules: { wastePct: 7 } }).wastePct).toBe("0.07");
  });
  it("высота этажа 12 ft — даунспот 12 ft; +1 крепление на линию", () => {
    expect(qty(parts({ rules: { storyFt: 12 } }), (x) => x.section === "downspouts" && x.unit === "ft")).toBe(12);
    expect(qty(parts({ rules: { hangerExtra: true } }), (x) => x.attrs.part === "hanger")).toBe(2 * (20 + 1));
  });
  it("метод угла компании strip → strip miter; на углу своё (prefab) сильнее компании", () => {
    const strip = parts({ rules: { corner: "strip" } });
    expect(strip.some((x) => x.key.startsWith("stripmiter."))).toBe(true);
    const own = setCornerMethod(D, findCorners(D)[0]!, "prefab");
    // хранится на обеих линиях, каждая — на своём конце
    expect(own.runs[0]!.attrs.cornerMethod).toEqual({ b: "prefab" });
    expect(own.runs[1]!.attrs.cornerMethod).toEqual({ a: "prefab" });
    const p = parts({ rules: { corner: "strip" } }, own);
    expect(p.some((x) => x.key.startsWith("corner.out."))).toBe(true);
    expect(p.some((x) => x.key.startsWith("stripmiter."))).toBe(false);
    // в движок cornerMethod не уходит; null — снова умолчание
    expect(toMeasurement(own).runs.every((r) => !("cornerMethod" in r))).toBe(true);
    expect(setCornerMethod(own, findCorners(own)[0]!, null).runs.every((r) => !r.attrs.cornerMethod)).toBe(true);
    expect(setCornerMethod(D, findCorners(D)[0]!, null)).toBe(D);
  });
  it("расходники: заклёпки у заглушки, точек на тубу, соединение даунспота винтами", () => {
    const base = parts({});
    const p = parts({ use: { joints: { endcap: { rivets: 4 } }, pointsPerTube: 4, dsJoin: "screw" } });
    const rivets = (ps: typeof p) => qty(ps, (x) => x.key.startsWith("rivet."));
    expect(rivets(p)).toBeLessThan(rivets(base) + 4); // заглушек 2 × (+2), а даунспот ушёл на винты
    expect(qty(p, (x) => x.key.startsWith("sealant"))).toBeGreaterThanOrEqual(qty(base, (x) => x.key.startsWith("sealant")));
    expect(toRulesOverride({ use: { joints: { endcap: { rivets: 4 } } } }).joints?.endcap).toEqual({ rivets: 4, sealant: 1 });
  });
  it("кусок сетки 6 ft вместо 4 ft — меньше кусков", () => {
    const g: Drawing = { ...D, runs: D.runs.map((r) => ({ ...r, attrs: { ...r.attrs, guardsIn: 480 } })) };
    const pieces = (raw: unknown) => qty(parts(raw, g), (x) => x.key.startsWith("guardpiece."));
    expect(pieces({})).toBe(2 * 10);
    expect(pieces({ use: { guardPieceFt: { micromesh: 6 } } })).toBe(2 * Math.ceil(480 / 72));
  });
});

describe("M7c: редкие поля даунспота", () => {
  it("переход в размер другой формы снимается при смене формы; высота, смещения, верх — в движке", () => {
    const d = changeDs({ ...DEFAULT_DS_ATTRS, size: "3x4", reducers: [{ to: "2x3", qty: 1 }] }, { shape: "round" });
    expect(d.reducers).toBeUndefined();
    const ds = { ...DEFAULT_DS_ATTRS, id: "d", runId: "r", atIn: 10, heightIn: 216, offsets: [{ lengthIn: 2, qty: 2 }], head: "conductor" as const, diverter: true };
    const D2: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: { ...DEFAULT_RUN_ATTRS } }], downspouts: [ds] };
    const p = computeGutterParts(toMeasurement(D2)).parts;
    expect(p.filter((x) => x.section === "downspouts" && x.unit === "ft").reduce((s, x) => s + Number(x.qty), 0)).toBe(18);
    expect(p.some((x) => x.key.startsWith("offset.2."))).toBe(true);
    expect(p.some((x) => x.key.startsWith("conductorhead."))).toBe(true);
    expect(p.some((x) => x.key.startsWith("diverter."))).toBe(true);
  });
});
