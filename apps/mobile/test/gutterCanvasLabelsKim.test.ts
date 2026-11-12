/**
 * #1185 (founder's «David Kim» sample, build 1152, docs/specs/img/founder-kim/ 2–3): zoomed out, the small elements' words
 * lay on each other and on the lines. A word now stands off every line; the ones that cannot (a tiny gutter next to others,
 * a corner's word) are hidden, a long gutter's length or the picked one's stays even over a line.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { layoutLabels, overlaps, segmentHitsBox, type LabelWant } from "../src/modules/gutters/canvas/labels";
import { buildScene, fitView } from "../src/modules/gutters/canvas/scene";
import { kim } from "./fixtures/kimSheet";

const boxOf = (l: { x: number; y: number; w: number; h: number }) => ({ x0: l.x - l.w / 2, y0: l.y - l.h / 2, x1: l.x + l.w / 2, y1: l.y + l.h / 2 });

describe("a segment and a box", () => {
  const q = { x0: 10, y0: 10, x1: 20, y1: 20 };
  it("crosses, touches inside, misses", () => {
    expect(segmentHitsBox([0, 15], [30, 15], q)).toBe(true);
    expect(segmentHitsBox([15, 0], [15, 30], q)).toBe(true);
    expect(segmentHitsBox([12, 12], [14, 14], q)).toBe(true);
    expect(segmentHitsBox([0, 0], [30, 5], q)).toBe(false);
    expect(segmentHitsBox([0, 25], [30, 25], q)).toBe(false);
    expect(segmentHitsBox([25, 0], [25, 30], q)).toBe(false);
    expect(segmentHitsBox([0, 0], [9, 9], q)).toBe(false);
  });
});

describe("words off the lines", () => {
  const vp = { w: 400, h: 400 };
  const want = (id: string, a: [number, number], b: [number, number], priority: number, must = false): LabelWant => ({ id, a, b, w: 60, h: 16, priority, ...(must ? { must } : {}) });
  it("a word beside its gutter does not stand on a neighbouring gutter", () => {
    const lines = [{ a: [100, 200] as [number, number], b: [300, 200] as [number, number] }, { a: [100, 222] as [number, number], b: [300, 222] as [number, number] }];
    const placed = layoutLabels([want("a", lines[0]!.a, lines[0]!.b, 5, true)], vp, 4, false, [], lines);
    expect(placed).toHaveLength(1);
    expect(lines.some((l) => segmentHitsBox(l.a, l.b, boxOf(placed[0]!)))).toBe(false);
  });
  it("a tiny gutter between two others with no clear place is hidden; a long one keeps its length", () => {
    const lines: { a: [number, number]; b: [number, number] }[] = [];
    for (let y = 80; y <= 330; y += 12) lines.push({ a: [40, y], b: [360, y] });
    const tiny = want("tiny", [200, 200], [204, 200], 1, false);
    const long = want("long", [40, 206], [360, 206], 9, true);
    const placed = layoutLabels([tiny, long], vp, 4, false, [], lines);
    expect(placed.map((p) => p.id)).toEqual(["long"]);
  });
  it("with no lines given it works as before (nothing hidden for them)", () => {
    const placed = layoutLabels([want("a", [100, 200], [100, 200], 1)], vp, 4);
    expect(placed).toHaveLength(1);
  });
});

describe("the founder's sample zoomed out", () => {
  const pts = kim.runs.flatMap((r) => [r.a, r.b]);
  for (const vp of [{ w: 390, h: 700 }, { w: 390, h: 420 }, { w: 820, h: 900 }]) {
    it(`${vp.w}×${vp.h}: labels clear of each other, a corner's word never on a line, a length on a line only when its gutter is long`, () => {
      const view = fitView(pts, vp, 40);
      const sc = buildScene(kim, { view, viewport: vp, fontSize: 14, padX: 4, gap: 4, lenWithStory: true, dsPad: 7, dsText: (n) => `D${n}`, storyText: (n) => `эт ${n}`, cornerText: (_k, _s, a) => `наруж. ${a}°` });
      expect(sc.labels.length).toBeGreaterThan(3);
      for (let i = 0; i < sc.labels.length; i++) for (let j = i + 1; j < sc.labels.length; j++) expect(overlaps(boxOf(sc.labels[i]!), boxOf(sc.labels[j]!)), `${sc.labels[i]!.text} / ${sc.labels[j]!.text}`).toBe(false);
      const lines = sc.runs.flatMap((r) => [{ a: r.a, b: r.b, len: Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) }]);
      for (const l of sc.labels) {
        const on = lines.filter((q) => segmentHitsBox(q.a, q.b, boxOf(l)));
        if (l.kind === "corner") expect(on, `the corner's word «${l.text}» is on a line`).toHaveLength(0);
        if (l.kind === "len") for (const q of on) expect(q.len >= l.w * 0.99 || sc.runs.some((r) => r.selected), `«${l.text}» on a short line`).toBe(true);
      }
    });
  }
});
