import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { boughtElbowCounts, boughtElbowPatch, changeDs, dsCode, dsStoryPatch, dsStoryShown, elbowCounts, type DsAttrs } from "../src/modules/gutters/canvas/attrs";
import { DEFAULT_DS_ATTRS, fromElements, toElements, type ElementRow } from "../src/modules/gutters/canvas/model";
import { MODULE_CHOICES, newDsAttrs } from "../src/modules/gutters/settings";
import { toMeasurement, type Drawing, type DrawnDownspout } from "../src/modules/gutters/geometry";

/** G2 (#2412, v43; leader №24's decision on stage 0): the window's model of elbows, the storey, the new defaults; rule 16 on reload */

const plain: DsAttrs = { ...DEFAULT_DS_ATTRS, dsStyle: "plain" };
const apply = (a: DsAttrs, p: Partial<DsAttrs>) => changeDs(a, p);
const bends = (a: DsAttrs) => {
  const d: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: { profile: "k", size: "5", material: "aluminum", color: "white", story: 1, mount: "fascia", hanger: "hidden" } }], downspouts: [{ ...a, id: "d", runId: "r", atIn: 120 } as DrawnDownspout] };
  const ps = computeGutterParts(toMeasurement(d)).parts;
  return { bends: ps.find((p) => p.key === "labor.bend")?.qty, elbows: ps.filter((p) => p.attrs.part === "elbow").map((p) => `${p.key}=${p.qty}`) };
};

describe("G2: a plain one — the window counts bought elbows, the estimate the bends", () => {
  it("a new plain one: 0 bought in the window, 3 bends in the estimate", () => {
    expect(boughtElbowCounts(plain)).toEqual({ A: 0, B: 0 });
    expect(bends(plain)).toEqual({ bends: "3", elbows: [] });
  });
  it("«+» → ready-made: 1 elbow A bought, no bends", () => {
    const p = boughtElbowPatch(plain, "A", 1);
    expect(p).toEqual({ elbows: [{ style: "A", qty: 1 }], elbowBend: "ready" });
    const a = apply(plain, p);
    expect(boughtElbowCounts(a)).toEqual({ A: 1, B: 0 });
    expect(bends(a)).toEqual({ bends: undefined, elbows: ["elbow.A.rect.2x3.plain.aluminum.white=1"] });
  });
  it("«−» back to 0 → bent on site again: the keys gone, the bends back", () => {
    const one = apply(plain, boughtElbowPatch(plain, "A", 1));
    const zero = apply(one, boughtElbowPatch(one, "A", 0));
    expect(JSON.parse(JSON.stringify(zero))).not.toHaveProperty("elbows");
    expect(JSON.parse(JSON.stringify(zero))).not.toHaveProperty("elbowBend");
    expect(bends(zero)).toEqual({ bends: "3", elbows: [] });
  });
  it("a corrugated one: its 3 × A are bought; to 0 stays 0 (no bends on a corrugated one)", () => {
    const c: DsAttrs = { ...DEFAULT_DS_ATTRS, dsStyle: "corrugated" };
    expect(boughtElbowCounts(c)).toEqual({ A: 3, B: 0 });
    expect(boughtElbowPatch(c, "A", 0)).toEqual({ elbows: [{ style: "A", qty: 0 }] });
  });
  it("an angle of a bought style stays with it when its count changes", () => {
    const a: DsAttrs = { ...plain, elbowBend: "ready", elbows: [{ style: "A", qty: 1, angle: 60 }] };
    expect(boughtElbowPatch(a, "A", 2)).toEqual({ elbows: [{ style: "A", qty: 2, angle: 60 }], elbowBend: "ready" });
  });
  it("the mark and the work drawing still say the bends of a plain one bent on site (elbowCounts), also an old [] bent on site", () => {
    expect(elbowCounts(plain)).toEqual({ A: 3, B: 0 });
    expect(dsCode(plain)).toBe("AAA");
    expect(elbowCounts({ ...plain, elbowBend: "field", elbows: [{ style: "A", qty: 0 }] })).toEqual({ A: 3, B: 0 });
  });
  it("plain ↔ corrugated drops elbowBend (п.7): the kind's own bending", () => {
    const ready = apply(plain, boughtElbowPatch(plain, "A", 2));
    expect(apply(ready, { dsStyle: "corrugated" }).elbowBend).toBeUndefined();
    const field = { ...plain, elbowBend: "field" as const };
    expect(apply(field, { dsStyle: "corrugated" }).elbowBend).toBeUndefined();
  });
  it("rect → round: the count stays, an angle and an offset style go (a round one has neither)", () => {
    const a: DsAttrs = { ...DEFAULT_DS_ATTRS, dsStyle: "corrugated", elbows: [{ style: "A", qty: 2, angle: 60 }], offsets: [{ lengthIn: 2, qty: 1, style: "B" }] };
    const r = apply(a, { shape: "round" });
    expect(r.elbows).toEqual([{ style: "75", qty: 2 }]);
    expect(r.offsets).toEqual([{ lengthIn: 2, qty: 1 }]);
  });
});

describe("G2: a downspout's storey", () => {
  it("written only when it differs from its gutter's", () => {
    expect(dsStoryPatch(1, 2)).toEqual({ story: 2 });
    expect(dsStoryPatch(2, 2)).toEqual({ story: undefined });
    expect(dsStoryShown({}, 2)).toBe(2);
    expect(dsStoryShown({ story: 3 }, 1)).toBe(3);
  });
});

describe("G2: new defaults, rule 16 on a reload", () => {
  it("a new downspout has nothing at the bottom (the module's and the company's default)", () => {
    expect(DEFAULT_DS_ATTRS.bottom).toEqual({ kind: "none" });
    expect(newDsAttrs(MODULE_CHOICES).bottom).toEqual({ kind: "none" });
  });
  it("a stored element without a bottom is read as before — an extension", () => {
    const row: ElementRow = { id: "d", measurementId: "m", kind: "downspout", geom: { runId: "r", atIn: 10 }, attrs: { shape: "rect", size: "2x3", material: "aluminum" }, confidence: "drawn" };
    const run: ElementRow = { id: "r", measurementId: "m", kind: "run", geom: { a: [0, 0], b: [100, 0] }, attrs: {}, confidence: "drawn" };
    expect(fromElements([run, row]).downspouts[0]!.bottom).toEqual({ kind: "extension" });
  });
  it("the new keys (angle, offset style, storey) live through a save and a reload — and keys this build does not know too", () => {
    const d: Drawing = {
      runs: [{ id: "r", a: [0, 0], b: [100, 0], attrs: { profile: "k", size: "5", material: "aluminum", story: 1, mount: "fascia", hanger: "hidden" } }],
      downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d", runId: "r", atIn: 10, story: 2, elbows: [{ style: "A", qty: 1, angle: 60 }], offsets: [{ lengthIn: 2, qty: 1, style: "B" }], futureKey: "x" } as DrawnDownspout],
    };
    const back = fromElements(JSON.parse(JSON.stringify(toElements(d, "m"))) as ElementRow[]).downspouts[0] as DrawnDownspout & { futureKey?: string };
    expect([back.story, back.elbows, back.offsets, back.futureKey]).toEqual([2, [{ style: "A", qty: 1, angle: 60 }], [{ lengthIn: 2, qty: 1, style: "B" }], "x"]);
  });
});
