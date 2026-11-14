/**
 * #930: the layers of the canvas — a layer is hidden, not deleted. #932: the roof's overhang, 2 ft until said otherwise.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { buildScene, fitView } from "../src/modules/gutters/canvas/scene";
import { hitTest, withoutDs } from "../src/modules/gutters/canvas/edit";
import { choicesFor, DEFAULT_OVERHANG_FT, MODULE_CHOICES, OVERHANG_FT, readOverhangFt } from "../src/modules/gutters/settings";
import type { Drawing } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const d: Drawing = {
  runs: [{ id: "a", a: [0, 0], b: [600, 0], attrs }, { id: "b", a: [600, 0], b: [600, 400], attrs }],
  downspouts: [{ id: "d1", runId: "a", atIn: 300, shape: "rect", size: "2x3", material: "aluminum", elbows: [{ style: "A", qty: 1 }] } as never],
};
const vp = { w: 390, h: 600 };
const base = { view: fitView(d.runs.flatMap((r) => [r.a, r.b]), vp, 40), viewport: vp, fontSize: 14, padX: 4, gap: 4, dsPad: 7, dsText: (n: number) => `D${n}`, storyText: (n: number) => `эт ${n}`, gridMinPx: 24, cornerText: () => "наруж. 90°", lenWithStory: true };

describe("layers", () => {
  it("all on (or not said): the labels and the downspout are there (the grid is the screen's own layer, #1403)", () => {
    for (const layers of [undefined, { labels: true, ds: true }]) {
      const s = buildScene(d, { ...base, layers });
      expect(s.labels.length).toBeGreaterThan(0);
      expect(s.ds).toHaveLength(1);
      expect(s.runs).toHaveLength(2);
    }
  });
  it("each scene layer off hides only itself; the gutters stay", () => {
    const labels = buildScene(d, { ...base, layers: { labels: false } });
    expect(labels.labels).toEqual([]);
    expect(labels.runs).toHaveLength(2);
    const ds = buildScene(d, { ...base, layers: { ds: false } });
    expect(ds.ds).toEqual([]);
    expect(ds.labels.some((l) => l.id.startsWith("ds:"))).toBe(false);
    expect(ds.labels.some((l) => l.kind === "len")).toBe(true);
    expect(ds.runs).toHaveLength(2);
  });
  it("hidden, not deleted: the drawing is as it was, the layer comes back", () => {
    const before = JSON.stringify(d);
    buildScene(d, { ...base, layers: { labels: false, ds: false } });
    expect(JSON.stringify(d)).toBe(before);
    expect(buildScene(d, { ...base, layers: { ds: true } }).ds).toHaveLength(1);
  });
  it("a picked downspout under a hidden layer is not picked", () => {
    const s = buildScene(d, { ...base, selected: "d1", layers: { ds: false } });
    expect(s.runs.every((r) => !r.selected)).toBe(true);
    expect(s.ds).toEqual([]);
  });
});

describe("a hidden downspout cannot be touched (#930 review)", () => {
  // the downspout stands at 300 in of run «a»: the finger on it
  const onDs: [number, number] = [300, 0];
  it("with the layer on the touch picks the downspout (it is first); with it off — the gutter under it", () => {
    expect(hitTest(d, onDs, 20)).toMatchObject({ kind: "ds", id: "d1" });
    expect(hitTest(withoutDs(d, true), onDs, 20)).toMatchObject({ id: "a" });
    expect(hitTest(withoutDs(d, true), onDs, 20)?.kind).not.toBe("ds");
  });
  it("nothing else changes: the drawing is the same object when nothing is hidden, the gutters are the same when hidden", () => {
    expect(withoutDs(d, false)).toBe(d);
    expect(withoutDs(d, true).runs).toBe(d.runs);
    expect(withoutDs(d, true).downspouts).toEqual([]);
    expect(d.downspouts).toHaveLength(1);
  });
});

describe("the roof's overhang (#932)", () => {
  it("2 ft until the company says otherwise; a wrong stored value is 2 ft too", () => {
    expect(MODULE_CHOICES.roofOverhangFt).toBe(2);
    expect(DEFAULT_OVERHANG_FT).toBe(2);
    for (const bad of [undefined, null, "3", 7, -1, 2.25, NaN]) expect(readOverhangFt(bad), String(bad)).toBe(2);
  });
  it("every offered value is kept as it is", () => {
    for (const n of OVERHANG_FT) expect(choicesFor({ roofOverhangFt: n }).roofOverhangFt).toBe(n);
    expect(choicesFor({ roofOverhangFt: 0 }).roofOverhangFt).toBe(0);
  });
});
