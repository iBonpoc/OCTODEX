/** Настройки модуля Gutters у компании (docs/specs/33-gutters-settings.md П22, M7b): чтение, умолчания, шторка от выбора компании. */
import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { changeDs, changeRun, COLORS, hangerKitsFor, MATERIALS, PROFILES, SIZES_BY_PROFILE, wallKitsFor, wallOf, withCurrent } from "../src/modules/gutters/canvas/attrs";
import { setDsAttrs, setRunAttrs } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { toMeasurement, type Drawing } from "../src/modules/gutters/geometry";
import {
  choicesFor, colorName, MAX_PALETTE, MODULE_CHOICES, MODULE_OFFER, newDsAttrs, newRunAttrs, PALETTES, readPalette, setPath, settingsFit, toggleOffer,
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
      // «off» — what the company does not install; unknown values (a newer version's) are ignored
      off: { profiles: ["half_round", "fascia", "box", "euro", "roofing", 7], sizes: { k: ["9"], half_round: "6" }, materials: MATERIALS, gauges: { aluminum: [".027", ".099"] }, hangers: ["nope"], dsSizes: { rect: ["2x3", "4x5", "1x1"] }, bottoms: ["extension", "splash_block", "flex", "lower_roof", "none"] },
      palette: ["  Musket   Brown ", "musket brown", "", "x".repeat(41), "bad\u0007", 12, "Clay"],
      run: { profile: "roofing", size: 99, color: "Nope" },
      hangerByMount: { k: { fascia: "hr_shank_fascia", rafter: "spike" } },
    });
    expect(ch.offer.profiles).toEqual(["k"]);
    expect(ch.offer.sizes.k).toEqual([...SIZES_BY_PROFILE.k]); // «9» не размер K — список модуля
    expect(ch.offer.materials).toEqual([...MATERIALS]); // all off — a broken store: all on
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
  it("одна правка пишет одно поле поверх сырого объекта: чужие ключи, вложенные незнакомые значения и v не трогает (ревью #372 №2)", () => {
    const raw = { v: 2, rules: { wastePct: 6, future: 1 }, future: { x: 1 }, off: { profiles: ["roofing"], sizes: { k: ["9"] } }, run: { profile: "k", tomorrow: "x" } };
    const next = setPath(raw, ["run", "size"], "6");
    expect(next).toEqual({ ...raw, run: { profile: "k", tomorrow: "x", size: "6" } });
    expect(raw.run).toEqual({ profile: "k", tomorrow: "x" }); // не на месте
    expect(setPath(undefined, ["palette"], ["Black"])).toEqual({ v: 1, palette: ["Black"] });
    expect(setPath({ v: 1, palette: ["Black"] }, ["palette"], undefined)).toEqual({ v: 1 });
    expect(setPath(raw, ["hangerByMount", "k", "fascia"], "spike").hangerByMount).toEqual({ k: { fascia: "spike" } });
  });
  it("галочка: двигается только одно значение в списке «не ставим», незнакомые остаются (ревью #372 №2)", () => {
    const raw = { off: { sizes: { k: ["9"], box: ["8"] } } };
    const a = toggleOffer(raw, "sizes", "k", "7")!;
    expect(a.off).toEqual({ sizes: { k: ["9", "7"], box: ["8"] } });
    const b = toggleOffer(a, "sizes", "k", "7")!;
    expect(b.off).toEqual({ sizes: { k: ["9"], box: ["8"] } });
    expect(choicesFor(a).offer.sizes.k).toEqual(["5", "6"]);
  });
  it("новые размеры модуля появляются сами: хранится только снятое (ревью #372 №3)", () => {
    // компания сняла K 7″; модуль потом добавит K 8″ — в «не ставим» его нет, значит он будет предложен
    const raw = toggleOffer({}, "sizes", "k", "7")!;
    expect(raw).toEqual({ v: 1, off: { sizes: { k: ["7"] } } });
    expect(JSON.stringify(raw)).not.toContain('"5"');
  });
  it("последнюю галочку списка снять нельзя — null; у креплений — по семейству", () => {
    let raw: Record<string, unknown> | null = {};
    for (const s of ["6", "7"]) raw = toggleOffer(raw, "sizes", "fascia", s);
    expect(raw).toBeNull(); // fascia: 6, 7 — второй снять нельзя
    const one = toggleOffer({}, "sizes", "fascia", "6")!;
    expect(toggleOffer(one, "sizes", "fascia", "7")).toBeNull();
    let h: Record<string, unknown> | null = {};
    const hr = ["hr_shank_fascia", "hr_shank_rafter", "hr_shank_sheathing", "hr_shank_crown", "hr_shank_angled", "hr_rival_strap", "hr_regal_bar", "hr_face_clip"];
    for (const id of hr.slice(0, -1)) h = toggleOffer(h, "hangers", null, id, hr);
    expect(h).not.toBeNull();
    expect(toggleOffer(h, "hangers", null, hr[hr.length - 1]!, hr)).toBeNull();
  });
  it("размер: полная палитра 60 и все разделы влезают в 32 KB; огромное — нет", () => {
    const big = { off: { profiles: ["box"] }, palette: Array.from({ length: 60 }, (_, i) => `Color number ${i} long name xx`), run: MODULE_CHOICES.run, ds: MODULE_CHOICES.ds, hangerByMount: MODULE_CHOICES.hangerByMount, wallKitByWall: MODULE_CHOICES.wallKitByWall };
    expect(settingsFit(big)).toBe(true);
    expect(settingsFit({ junk: "x".repeat(40000) })).toBe(false);
  });
});

describe("шторка и новые элементы по настройкам компании", () => {
  const KEEP_HANGERS = ["hidden", "spike", "rafter", "hr_shank_fascia"];
  const KEEP_WALL = ["ds_strap", "sickle_hook", "brick_hook", "hinged_hook", "pipe_cleat"];
  const ch = choicesFor({
    off: {
      profiles: ["fascia", "box", "euro"],
      sizes: { k: ["5", "7"] },
      hangers: MODULE_OFFER.hangers.filter((id) => !KEEP_HANGERS.includes(id)),
      wallKits: MODULE_OFFER.wallKits.filter((id) => !KEEP_WALL.includes(id)),
    },
    palette: ["Musket Brown", "Black"],
    run: { profile: "k", size: "6", material: "aluminum", gauge: ".032", color: "Black", mount: "fascia" },
    hangerByMount: { k: { fascia: "spike" } },
    wallKitByWall: { rect: { wood: "sickle_hook" }, round: { wood: "pipe_cleat" } },
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
    // новый профиль — крепление из того, что компания ставит для него (ревью #372 №6)
    const hr = changeRun({ ...DEFAULT_RUN_ATTRS, hanger: "hidden" }, { profile: "half_round" }, ch);
    expect(hr.hanger).toBe("hr_shank_fascia");
    const toK = changeRun({ ...DEFAULT_RUN_ATTRS, profile: "box", size: "6", hanger: "hidden_clip" }, { profile: "k" }, ch);
    expect(toK.hanger).toBe("spike"); // hidden_clip годится K, но компания его не ставит
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
    // смена формы: стена остаётся, набор — компании для новой формы (ревью #372 №6)
    const round = changeDs({ ...DEFAULT_DS_ATTRS, wall: "sickle_hook" }, { shape: "round" }, ch);
    expect(round.wall).toBe("pipe_cleat");
    expect(changeDs({ ...DEFAULT_DS_ATTRS }, { shape: "round" }, ch).wall).toBe("pipe_cleat");
    expect(changeDs({ ...DEFAULT_DS_ATTRS, wall: "brick" }, { shape: "round" }, ch).wall).toBe("brick");
  });
  it("правка рисунка берёт выбор компании", () => {
    const D: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: { ...DEFAULT_RUN_ATTRS, mount: "rafter", hanger: "rafter" } }], downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "r", atIn: 120 }] };
    expect(setRunAttrs(D, "r", { mount: "fascia" }, ch).runs[0]!.attrs.hanger).toBe("spike");
    expect(setDsAttrs(D, "d", { wall: "wood" }, ch).downspouts[0]!.wall).toBe("sickle_hook");
  });
});

describe("перечитка элементов", () => {
  it("цинк и некрашеное с умолчаний компании после перечитки остаются без толщины и цвета (ревью M7b №2)", () => {
    const ch = choicesFor({ run: { material: "zinc" }, ds: { material: "aluminum", finish: "mill" } });
    const D: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: newRunAttrs(ch) }], downspouts: [{ ...newDsAttrs(ch), id: "d", runId: "r", atIn: 10 }] };
    expect(D.runs[0]!.attrs.gauge).toBeUndefined();
    const back = fromElements(toElements(D, "m"));
    expect(back.runs[0]!.attrs).toEqual(D.runs[0]!.attrs);
    expect(back.downspouts[0]).toEqual(D.downspouts[0]);
    expect(back.runs[0]!.attrs.color).toBeUndefined();
    expect(back.downspouts[0]!.color).toBeUndefined();
  });
});
