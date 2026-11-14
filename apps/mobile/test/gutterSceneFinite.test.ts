/**
 * #1390: the app crashed on a pinch OUT («Сбой приложения», iPhone, build 1388). A number that is NaN or Infinity in what the canvas draws
 * (a path, a label's position, a transform) is not an error on the web but takes the native drawing down. The canvas is built many times a
 * second while a pinch changes the scale: every number of the scene must be finite at every scale, near and far.
 */
import { describe, expect, it } from "vitest";
import { buildScene, type SceneOpts } from "../src/modules/gutters/canvas/scene";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing, DrawnRun, P } from "../src/modules/gutters/geometry";

const run = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS }, ...o });
const opts = (view: { k: number; ox: number; oy: number }): SceneOpts => ({ view, viewport: { w: 390, h: 700 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `DS ${n}`, storyText: (n) => `эт ${n}`, dsPad: 10, faceOff: 8, cornerText: (_k, _s, d) => `${d}°`, lenWithStory: true, gridMinPx: 24 });

/** every number found anywhere in a value that is not finite (a path) */
function bad(v: unknown, path = "scene", out: string[] = []): string[] {
  if (typeof v === "number") { if (!Number.isFinite(v)) out.push(`${path}=${v}`); return out; }
  if (typeof v === "string") { if (/NaN|Infinity/.test(v)) out.push(`${path}="${v.slice(0, 60)}"`); return out; }
  if (Array.isArray(v)) { v.forEach((x, i) => bad(x, `${path}[${i}]`, out)); return out; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) bad(x, `${path}.${k}`, out);
  return out;
}

const DRAWINGS: Record<string, Drawing> = {
  "an L": { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 200])], downspouts: [] },
  "a closed box": { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 200]), run("c", [300, 200], [0, 200]), run("d", [0, 200], [0, 0])], downspouts: [] },
  "three ends at a point (a bay)": { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180]), run("c", [240, 0], [240, -180])], downspouts: [] },
  "a straight join and a short gutter": { runs: [run("a", [0, 0], [200, 0]), run("b", [200, 0], [400, 0]), run("c", [400, 0], [401, 0])], downspouts: [] },
  "a gutter of no length and two on one place": { runs: [run("a", [50, 50], [50, 50]), run("b", [0, 0], [300, 0]), run("c", [0, 0], [300, 0])], downspouts: [] },
  "a split corner and a downspout": { runs: [run("a", [0, 0], [300, 0], { attrs: { ...DEFAULT_RUN_ATTRS, openEnds: { b: true as const } } }), run("b", [300, 0], [300, 200], { attrs: { ...DEFAULT_RUN_ATTRS, openEnds: { a: true as const } } })], downspouts: [{ id: "d", runId: "a", atIn: 100, shape: "rect", size: "2x3", material: "aluminum", bottom: { kind: "extension" } } as never] },
  "two storeys": { runs: [run("a", [0, 0], [300, 0]), run("b", [300, 0], [300, 200], { attrs: { ...DEFAULT_RUN_ATTRS, story: 2 } })], downspouts: [] },
  "an acute corner": { runs: [run("a", [0, 0], [300, 0]), run("b", [0, 0], [280, 40])], downspouts: [] },
};

describe("the canvas is finite at every scale (#1390)", () => {
  // from the farthest pinch (the whole drawing a few px) to far in; the offsets too, as a pan during the pinch leaves them
  const SCALES = [1e-4, 1e-3, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 20, 100, 1000];
  const OFFSETS: [number, number][] = [[0, 0], [195, 350], [-5000, 5000], [1e5, -1e5]];
  for (const [name, d] of Object.entries(DRAWINGS)) {
    it(`${name}: no NaN, no Infinity in the scene`, () => {
      const found: string[] = [];
      for (const k of SCALES) for (const [ox, oy] of OFFSETS) {
        const problems = bad(buildScene(d, opts({ k, ox, oy })));
        if (problems.length) found.push(`k=${k} o=${ox},${oy}: ${problems.slice(0, 3).join("; ")}`);
      }
      expect(found.slice(0, 5)).toEqual([]);
    });
  }
});
