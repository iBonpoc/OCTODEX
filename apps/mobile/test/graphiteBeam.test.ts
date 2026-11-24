import { describe, expect, it } from "vitest";
import {
  beamStart,
  beamWidth,
  beamX,
  nextBeamSlot,
  slotWidth,
} from "../src/features/showcase/graphite/beamMath";
import { parseGraphiteFlag } from "../src/features/showcase/graphite/flag";

/** «Графит» пилот #2254 — where the «Прожектор» beam stands (rule 27 (а)) */
describe("graphite beam", () => {
  const W = 358;
  const N = 5;
  const bw = beamWidth(W, N);
  it("slots are equal", () => expect(slotWidth(W, N)).toBeCloseTo(71.6, 5));
  it("centred over each slot", () => {
    for (let i = 0; i < N; i++)
      expect(beamX(i, W, N, bw) + bw / 2).toBeCloseTo(
        slotWidth(W, N) * (i + 0.5),
        5,
      );
  });
  it("never leaves the pill, even for a bad index or a wide beam", () => {
    expect(beamX(-3, W, N, bw)).toBeGreaterThanOrEqual(0);
    expect(beamX(99, W, N, bw) + bw).toBeLessThanOrEqual(W);
    expect(beamX(0, W, N, W)).toBe(0);
  });
  it("a zero-width pill (before layout) puts it at 0, no NaN", () => {
    expect(beamX(2, 0, N, bw)).toBe(0);
    expect(beamX(2, W, 0, bw)).toBe(0);
  });
  it("a tap on «＋» does not move the beam", () => {
    expect(nextBeamSlot(2, 0, 2, N)).toBe(0);
    expect(nextBeamSlot(3, 0, 2, N)).toBe(3);
    expect(nextBeamSlot(7, 1, 2, N)).toBe(1);
  });
});

describe("graphite pilot flag (off by default)", () => {
  it("only «1» turns it on", () => {
    expect(parseGraphiteFlag(null)).toBe(false);
    expect(parseGraphiteFlag("0")).toBe(false);
    expect(parseGraphiteFlag("true")).toBe(false);
    expect(parseGraphiteFlag("1")).toBe(true);
  });
});

import { toastPush } from "../src/features/showcase/graphite/toastMath";
import { alphaOf, rgbOf } from "../src/features/showcase/graphite/beamMath";

describe("graphite toasts (v2 §3 п.15: a stack of up to 3, new on top)", () => {
  it("new on top, the fourth pushes the oldest out", () => {
    let st: number[] = [];
    for (const i of [1, 2, 3, 4]) st = toastPush(st, i);
    expect(st).toEqual([4, 3, 2]);
  });
});

describe("graphite cone stops (rgba split for SVG)", () => {
  it("rgba → rgb + alpha; a hex stays whole", () => {
    expect(rgbOf("rgba(251,255,90,.34)")).toBe("rgb(251,255,90)");
    expect(alphaOf("rgba(251,255,90,.34)")).toBeCloseTo(0.34, 5);
    expect(rgbOf("#5F6100")).toBe("#5F6100");
    expect(alphaOf("#5F6100")).toBe(1);
  });
});

/** #2286: the beam does not fly in when the screen opens — the first place after the layout is taken at once */
describe("graphite beam: the first place (#2286)", () => {
  it("before any layout (width was 0) the beam jumps to its place, no glide", () => {
    expect(beamStart(0, 358, false)).toBe("jump");
  });
  it("a later move (a tap, or a new width) glides", () => {
    expect(beamStart(358, 358, false)).toBe("glide");
    expect(beamStart(358, 390, false)).toBe("glide");
  });
  it("with «уменьшить движение» the beam always jumps", () => {
    expect(beamStart(358, 358, true)).toBe("jump");
    expect(beamStart(0, 358, true)).toBe("jump");
  });
  it("no layout yet (width 0) is not a place to glide to: jump (to 0)", () => {
    expect(beamStart(0, 0, false)).toBe("jump");
  });
});

