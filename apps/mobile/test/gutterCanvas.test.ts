/** Холст замера Gutters, чистая часть (docs/specs/33-gutters-canvas.md П20): подписи без наложения, сцена, вид, замер скорости. */
import { describe, expect, it } from "vitest";
import { ftIn } from "../src/modules/gutters/canvas/format";
import { layoutLabels, overlaps, type LabelWant } from "../src/modules/gutters/canvas/labels";
import { buildScene, fitView, panBy, storyOf, toPlan, toScreen, zoomAt } from "../src/modules/gutters/canvas/scene";
import { fpsP90, fromHistogram, intervals, passes, pct, reportText } from "../src/modules/gutters/canvas/stats";
import { BENCH, benchDrawing } from "../src/modules/gutters/bench/benchScene";

const box = (l: { x: number; y: number; w: number; h: number }) => ({ x0: l.x - l.w / 2, y0: l.y - l.h / 2, x1: l.x + l.w / 2, y1: l.y + l.h / 2 });
const opts = (vp = { w: 390, h: 700 }) => ({ viewport: vp, fontSize: 11, padX: 4, gap: 4, dsText: (n: number) => `DS ${n}`, storyText: (n: number) => `эт ${n}` });

describe("ftIn: US feet and inches", () => {
  it.each([[0, "0″"], [9, "9″"], [96, "8′"], [150, "12′ 6″"], [149.6, "12′ 5⅝″"], [149.95, "12′ 5 15/16″"], [149.98, "12′ 6″"]])("%s → %s", (i, s) => expect(ftIn(i)).toBe(s));
});

describe("labels never overlap", () => {
  it("150 labels of the bench at 390: every placed pair is apart and inside the screen", () => {
    const { drawing, marks } = benchDrawing();
    const view = fitView(drawing.runs.flatMap((r) => [r.a, r.b]), { w: 390, h: 700 }, 24);
    const s = buildScene(drawing, { ...opts(), view, extra: marks.map((m) => ({ id: m.id, at: m.at, text: `эт ${m.story}`, kind: "story" as const })) });
    expect(s.labels.length).toBeGreaterThan(0);
    for (let i = 0; i < s.labels.length; i++) {
      const b = box(s.labels[i]!);
      expect(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 390 && b.y1 <= 700).toBe(true);
      for (let j = i + 1; j < s.labels.length; j++) expect(overlaps(b, box(s.labels[j]!)), `${s.labels[i]!.id} × ${s.labels[j]!.id}`).toBe(false);
    }
  });
  it("a longer line keeps its label when two compete for one place", () => {
    const w = (id: string, priority: number): LabelWant => ({ id, a: [100, 100], b: [100, 100], w: 60, h: 16, priority });
    const out = layoutLabels([w("short", 1), w("long", 9)], { w: 130, h: 130 }, 4);
    expect(out[0]!.id).toBe("long");
  });
  it("the label sits beside its line, not on it", () => {
    const [l] = layoutLabels([{ id: "x", a: [50, 200], b: [350, 200], w: 40, h: 16, priority: 1 }], { w: 400, h: 400 }, 4);
    expect(Math.abs(l!.y - 200)).toBeGreaterThanOrEqual(8 + 4);
  });
  it("the canvas: with MORE THAN ONE storey a run's label carries its storey (О3: colour + word); with one it is just the length (#1275)", () => {
    const run = (id: string, y: number, story: number) => ({ id, a: [0, y] as [number, number], b: [150, y] as [number, number], attrs: { story } as never });
    const two = buildScene({ runs: [run("r1", 0, 1), run("r2", 300, 2)], downspouts: [] }, { ...opts(), view: fitView([[0, 0], [150, 300]], { w: 390, h: 700 }, 24), lenWithStory: true });
    expect(two.labels.map((l) => l.text).sort()).toEqual(["12′ 6″ · эт 1", "12′ 6″ · эт 2"]);
    const one = buildScene({ runs: [run("r", 0, 2)], downspouts: [] }, { ...opts(), view: fitView([[0, 0], [150, 0]], { w: 390, h: 700 }, 24), lenWithStory: true });
    expect(one.labels.map((l) => l.text)).toEqual(["12′ 6″"]);
  });
  it("keepAll (bench): all 150 labels are drawn", () => {
    const { drawing, marks } = benchDrawing();
    const view = fitView(drawing.runs.flatMap((r) => [r.a, r.b]), { w: 390, h: 700 }, 24);
    const s = buildScene(drawing, { ...opts(), view, keepAll: true, extra: marks.map((m) => ({ id: m.id, at: m.at, text: "эт 1", kind: "story" as const })) });
    expect(s.labels.length).toBe(150);
  });
});

describe("bench drawing: the founder's load (§9)", () => {
  it("50 lines, 40 downspouts, 60 storey marks; storeys 1–4", () => {
    const { drawing, marks } = benchDrawing();
    expect([drawing.runs.length, drawing.downspouts.length, marks.length]).toEqual([50, 40, 60]);
    expect(BENCH.houses * (BENCH.runsPerHouse + BENCH.dsPerHouse + BENCH.marksPerHouse)).toBe(150);
    expect(new Set(drawing.runs.map((r) => r.attrs.story))).toEqual(new Set([1, 2, 3, 4]));
    expect(drawing.runs.every((r) => r.a.every(Number.isInteger) && r.b.every(Number.isInteger))).toBe(true);
  });
  it("is the same every time", () => expect(benchDrawing()).toEqual(benchDrawing()));
});

describe("view: north up, pan, zoom about the fingers", () => {
  const v = fitView([[0, 0], [480, 240]], { w: 400, h: 300 }, 20);
  it("fits with the margin and keeps north up", () => {
    const [x0, y0] = toScreen(v, [0, 240]);
    const [x1, y1] = toScreen(v, [480, 0]);
    expect(x0).toBeCloseTo(20);
    expect(x1).toBeCloseTo(380);
    expect(y0).toBeLessThan(y1);
  });
  it("toPlan undoes toScreen", () => expect(toPlan(v, toScreen(v, [123, 45]))).toEqual([expect.closeTo(123), expect.closeTo(45)]));
  it("the point under the fingers stays put while zooming", () => {
    const p = toPlan(v, [150, 120]);
    const z = zoomAt(v, 2.5, 150, 120);
    expect(toScreen(z, p)).toEqual([expect.closeTo(150), expect.closeTo(120)]);
    expect(toScreen(panBy(z, 10, -5), p)).toEqual([expect.closeTo(160), expect.closeTo(115)]);
  });
  it("storey: 1..4, 4 and up is 4, unknown is 1", () => expect([0, 1, 2, 3, 4, 7, "x"].map(storyOf)).toEqual([1, 1, 2, 3, 4, 4, 1]));
});

describe("speed numbers (§9 thresholds)", () => {
  it("p90 and fps", () => {
    expect(pct([5, 1, 4, 2, 3, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(fpsP90(Array(90).fill(1000 / 60).concat(Array(10).fill(50)))).toBeCloseTo(60);
    expect(fpsP90(Array(80).fill(1000 / 60).concat(Array(20).fill(25)))).toBeCloseTo(40);
    expect(fpsP90([])).toBeNaN();
  });
  it("histogram and stamps → intervals", () => {
    expect(fromHistogram([0, 0, 2, 1])).toEqual([2, 2, 3]);
    expect(intervals([0, 16, 33, 50])).toEqual([16, 17, 17]);
  });
  it("pass: fps at or above, ms below", () => {
    expect([passes("pan", 55), passes("pan", 54.9), passes("drag", 50), passes("tap", 99), passes("tap", 100), passes("open", NaN)]).toEqual([true, false, true, true, false, false]);
  });
  it("the report the founder sends", () => {
    const t = reportText([{ key: "pan", value: 58.4, samples: 240 }, { key: "tap", value: 120, samples: 20 }], "iPhone 11 · iOS 18", (ok) => (ok ? "прошло" : "не прошло"), (k) => k);
    expect(t).toBe("iPhone 11 · iOS 18\npan: 58 fps (≥ 55) — прошло · n=240\ntap: 120 ms (< 100) — не прошло · n=20");
  });
});

describe("a downspout's label stays off its mark (spec 33 П20.8)", () => {
  it("a point label with pad: its box does not touch the mark's circle", () => {
    const r = 12;
    const want: LabelWant[] = [{ id: "ds", a: [200, 300], b: [200, 300], w: 30, h: 16, priority: 1, pad: r }];
    const [l] = layoutLabels(want, { w: 390, h: 700 }, 4);
    // the nearest point of the label's box to the mark's centre is farther than the radius
    const nx = Math.max(l!.x - l!.w / 2, Math.min(200, l!.x + l!.w / 2));
    const ny = Math.max(l!.y - l!.h / 2, Math.min(300, l!.y + l!.h / 2));
    expect(Math.hypot(nx - 200, ny - 300)).toBeGreaterThan(r);
  });
  it("buildScene passes dsPad to the downspout's label: its fittings word over the mark, «D1» inside (founder 08.11)", () => {
    const d = { runs: [{ id: "r", a: [0, 0] as [number, number], b: [240, 0] as [number, number], attrs: { story: 1 } }], downspouts: [{ id: "s", runId: "r", atIn: 120 }] };
    const s = buildScene(d as never, { ...opts(), view: { k: 1, ox: 50, oy: 300 }, dsPad: 12, dsText: (n) => `В${n}` });
    const l = s.labels.find((x) => x.kind === "ds")!;
    expect(l.text).toBe("AAA"); // unset elbows: the engine's default 3 × A
    expect(s.ds[0]!.text).toBe("В1");
    expect(Math.abs(l.y - s.ds[0]!.at[1])).toBeGreaterThan(12);
  });
});

describe("no label covers a downspout's mark (spec 33 П20.8)", () => {
  it("a run's length label moves off the mark in its middle", () => {
    const d = { runs: [{ id: "r", a: [0, 0] as [number, number], b: [240, 0] as [number, number], attrs: { story: 1 } }], downspouts: [{ id: "s", runId: "r", atIn: 120 }] };
    const s = buildScene(d as never, { ...opts(), view: { k: 1, ox: 50, oy: 300 }, dsPad: 12 });
    const [mx, my] = s.ds[0]!.at;
    for (const l of s.labels) {
      const nx = Math.max(l.x - l.w / 2, Math.min(mx, l.x + l.w / 2));
      const ny = Math.max(l.y - l.h / 2, Math.min(my, l.y + l.h / 2));
      expect(Math.hypot(nx - mx, ny - my), l.text).toBeGreaterThan(12);
    }
  });
  it("a short run with a mark in its middle still shows its length (no room off the mark)", () => {
    const d = { runs: [{ id: "r", a: [0, 0] as [number, number], b: [110, 0] as [number, number], attrs: { story: 1 } }], downspouts: [{ id: "s", runId: "r", atIn: 55 }] };
    const s = buildScene(d as never, { ...opts(), view: { k: 1, ox: 50, oy: 300 }, dsPad: 12 });
    expect(s.labels.some((l) => l.kind === "len")).toBe(true);
  });
  it("the bench path (keepAll) with marks: every label still placed", () => {
    const want: LabelWant[] = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, a: [100, 100] as [number, number], b: [100, 100] as [number, number], w: 30, h: 14, priority: i }));
    const out = layoutLabels(want, { w: 200, h: 200 }, 4, true, [{ at: [100, 100], r: 12 }]);
    expect(out).toHaveLength(20);
  });
});
