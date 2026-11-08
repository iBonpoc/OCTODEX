/** Панель атрибутов холста Gutters (docs/specs/33-gutters-screens.md П21.8 M5c): наборы, поправка зависимых полей, рулетка. */
import { describe, expect, it } from "vitest";
import { computeGutterParts, DEFAULT_HANGER_KITS, DEFAULT_WALL_KITS } from "@octo/estimating-engine";
import { changeDs, changeRun, DS_SHAPES, DS_SIZES, elbowsOf, hangerKitsFor, PROFILES, SIZES_BY_PROFILE, tapeIn, wallKitsFor, wallOf, WALLS } from "../src/modules/gutters/canvas/attrs";
import { pushHistory, setDsAttrs, setLength, setRunAttrs, undo } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { runLengthIn, toMeasurement, type Drawing } from "../src/modules/gutters/geometry";

const run = { id: "r1", a: [0, 0] as [number, number], b: [240, 0] as [number, number], attrs: { ...DEFAULT_RUN_ATTRS } };
const ds = { ...DEFAULT_DS_ATTRS, id: "d1", runId: "r1", atIn: 120 };
const D: Drawing = { runs: [run], downspouts: [ds] };

describe("наборы", () => {
  it("у каждого профиля есть размеры и наборы крепления своего семейства, и каждый набор есть в движке", () => {
    for (const p of PROFILES) {
      expect(SIZES_BY_PROFILE[p].length).toBeGreaterThan(0);
      const kits = hangerKitsFor(p);
      expect(kits.length).toBeGreaterThan(0);
      for (const id of kits) expect(DEFAULT_HANGER_KITS[id]).toBeDefined();
    }
    expect(hangerKitsFor("half_round").every((id) => id.startsWith("hr_"))).toBe(true);
    expect(hangerKitsFor("k").some((id) => id.startsWith("hr_"))).toBe(false);
  });
  it("у каждой формы и стены есть наборы креплений к стене, и каждый есть в движке; умолчание — первое", () => {
    for (const sh of DS_SHAPES)
      for (const w of WALLS) {
        const kits = wallKitsFor(sh, w);
        expect(kits.length).toBeGreaterThan(0);
        for (const id of kits) expect(DEFAULT_WALL_KITS[id]).toBeDefined();
        expect(wallOf(sh, w).kit).toBe(kits[0]);
      }
  });
  it("wallOf: тип стены, id набора, пусто и чужое", () => {
    expect(wallOf("rect", "stucco")).toEqual({ wall: "stucco", kit: "ds_strap_masonry" });
    expect(wallOf("rect", "sickle_hook")).toEqual({ wall: "wood", kit: "sickle_hook" });
    expect(wallOf("round", "brick")).toEqual({ wall: "brick", kit: "conductor_band_masonry" });
    expect(wallOf("rect", undefined)).toEqual({ wall: "wood", kit: "ds_strap" });
    expect(wallOf("rect", "nope")).toEqual({ wall: "wood", kit: "ds_strap" });
  });
});

describe("changeRun: зависимые поля", () => {
  it("ничего не поменялось — тот же объект (без пустого шага «Назад»)", () => {
    expect(changeRun(run.attrs, { size: "5" })).toBe(run.attrs);
  });
  it("полукруглый: размер 7 → первый допустимый, крепление — shank по краю крыши", () => {
    const a = changeRun({ ...run.attrs, size: "7" }, { profile: "half_round" });
    expect(a.size).toBe("5");
    expect(a.hanger).toBe("hr_shank_fascia");
  });
  it("смена края крыши ставит набор по умолчанию; свой набор держится, пока край тот же", () => {
    const a = changeRun(run.attrs, { mount: "rafter" });
    expect(a.hanger).toBe("rafter");
    const b = changeRun(a, { hanger: "spike" });
    expect(b.hanger).toBe("spike");
    expect(changeRun(b, { color: "brown" }).hanger).toBe("spike");
    expect(changeRun(b, { mount: "tile" }).hanger).toBe("tbar_strap");
  });
  it("материал → толщина: сталь 26ga, алюминий снова .027; своя толщина держится", () => {
    const st = changeRun(run.attrs, { material: "steel" });
    expect(st.gauge).toBe("26ga");
    expect(changeRun(st, { material: "aluminum" }).gauge).toBe(".027");
    expect(changeRun(run.attrs, { gauge: ".032" }).gauge).toBe(".032");
  });
  it("медь и цинк — без покраски и без цвета; цинк без толщины; обратно на алюминий — окрашенный белый", () => {
    const cu = changeRun(run.attrs, { material: "copper" });
    expect(cu.finish).toBe("mill");
    expect("color" in cu).toBe(false);
    expect(cu.gauge).toBe("16oz");
    const zn = changeRun(cu, { material: "zinc" });
    expect("gauge" in zn).toBe(false);
    const al = changeRun(zn, { material: "aluminum" });
    expect(al.finish).toBe("mill");
    const painted = changeRun(al, { finish: "painted" });
    expect(painted.color).toBe("white");
  });
  it("без покраски — цвет убирается (ключ запаса без цвета)", () => {
    const m = changeRun({ ...run.attrs, color: "brown" }, { finish: "mill" });
    expect("color" in m).toBe(false);
  });
});

describe("changeDs: зависимые поля", () => {
  it("круглый: размер 2×3 → 3″, колена A → 45° с тем же числом", () => {
    const a = changeDs({ ...DEFAULT_DS_ATTRS, elbows: [{ style: "A", qty: 4 }] }, { shape: "round" });
    expect(a.size).toBe("3");
    expect(a.elbows).toEqual([{ style: "45", qty: 4 }]);
    expect(DS_SIZES.round).toContain(a.size);
  });
  it("набор стены другой формы → та же стена, набор формы по умолчанию", () => {
    const a = changeDs({ ...DEFAULT_DS_ATTRS, wall: "sickle_hook" }, { shape: "round" });
    expect(wallOf(a.shape, a.wall)).toEqual({ wall: "wood", kit: "hinged_hook" });
    const b = changeDs({ ...DEFAULT_DS_ATTRS, wall: "brick_hook_hd" }, { shape: "round" });
    expect(b.wall).toBe("brick_hook_hd"); // fits both shapes
  });
  it("колена без записи — 3 × A по умолчанию движка", () => {
    expect(elbowsOf(DEFAULT_DS_ATTRS)).toEqual({ style: "A", qty: 3 });
    expect(elbowsOf({ shape: "round" })).toEqual({ style: "45", qty: 3 });
  });
});

describe("tapeIn: фут + дюймы", () => {
  it("дюймы и восьмые (основатель 08.11: до 1/8″)", () => {
    expect(tapeIn("25", "6")).toBe(306);
    expect(tapeIn("25", "")).toBe(300);
    expect(tapeIn("", "9")).toBe(9);
    expect(tapeIn("3", "5.5")).toBe(41.5);
  });
  it("непригодное — null", () => {
    for (const [f, i] of [["", ""], ["0", "0"], ["-1", "0"], ["2", "12"], ["x", "1"], ["2.5", "0"], ["501", "0"]]) expect(tapeIn(f!, i!)).toBeNull();
  });
});

describe("правки рисунка", () => {
  it("setRunAttrs: правка — один шаг истории, «Назад» возвращает; без изменений — тот же рисунок", () => {
    const next = setRunAttrs(D, "r1", { color: "brown" });
    expect(next.runs[0]!.attrs.color).toBe("brown");
    expect(setRunAttrs(D, "r1", { color: "white" })).toBe(D);
    expect(setRunAttrs(D, "nope", { color: "brown" })).toBe(D);
    const h = pushHistory({ past: [], future: [] }, D);
    expect(undo(h, next)?.d).toBe(D);
  });
  it("setDsAttrs: id, линия и место не меняются", () => {
    const next = setDsAttrs(D, "d1", { shape: "round" });
    expect(next.downspouts[0]).toMatchObject({ id: "d1", runId: "r1", atIn: 120, shape: "round", size: "3" });
  });
  it("setLength: рулетка → taped, длина в смете; линия на рисунке — той же длины (основатель 08.11); даунспот на той же доле; null → снова нарисовано", () => {
    const t = setLength(D, "r1", 306);
    expect(t.runs[0]!.a).toEqual([0, 0]);
    expect(t.runs[0]!.b).toEqual([306, 0]);
    expect(runLengthIn(t.runs[0]!)).toBe(306);
    expect(t.downspouts[0]!.atIn).toBe(153); // 120 of 240 → the same half of 306
    expect(toElements(t, "m1").find((e) => e.id === "r1")?.confidence).toBe("taped");
    expect(computeGutterParts(toMeasurement(t)).parts.find((p) => p.key.startsWith("gutter."))?.qty.toString()).toBe("25.5");
    expect(setLength(t, "r1", 306)).toBe(t);
    const back = setLength(t, "r1", null);
    expect("lengthIn" in back.runs[0]!).toBe(false);
    expect(back.runs[0]!.b).toEqual([306, 0]); // «по рисунку»: the line stays where it is
    expect(toElements(back, "m1").find((e) => e.id === "r1")?.confidence).toBe("drawn");
  });
  it("атрибуты и длина переживают запись в строки и обратно", () => {
    let d = setRunAttrs(D, "r1", { profile: "half_round", material: "copper" });
    d = setLength(d, "r1", 300);
    d = setDsAttrs(d, "d1", { wall: "brick", bottom: { kind: "splash_block" } });
    const back = fromElements(toElements(d, "m1"));
    expect(back.runs[0]).toMatchObject({ lengthIn: 300, attrs: { profile: "half_round", material: "copper", finish: "mill", hanger: "hr_shank_fascia" } });
    expect(back.downspouts[0]).toMatchObject({ wall: "brick", bottom: { kind: "splash_block" } });
  });
});

describe("рулетка двигает рисунок (основатель 08.11)", () => {
  const a = { ...run, id: "a", a: [0, 0] as [number, number], b: [240, 0] as [number, number] };
  const b = { ...run, id: "b", a: [240, 0] as [number, number], b: [240, 120] as [number, number] };
  const other = { ...run, id: "o", a: [0, 600] as [number, number], b: [240, 600] as [number, number] };
  it("500 ft и 40 ft больше не одной длины: конец b уходит по линии", () => {
    const t = setLength({ runs: [a], downspouts: [] }, "a", 6000);
    expect(t.runs[0]!.b).toEqual([6000, 0]);
  });
  it("то, что висит на конце, едет целиком — форма та же, угол не рвётся; чужой не трогается", () => {
    const t = setLength({ runs: [a, b, other], downspouts: [] }, "a", 360);
    expect(t.runs.find((x) => x.id === "b")!.a).toEqual([360, 0]);
    expect(t.runs.find((x) => x.id === "b")!.b).toEqual([360, 120]);
    expect(t.runs.find((x) => x.id === "o")).toEqual(other);
  });
  it("замкнутый контур: двигаются только соединённые концы", () => {
    const c = { ...run, id: "c", a: [240, 120] as [number, number], b: [0, 0] as [number, number] };
    const t = setLength({ runs: [a, b, c], downspouts: [] }, "a", 360);
    expect(t.runs.find((x) => x.id === "b")!.a).toEqual([360, 0]);
    expect(t.runs.find((x) => x.id === "b")!.b).toEqual([240, 120]);
    expect(t.runs.find((x) => x.id === "c")).toEqual(c);
  });
});

