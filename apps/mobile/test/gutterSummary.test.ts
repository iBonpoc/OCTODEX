/**
 * #1274: what the summary chip says (founder 12.11). The pipes come from the engine's sticks (rule 8), not from our own arithmetic.
 */
import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { toMeasurement, type Drawing, type DrawnDownspout, type DrawnRun, type P } from "../src/modules/gutters/geometry";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { gutterFeet, pipeFeet, summaryOf } from "../src/modules/gutters/draw/summary";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, lengthIn?: number): DrawnRun => ({ id, a, b, attrs: { ...attrs }, ...(lengthIn !== undefined ? { lengthIn } : {}) });
const ds = (id: string, runId: string, atIn: number): DrawnDownspout => ({ ...DEFAULT_DS_ATTRS, id, runId, atIn }) as DrawnDownspout;
const A = run("a", [0, 0], [480, 0], 480); // 40 ft
const B = run("b", [480, 0], [480, 360], 360); // 30 ft
const parts = (d: Drawing) => computeGutterParts(toMeasurement(d)).parts;

describe("the summary chip", () => {
  it("nothing drawn: no chip", () => {
    expect(summaryOf({ runs: [], downspouts: [] }, [], null)).toBeNull();
  });
  it("gutters but no downspout yet: «Дальше: водостоки» with the gutters' total", () => {
    const d: Drawing = { runs: [A, B], downspouts: [] };
    expect(summaryOf(d, parts(d), null)).toEqual({ kind: "nextDs", gutterFt: 70 });
  });
  it("with downspouts: the gutters, the downspouts' count, the pipes in whole 10-ft sticks (the engine's)", () => {
    const d: Drawing = { runs: [A, B], downspouts: [ds("d1", "a", 24), ds("d2", "b", 24)] };
    const s = summaryOf(d, parts(d), null);
    expect(s).toMatchObject({ kind: "total", gutterFt: 70, dsCount: 2 });
    if (s?.kind !== "total") throw new Error("total expected");
    expect(s.pipeFt % 10).toBe(0); // 10-ft sticks: the pipes are a multiple of 10
    expect(s.pipeFt).toBeGreaterThanOrEqual(20); // two downspouts of a storey each: at least a stick apiece
    expect(s.pipeFt).toBe(Math.round(pipeFeet(parts(d))));
  });
  it("something picked: the chip says it, whatever else there is", () => {
    const d: Drawing = { runs: [A], downspouts: [ds("d1", "a", 24)] };
    expect(summaryOf(d, parts(d), { text: "Желоб · 40′", dsIcon: null })).toEqual({ kind: "selected", text: "Желоб · 40′", dsIcon: null });
  });
  it("the gutters' total counts a typed length, to whole feet", () => {
    expect(gutterFeet({ runs: [run("x", [0, 0], [100, 0], 149.6)] })).toBe(12); // 12′ 5⅝″ → 12 ft
  });
});

describe("the pipes in feet: sticks × the stick's length", () => {
  it("two sticks of 120″: 20 ft; a stick of 96″ (8 ft): 8 ft each", () => {
    const p = (qty: string, stickIn: string) => ({ key: "dsstick.rect.2x3.x", qty, attrs: { stickIn } });
    expect(pipeFeet([p("2", "120")])).toBe(20);
    expect(pipeFeet([p("3", "96")])).toBe(24);
    expect(pipeFeet([{ key: "gutter.k.5", qty: "40", attrs: {} }])).toBe(0);
  });
});
