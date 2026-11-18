/**
 * «Расход v2» PR-2 «Металлы и пайка» (docs/specs/33-gutters-consumption.md §5а; founder 16.11 §2.15 №14–16, №19): copper and zinc are
 * soldered (М1), a downspout joint 1 point (М2), ONE soldering kit with its make-up (М3–М6), the soldering work (М7), the fasteners'
 * metal (М8), expansion joints by metal (Ж6), the galvanic pair advice. Scenario numbers — §5а.
 */
import { describe, it, expect } from "vitest";
import { computeGutterParts, resolveGutterRules, type MeasuredRun, type MeasuredDownspout, type MeasurementInput, type PartQty } from "../src/gutterParts.js";

const run = (o: Partial<MeasuredRun> & { id: string; lengthIn: number }): MeasuredRun => ({
  profile: "k", size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden",
  ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R", ...o,
});
const ds = (o: Partial<MeasuredDownspout> & { id: string; runId: string }): MeasuredDownspout => ({
  shape: "rect", size: "3x4", dsStyle: "corrugated", material: "alu", color: "white", bottom: { kind: "extension" }, elbows: [{ style: "A", qty: 3 }], ...o,
});
const q = (parts: PartQty[], key: string) => parts.find((p) => p.key === key)?.qty;
const job = (runs: MeasuredRun[], downspouts: MeasuredDownspout[] = [], corners: MeasurementInput["corners"] = []): MeasurementInput => ({ runs, corners, downspouts });
const copper = { material: "copper", color: undefined } as const;
/** the parts of an aluminum and a steel job as version 5 (main before PR-2) counted them — rule 16: their keys and prices stay */
const V5_AL_STEEL: Record<string, string> = {
  "A:coil.k.6.alu_032.white": "70",
  "A:coil.k.6.steel.brown": "60",
  "A:gutter.k.6.alu_032.white": "60",
  "A:gutter.k.6.steel.brown": "50",
  "A:endcap.L.k.6.alu_032.white": "1",
  "A:endcap.L.k.6.steel.brown": "1",
  "A:endcap.R.k.6.alu_032.white": "1",
  "A:endcap.R.k.6.steel.brown": "1",
  "A:ds_strap.aluminum.rect.3x4": "2",
  "A:ds_strap.steel.rect.3x4": "2",
  "A:hanger.fascia_strap.aluminum.k.6": "31",
  "A:hanger.hidden.steel.k.6": "26",
  "A:ds.rect.3x4.corrugated.alu.white": "10",
  "A:ds.rect.3x4.corrugated.steel.brown": "10",
  "A:dsstick.rect.3x4.corrugated.alu.white": "1",
  "A:dsstick.rect.3x4.corrugated.steel.brown": "1",
  "A:elbow.A.rect.3x4.corrugated.alu.white": "3",
  "A:elbow.A.rect.3x4.corrugated.steel.brown": "3",
  "A:outlet.k.6.alu_032.white.rect.3x4": "1",
  "A:outlet.k.6.steel.brown.rect.3x4": "1",
  "A:bottom.extension.rect.3x4": "2",
  "A:anchor.masonry": "4",
  "A:rivet.42.aluminum.painted.white": "18",
  "A:rivet.42.steel.painted.brown": "18",
  "A:screw.10x15": "70",
  "A:screw.8x05": "8",
  "A:sealant": "1",
  "A:labor.downspout.story1": "2",
  "A:labor.install.story1": "110",
  "B:coil.k.6.alu_032.white": "70",
  "B:coil.k.6.steel.brown": "60",
  "B:gutter.k.6.alu_032.white": "60",
  "B:gutter.k.6.steel.brown": "50",
  "B:endcap.L.k.6.alu_032.white": "1",
  "B:endcap.L.k.6.steel.brown": "1",
  "B:endcap.R.k.6.alu_032.white": "1",
  "B:endcap.R.k.6.steel.brown": "1",
  "B:expjoint.k.6.alu_032.white": "1",
  "B:ds_strap.aluminum.rect.3x4": "2",
  "B:flat_coil": "3",
  "B:hanger.fascia_strap.aluminum.k.6": "31",
  "B:hanger.hidden.steel.k.6": "26",
  "B:ds.rect.3x4.corrugated.alu.white": "10",
  "B:ds.rect.3x4.corrugated.steel.brown": "10",
  "B:dsstick.rect.3x4.corrugated.alu.white": "1",
  "B:dsstick.rect.3x4.corrugated.steel.brown": "1",
  "B:elbow.A.rect.3x4.corrugated.alu.white": "3",
  "B:elbow.A.rect.3x4.corrugated.steel.brown": "3",
  "B:outlet.k.6.alu_032.white.rect.3x4": "1",
  "B:outlet.k.6.steel.brown.rect.3x4": "1",
  "B:bottom.extension.rect.3x4": "2",
  "B:anchor.masonry": "4",
  "B:rivet.42.aluminum.painted.white": "8",
  "B:rivet.42.steel.painted.brown": "8",
  "B:screw.10x15": "70",
  "B:screw.8x05": "28",
  "B:sealant": "1",
  "B:labor.downspout.story1": "2",
  "B:labor.install.story1": "110"
};

describe("пайка меди и цинка (М1–М7)", () => {
  it("С1: медный желоб 240″, 2 заглушки, медный водосток (ребристый, 3 × A, удлинитель): точки 3 + 5 стыков водостока = 8; один набор; работа = 8", () => {
    const i = job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r", ...copper })]);
    const { parts } = computeGutterParts(i);
    const kit = parts.find((p) => p.key === "soldering_kit")!;
    // version 5 (main): 3 points — 2 end caps and the outlet; the downspout's 5 joints (sticks, 3 elbows, the extension) were not soldered
    expect(kit.qty).toBe("1");
    expect(kit.use).toBe("both");
    expect(kit.why).toMatchObject({ rule: "soldering_kit", params: { points: 8, solderLb: 1, fluxCans: 1, gasCylinders: 1, abrasivePacks: 1, soda: 1 } });
    expect(q(parts, "labor.solder")).toBe("8");
    expect(q(parts, "solder")).toBeUndefined();
    expect(q(parts, "flux")).toBeUndefined();
    expect(parts.some((p) => p.attrs.part === "sealant")).toBe(false);
  });

  it("С1а: «copper_16oz» — медь: паяется, как её крепёж и компенсатор (ревью PR-2 №4)", () => {
    const { parts } = computeGutterParts(job([run({ id: "r", lengthIn: 240, material: "copper_16oz", color: undefined })]));
    expect(q(parts, "soldering_kit")).toBe("1");
    expect(parts.some((p) => p.attrs.part === "sealant")).toBe(false);
  });

  it("С2: цинковый желоб — пайка вместо герметика", () => {
    const { parts } = computeGutterParts(job([run({ id: "z", lengthIn: 240, material: "zinc", color: undefined })]));
    expect(q(parts, "soldering_kit")).toBe("1");
    expect(q(parts, "labor.solder")).toBe("2");
    expect(parts.some((p) => p.attrs.part === "sealant")).toBe(false);
  });

  it("С3: алюминий и сталь — снимок деталей версии 5 (движок main, 18.11): все ключи и количества те же, при двух наборах правил", () => {
    const j = job([run({ id: "a", lengthIn: 720, hanger: "fascia_strap" }), run({ id: "s", lengthIn: 600, material: "steel", color: "brown" })], [ds({ id: "d", runId: "a", wall: "stucco" }), ds({ id: "e", runId: "s", material: "steel", color: "brown" })]);
    const out: Record<string, string> = {};
    for (const over of [undefined, { dsJoin: "screw" as const, wallKitByWall: { rect: { wood: "coil_strap" } }, expansionJointPart: true }]) for (const p of computeGutterParts(j, over).parts) out[`${over ? "B:" : "A:"}${p.key}`] = p.qty;
    expect(out).toEqual(V5_AL_STEEL);
  });

  it("С3а: алюминиевый замер — набора и работы пайки нет, герметик есть, у винтов нет metal", () => {
    const { parts } = computeGutterParts(job([run({ id: "r", lengthIn: 240, hanger: "fascia_strap" })], [ds({ id: "d", runId: "r" })]));
    expect(q(parts, "soldering_kit")).toBeUndefined();
    expect(q(parts, "labor.solder")).toBeUndefined();
    expect(q(parts, "sealant")).toBeDefined();
    expect(parts.filter((p) => p.attrs.part === "screw" || p.attrs.part === "anchor").every((p) => p.attrs.metal === undefined)).toBe(true);
    expect(q(parts, "screw.10x15")).toBeDefined();
  });

  it("С4: dsJoin = screw — стыки медного водостока не паяются (только заглушки и выпуск)", () => {
    const i = job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r", ...copper })]);
    const { parts } = computeGutterParts(i, { dsJoin: "screw" });
    expect(parts.find((p) => p.key === "soldering_kit")!.why!.params.points).toBe(3);
    expect(q(parts, "labor.solder")).toBe("3");
    // the screws of those joints carry the copper's metal
    expect(q(parts, "screw.copper.8x05")).toBeDefined();
  });

  it("С5: нормы набора — 600 точек: 60 lb припоя, 15 банок флюса, 15 баллонов, 15 абразива, сода 1; нормы компании меняют числа", () => {
    // 300 end caps worth of points: 150 runs of copper with 2 caps each
    const runs = Array.from({ length: 300 }, (_, k) => run({ id: `r${k}`, lengthIn: 24, ...copper }));
    const kit = computeGutterParts(job(runs)).parts.find((p) => p.key === "soldering_kit")!;
    expect(kit.why!.params).toMatchObject({ points: 600, solderLb: 60, fluxCans: 15, gasCylinders: 15, abrasivePacks: 15, soda: 1 });
    const own = computeGutterParts(job(runs), { solderLbPerFluxCan: 10, solderPointsPerGas: 100, solderSodaPerJob: 0 }).parts.find((p) => p.key === "soldering_kit")!;
    expect(own.why!.params).toMatchObject({ fluxCans: 6, gasCylinders: 6, soda: 0 });
    // a blank field (0) never divides by 0: the default
    expect(resolveGutterRules({ solderLbPerFluxCan: 0, solderPointsPerGas: 0 })).toMatchObject({ solderLbPerFluxCan: 4, solderPointsPerGas: 40 });
  });

  it("С5а: М2 настройкой — 0 точек на стык водостока: паяются только заглушки и выпуск", () => {
    const i = job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r", ...copper })]);
    expect(computeGutterParts(i, { solderPointsPerDsJoint: 0 }).parts.find((p) => p.key === "soldering_kit")!.why!.params.points).toBe(3);
  });
});

describe("металл крепежа (М8)", () => {
  it("С6: медь — винты, анкеры и полоса хомута медные; цинк — нержавейка; алюминий — без metal, ключ прежний", () => {
    const strap = { wallKitByWall: { rect: { wood: "coil_strap", stucco: "ds_strap_masonry" } } };
    const cu = computeGutterParts(job([run({ id: "r", lengthIn: 240, hanger: "fascia_strap", ...copper })], [ds({ id: "d", runId: "r", ...copper }), ds({ id: "e", runId: "r", ...copper, wall: "stucco" })]), strap).parts;
    const fast = cu.filter((p) => ["screw", "anchor", "flat_coil"].includes(p.attrs.part ?? ""));
    expect(fast.length).toBeGreaterThan(2);
    expect(fast.every((p) => p.attrs.metal === "copper")).toBe(true);
    expect(cu.some((p) => p.attrs.part === "flat_coil")).toBe(true);
    expect(cu.some((p) => p.attrs.part === "anchor")).toBe(true);
    const zn = computeGutterParts(job([run({ id: "r", lengthIn: 240, hanger: "fascia_strap", material: "zinc", color: undefined })])).parts;
    expect(zn.filter((p) => p.attrs.part === "screw").every((p) => p.attrs.metal === "stainless")).toBe(true);
    const znDs = computeGutterParts(job([run({ id: "r", lengthIn: 240, material: "zinc", color: undefined })], [ds({ id: "d", runId: "r", material: "zinc", color: undefined }), ds({ id: "e", runId: "r", material: "zinc", color: undefined, wall: "stucco" })]), strap).parts;
    const znFast = znDs.filter((p) => ["screw", "anchor", "flat_coil"].includes(p.attrs.part ?? ""));
    expect(new Set(znFast.map((p) => p.attrs.part))).toEqual(new Set(["screw", "anchor", "flat_coil"]));
    expect(znFast.every((p) => p.attrs.metal === "stainless")).toBe(true);
    const al = computeGutterParts(job([run({ id: "r", lengthIn: 240, hanger: "fascia_strap" })], [ds({ id: "d", runId: "r" })]), strap).parts;
    expect(al.filter((p) => ["screw", "anchor", "flat_coil"].includes(p.attrs.part ?? "")).every((p) => p.attrs.metal === undefined)).toBe(true);
  });
});

describe("компенсатор по металлу (Ж6)", () => {
  it("С8: медь 50 ft → 1, цинк 40 ft → 1, сталь 80 ft → 0, алюминий 60 ft → 1; деталь — только при expansionJointPart", () => {
    const i = job([
      run({ id: "cu", lengthIn: 600, ...copper }),
      run({ id: "zn", lengthIn: 480, material: "zinc", color: undefined }),
      run({ id: "st", lengthIn: 960, material: "steel" }),
      run({ id: "al", lengthIn: 720 }),
    ]);
    const adv = computeGutterParts(i).advice.filter((a) => a.code === "expansion_joint");
    expect(adv).toEqual(expect.arrayContaining([{ code: "expansion_joint", runId: "cu", joints: 1 }, { code: "expansion_joint", runId: "zn", joints: 1 }, { code: "expansion_joint", runId: "al", joints: 1 }]));
    expect(adv.some((a) => a.runId === "st")).toBe(false);
    expect(computeGutterParts(i).parts.some((p) => p.attrs.part === "expansion_joint")).toBe(false);
    expect(computeGutterParts(i, { expansionJointPart: true }).parts.filter((p) => p.attrs.part === "expansion_joint")).toHaveLength(3);
  });

  it("старое expansionJointIn компании — шаг алюминия; своё по металлу главнее; неизвестный металл шага алюминия не получает", () => {
    expect(resolveGutterRules({ expansionJointIn: 360 }).expansionJointInByMetal).toMatchObject({ aluminum: 360, copper: 480, zinc: 396 });
    expect(resolveGutterRules({ expansionJointIn: 360, expansionJointInByMetal: { aluminum: 500 } }).expansionJointInByMetal.aluminum).toBe(500);
    expect(computeGutterParts(job([run({ id: "v", lengthIn: 2000, material: "vinyl" })])).advice.some((a) => a.code === "expansion_joint")).toBe(false);
    // a blank field (0) is the default, not «none» (review PR-2 №5)
    expect(resolveGutterRules({ expansionJointInByMetal: { aluminum: 0, copper: -1 } }).expansionJointInByMetal).toMatchObject({ aluminum: 600, copper: 480 });
  });
});

describe("разные металлы рядом (galvanic_pair)", () => {
  it("С9: медный желоб и алюминиевый водосток на нём — совет с обоими id; медь с медью — нет; у угла — тоже", () => {
    const pair = computeGutterParts(job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r" })])).advice;
    expect(pair).toContainEqual({ code: "galvanic_pair", ids: ["r", "d"], metals: ["copper", "aluminum"] });
    const same = computeGutterParts(job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r", ...copper })])).advice;
    expect(same.some((a) => a.code === "galvanic_pair")).toBe(false);
    const corner = computeGutterParts(job(
      [run({ id: "a", lengthIn: 240, ...copper, ends: [{ kind: "cap" }, { kind: "corner", cornerId: "c" }] }), run({ id: "b", lengthIn: 240, material: "steel", ends: [{ kind: "corner", cornerId: "c" }, { kind: "cap" }] })],
      [],
      [{ id: "c", kind: "out", method: "prefab", profile: "k", size: "6", material: "copper", story: 1 }],
    )).advice;
    expect(corner).toContainEqual({ code: "galvanic_pair", ids: ["a", "b"], metals: ["copper", "steel"] });
    // an unknown material (vinyl) is no metal: no advice (review PR-2 №5)
    expect(computeGutterParts(job([run({ id: "r", lengthIn: 240, ...copper })], [ds({ id: "d", runId: "r", material: "vinyl" })])).advice.some((a) => a.code === "galvanic_pair")).toBe(false);
    // aluminum with steel is not this advice (copper is the one that corrodes the others)
    const alSt = computeGutterParts(job([run({ id: "r", lengthIn: 240 })], [ds({ id: "d", runId: "r", material: "steel" })])).advice;
    expect(alSt.some((a) => a.code === "galvanic_pair")).toBe(false);
  });
});
