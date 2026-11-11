import { describe, expect, it } from "vitest";
import { buildScene } from "../src/modules/gutters/canvas/scene";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing, DrawnRun, P } from "../src/modules/gutters/geometry";

/** #933: a corner's chip on the canvas says the angle between the walls, not only the word. */
const run = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS } });
const scene = (d: Drawing) =>
  buildScene(d, { view: { k: 1, ox: 100, oy: 1000 }, viewport: { w: 2000, h: 2000 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}`, cornerText: (k, _s, a) => `${k} ${a}°`, faceOff: 8 });
const chip = (d: Drawing) => scene(d).labels.filter((l) => l.kind === "corner").map((l) => l.text);

describe("the corner's chip says the angle", () => {
  it("a right angle: 90°", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180])], downspouts: [] };
    expect(scene(d).corners[0]!.angleDeg).toBe(90);
    expect(chip(d)).toHaveLength(1);
    expect(chip(d)[0]).toMatch(/ 90°$/);
  });
  it("a skew corner: not 90 — the angle between the walls (a 45° turn is 135°)", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [410, 170])], downspouts: [] };
    const a = scene(d).corners[0]!.angleDeg;
    expect(a).toBe(135);
    expect(chip(d)[0]).toMatch(/ 135°$/);
  });
  it("no chip function (the speed bench) → no corner chips, as before", () => {
    const d: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180])], downspouts: [] };
    const s = buildScene(d, { view: { k: 1, ox: 100, oy: 1000 }, viewport: { w: 2000, h: 2000 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}` });
    expect(s.labels.filter((l) => l.kind === "corner")).toHaveLength(0);
  });
});
