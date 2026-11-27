/**
 * #2988 (founder 27.11: «поворот на 360 на чертеже… двумя пальцами… не только приближать-отдалять, но и крутить его по оси»; spec 33 П39
 * stage 1; rule 27 — the math of a gesture tested before the phone). The canvas layer is turned by θ about the canvas's centre; inside it the
 * pinch and the pan run as before (`gestureState.ts`). Checked on sequences of frames as RNGH sends them:
 *  - the plan point under the fingers stays under them while they pinch, turn and move TOGETHER (60 frames), whatever θ it began at;
 *  - a finger on a turned view hits the plan point drawn under it (`toInner` ∘ `toOuter`);
 *  - the turn begins only past the threshold and without a jump (`rotFrame` of stage 0 wired in);
 *  - a whole turn (360°) comes back to the same picture; the angle stays in (−π, π];
 *  - «Север вверх» (θ → 0 about the centre) keeps the plan point at the centre where it was;
 *  - the pinch's limits are the same turned (the scale does not depend on θ);
 *  - the drawn layers reach the corners of a turned canvas (`turnPad`).
 */
import { describe, expect, it } from "vitest";
import { idleState, pinchFrame, panFrame, type LiveState } from "../src/modules/gutters/canvas/gestureState";
import { idleRot, rotFrame, ROT_START_DEG } from "../src/modules/gutters/canvas/viewRotate";
import { innerDelta, labelTurnDeg, panIn, pinchIn, toInner, toOuter, turnPad, turnShift, turnStep, turned } from "../src/modules/gutters/canvas/outerTurn";

const W = 390, H = 700, CX = W / 2, CY = H / 2;
const RAD = Math.PI / 180;
/** the committed inner view (plan → inner frame) */
const view = { k: 4, ox: 60, oy: 500 };
/** a plan point → the screen, through the view, the live transform and the turned layer */
const screenOf = (st: LiveState, th: number, x: number, y: number) => {
  const ix = x * view.k + view.ox, iy = -y * view.k + view.oy;
  return toOuter(th, CX, CY, st.S * ix + st.Tx, st.S * iy + st.Ty);
};
/** a screen point → the plan (what a finger hits) */
const planOf = (st: LiveState, th: number, sx: number, sy: number) => {
  const p = toInner(th, CX, CY, sx, sy);
  const ix = (p.x - st.Tx) / st.S, iy = (p.y - st.Ty) / st.S;
  return { x: (ix - view.ox) / view.k, y: -(iy - view.oy) / view.k };
};
const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) < eps;

describe("the turned layer: screen ↔ inner", () => {
  it("toInner undoes toOuter, at any angle", () => {
    for (const th of [0, 0.3, -1.2, Math.PI, 2.9]) {
      const s = toOuter(th, CX, CY, 33, 410);
      expect(near(toInner(th, CX, CY, s.x, s.y), { x: 33, y: 410 })).toBe(true);
    }
  });
  it("a finger on a turned view hits the plan point drawn under it", () => {
    const st = { ...idleState(), S: 1.7, Tx: -40, Ty: 25 };
    for (const th of [0.5, -2, Math.PI / 2]) {
      const s = screenOf(st, th, 12.5, 30);
      expect(near(planOf(st, th, s.x, s.y), { x: 12.5, y: 30 }, 1e-9)).toBe(true);
    }
  });
  it("the centre stays where it is at any angle («север вверх» turns about it: no shift)", () => {
    expect(near(toOuter(1.1, CX, CY, CX, CY), { x: CX, y: CY })).toBe(true);
  });
  it("a shift turned back and on again is the same shift", () => {
    const d = innerDelta(0.8, 10, -4);
    const back = innerDelta(-0.8, d.x, d.y);
    expect(near(back, { x: 10, y: -4 })).toBe(true);
  });
});

describe("pinch, turn and pan together: the point under the fingers stays (60 frames)", () => {
  for (const th0 of [0, 0.4, -2.5]) {
    it(`starting at ${Math.round((th0 * 180) / Math.PI)}°`, () => {
      const st = idleState();
      let th = th0;
      const rs = idleRot();
      // the fingers come down at A; the plan point there
      let ax = 140, ay = 380;
      const held = planOf(st, th, ax, ay);
      for (let i = 0; i < 60; i++) {
        // the fingers: spread (×1.01 a frame), turn (1.5° a frame) and move (2, −1 px a frame) — all at once
        const dx = 2, dy = -1;
        ax += dx;
        ay += dy;
        panFrame(st, panIn(th, { changeX: dx, changeY: dy, numberOfPointers: 2 }), 2);
        pinchFrame(st, pinchIn(th, CX, CY, { scaleChange: 1.01, numberOfPointers: 2, focalX: ax, focalY: ay }));
        const r = rotFrame(rs, th0, 1.5 * RAD);
        th = turnStep(st, th, r.d, ax, ay, CX, CY);
        const now = planOf(st, th, ax, ay);
        expect(near(now, held, 1e-6), `frame ${i}: ${JSON.stringify(now)} vs ${JSON.stringify(held)}`).toBe(true);
      }
      // it did turn, by the fingers' turn less the threshold (taken away, not caught up); the scale grew as the fingers spread
      expect(th).not.toBe(th0);
      expect(st.S).toBeCloseTo(1.01 ** 60, 6);
    });
  }
});

describe("no jump", () => {
  it("below the threshold the view does not turn; past it, it turns from where it stands (no step on the frame it begins)", () => {
    const st = idleState();
    const rs = idleRot();
    let th = 0;
    const steps: number[] = [];
    for (let i = 0; i < 30; i++) {
      const r = rotFrame(rs, 0, 1 * RAD);
      const before = th;
      th = turnStep(st, th, r.d, 200, 300, CX, CY);
      steps.push(Math.abs(th - before));
    }
    const firstOn = steps.findIndex((s) => s > 0);
    expect(firstOn).toBeGreaterThanOrEqual(ROT_START_DEG - 1);
    // no frame turns more than the fingers did on it (1°), except inside a right angle's catch-up (≤ 3 × 1°)
    expect(Math.max(...steps)).toBeLessThanOrEqual(3 * RAD + 1e-9);
  });
  it("a whole turn (360°) by many frames comes back to the same picture; the angle stays in (−π, π]", () => {
    const st = { ...idleState(), S: 1.3, Tx: 12, Ty: -8 };
    let th = 0.2;
    const P = screenOf(st, th, 20, 40);
    for (let i = 0; i < 360; i++) {
      th = turnStep(st, th, RAD, 150, 420, CX, CY);
      expect(th > -Math.PI - 1e-12 && th <= Math.PI + 1e-12).toBe(true);
    }
    expect(near(screenOf(st, th, 20, 40), P, 1e-6)).toBe(true);
  });
  it("one turn step about A keeps A's plan point (any θ, any d)", () => {
    for (const [th, d] of [[0, 0.1], [1.2, -0.3], [-3, 0.05]] as const) {
      const st = { ...idleState(), S: 2, Tx: 5, Ty: 9 };
      const before = planOf(st, th, 77, 222);
      const th2 = turnStep(st, th, d, 77, 222, CX, CY);
      expect(near(planOf(st, th2, 77, 222), before, 1e-9)).toBe(true);
    }
  });
  it("turnShift is zero when the fingers are at the centre (the turn about the centre needs no shift)", () => {
    expect(near(turnShift(0.7, 0.2, CX, CY, CX, CY), { x: 0, y: 0 })).toBe(true);
  });
});

describe("«Север вверх», labels and limits", () => {
  it("north up: θ → 0 about the centre — the plan point at the centre stays there", () => {
    const st = { ...idleState(), S: 1.5, Tx: -30, Ty: 44 };
    const th = 1.9;
    const c = planOf(st, th, CX, CY);
    expect(near(planOf(st, 0, CX, CY), c, 1e-9)).toBe(true);
  });
  it("the labels' counter-turn is −θ in degrees, none at 0; turned only off 0", () => {
    expect(labelTurnDeg(Math.PI / 2)).toBeCloseTo(-90, 9);
    expect(labelTurnDeg(0)).toBe(0);
    expect(turned(0)).toBe(false);
    expect(turned(0.01)).toBe(true);
  });
  it("the pinch's limit is the same turned: the scale does not depend on θ", () => {
    const a = idleState(), b = idleState();
    for (let i = 0; i < 40; i++) {
      pinchFrame(a, pinchIn(0, CX, CY, { scaleChange: 1.1, numberOfPointers: 2, focalX: 100, focalY: 100 }), { lo: 0.5, hi: 3 });
      pinchFrame(b, pinchIn(2.2, CX, CY, { scaleChange: 1.1, numberOfPointers: 2, focalX: 100, focalY: 100 }), { lo: 0.5, hi: 3 });
    }
    expect(b.S).toBeCloseTo(a.S, 12);
    expect(a.S).toBeLessThanOrEqual(3 * 1.05 + 1e-9);
  });
  it("turnPad: a layer that reaches this far covers the corners of the canvas at any angle", () => {
    const pad = turnPad(W, H);
    const half = Math.hypot(W, H) / 2;
    expect(W / 2 + pad).toBeGreaterThanOrEqual(half - 1e-9);
    expect(H / 2 + pad).toBeGreaterThanOrEqual(half - 1e-9);
  });
});
