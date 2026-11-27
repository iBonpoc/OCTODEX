/** #3066 (founder 27.11: «нажимаю на угол — выделяется не угол, а весь gutter»): a corner picked on its own is marked in the scene; no gutter is. */
import { describe, expect, it } from "vitest";
import { drawing } from "@octo/design-tokens";
import { buildScene } from "../src/modules/gutters/canvas/scene";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing, DrawnRun, P } from "../src/modules/gutters/geometry";

const run = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS } });
const d: Drawing = { runs: [run("a", [0, 0], [240, 0]), run("b", [240, 0], [240, 180])], downspouts: [] };
const scene = (o: { selected?: string | null; pickedCorner?: string | null }) =>
  buildScene(d, { view: { k: 1, ox: 100, oy: 1000 }, viewport: { w: 2000, h: 2000 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}`, ...o });

describe("a picked corner (#3066)", () => {
  it("the corner is picked, no gutter is", () => {
    const id = scene({}).corners[0]!.id;
    const s = scene({ selected: null, pickedCorner: id });
    expect(s.corners[0]!.picked).toBe(true);
    expect(s.corners[0]!.handle).toBe(false);
    expect(s.runs.every((r) => !r.selected)).toBe(true);
  });
  it("nothing picked — no mark; a gutter picked — its joint is the drag handle, not a picked corner", () => {
    expect(scene({}).corners[0]!.picked).toBeUndefined();
    const g = scene({ selected: "a" }).corners[0]!;
    expect(g.handle).toBe(true);
    expect(g.picked).toBeUndefined();
  });
});

describe("the degrees of a picked corner (#3078)", () => {
  it("stand off its ring: never closer to the corner than the ring (zoomed out — no arc to keep them off)", () => {
    const id = scene({}).corners[0]!.id;
    const s = buildScene(d, { view: { k: 0.1, ox: 100, oy: 1000 }, viewport: { w: 2000, h: 2000 }, fontSize: 11, padX: 4, gap: 4, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}`, cornerText: (_k, _s, a) => `${a}°`, pickedCorner: id });
    const k = s.corners[0]!;
    const l = s.labels.find((x) => x.kind === "corner")!;
    const ring = drawing.dsR * 2 + drawing.labelGap * 2;
    // the nearest point of the label's box to the corner is past the ring
    const dx = Math.max(Math.abs(l.x - k.at[0]) - l.w / 2, 0), dy = Math.max(Math.abs(l.y - k.at[1]) - l.h / 2, 0);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(ring - 1);
  });
});
