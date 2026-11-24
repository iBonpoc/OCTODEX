import { describe, expect, it } from "vitest";
import {
  behindScale,
  detents,
  dragHeight,
  release,
} from "../src/features/showcase/graphite/sheetMath";

/** «Графит» пилот #2254 — the sheet's arithmetic (rule 27 (а); handoff §2.7–§2.8) */
describe("graphite sheet detents", () => {
  it("on the prototype's 844 pt: ¼ 211, ½ 422, full 776 (844 − 60 − 8)", () =>
    expect(detents(844)).toEqual({ quarter: 211, half: 422, full: 776 }));
  it("scale with the screen", () => expect(detents(932).half).toBe(466));
});

describe("graphite sheet drag (finger 1:1, past the top 1:4, never below 0)", () => {
  it("follows the finger 1:1 under the top", () => {
    expect(dragHeight(422, 100, 776)).toBe(322);
    expect(dragHeight(422, -100, 776)).toBe(522);
  });
  it("no jump at the top detent: continuous at the edge", () => {
    expect(dragHeight(422, 422 - 776, 776)).toBe(776);
    expect(dragHeight(422, 422 - 776 - 0.001, 776)).toBeCloseTo(776, 2);
  });
  it("past the top only a quarter of the travel", () =>
    expect(dragHeight(776, -40, 776)).toBe(786));
  it("never below 0", () => expect(dragHeight(211, 500, 776)).toBe(0));
});

describe("graphite sheet release", () => {
  const stops = [422];
  it("a fast flick down closes, wherever it is", () =>
    expect(release(420, 0.6, stops, 422)).toBe(0));
  it("a slow drag just under the edge (0.5 pt/ms) does not close", () =>
    expect(release(400, 0.5, stops, 422)).toBe(422));
  it("below 30 % of the opened height closes", () =>
    expect(release(422 * 0.29, 0, stops, 422)).toBe(0));
  it("above 30 %, standing still, goes back to ½", () =>
    expect(release(200, 0, stops, 422)).toBe(422));
  it("the 150 ms projection can carry it under 30 % and close it", () =>
    expect(release(180, 0.45, stops, 422)).toBe(0));
  it("with two detents the nearest of the projection wins", () => {
    expect(release(700, -0.2, [422, 776], 422)).toBe(776);
    expect(release(500, 0.1, [422, 776], 422)).toBe(422);
  });
});

describe("graphite scene behind the sheet", () => {
  const d = detents(844);
  it("does not shrink up to ½", () => expect(behindScale(422, d)).toBe(1));
  it("shrinks to 0.96 at full, linearly between", () => {
    expect(behindScale(776, d)).toBeCloseTo(0.96, 5);
    expect(behindScale((422 + 776) / 2, d)).toBeCloseTo(0.98, 5);
  });
});
