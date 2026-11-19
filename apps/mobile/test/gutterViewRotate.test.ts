/**
 * #501 (founder 19.11: «крутить чертёж по оси» — the VIEW turns with two fingers, «север вверх» brings it back; the drawing and the PDF
 * stay as they are). The pure math of the turn (canvas/viewRotate.ts, spec 33 П39): the point under the fingers, the start threshold
 * without a jump, the right angles with a hysteresis, the redraw without a step, «север вверх», readable labels.
 */
import { describe, expect, it } from "vitest";
import {
  applySim,
  endRot,
  idleRot,
  isTurned,
  normAngle,
  northUp,
  rebaseSim,
  ROT_START_DEG,
  rotateAbout,
  rotFrame,
  scaleAbout,
  SIM_ID,
  simApply,
  simCompose,
  simInverse,
  SNAP_IN_DEG,
  SNAP_OUT_DEG,
  toPlan,
  toScreen,
  uprightDeg,
  type Sim,
  type ViewR,
} from "../src/modules/gutters/canvas/viewRotate";

const D = Math.PI / 180;
const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const nearPt = (p: { x: number; y: number }, q: { x: number; y: number }, eps = 1e-7) => {
  near(p.x, q.x, eps);
  near(p.y, q.y, eps);
};
const V0: ViewR = { k: 2, ox: 30, oy: 40, rot: 0 };

describe("similarity: compose, inverse, plan ↔ screen", () => {
  it("toPlan undoes toScreen for any turned view", () => {
    for (const rot of [0, 0.3, Math.PI / 2, -2.5, Math.PI]) {
      const v: ViewR = { k: 1.7, ox: -12, oy: 88, rot };
      for (const [x, y] of [[0, 0], [120, -40], [-7.5, 333]] as const) nearPt(toPlan(v, toScreen(v, x, y).x, toScreen(v, x, y).y), { x, y });
    }
  });
  it("inverse ∘ s is the identity; compose is «first B, then A»", () => {
    const s: Sim = rotateAbout(scaleAbout(SIM_ID, 1.4, 10, 20), 0.7, -5, 9);
    const id = simCompose(simInverse(s), s);
    near(id.a, 1); near(id.b, 0); near(id.tx, 0); near(id.ty, 0);
    // two general similarities (a turn, a scale and a shift each): compose = apply B, then A, at any point
    const A = rotateAbout(scaleAbout({ a: 1, b: 0, tx: 13, ty: -4 }, 0.6, 7, 2), 1.1, -30, 50);
    const B = rotateAbout(scaleAbout({ a: 1, b: 0, tx: -9, ty: 21 }, 2.3, 40, -8), -0.8, 12, 3);
    for (const [x, y] of [[0, 0], [17, -5], [-200, 90]] as const) {
      const b = simApply(B, x, y);
      nearPt(simApply(simCompose(A, B), x, y), simApply(A, b.x, b.y));
    }
  });
  it("a positive angle turns clockwise on the screen (y goes down, as RNGH)", () => {
    const p = toScreen({ k: 1, ox: 0, oy: 0, rot: Math.PI / 2 }, 10, 0);
    nearPt(p, { x: 0, y: 10 });
  });
  it("normAngle keeps (−π, π]", () => {
    near(normAngle(3 * Math.PI), Math.PI);
    near(normAngle(-Math.PI), Math.PI);
    near(normAngle(-3.5 * Math.PI), Math.PI / 2);
    near(normAngle(0.25), 0.25);
  });
});

describe("the point under the fingers stays under the fingers", () => {
  it("a turn and a pinch about the moving anchor keep the plan point under it, frame after frame", () => {
    let live: Sim = SIM_ID;
    const st = idleRot();
    // the fingers lie on the plan point under (200, 300); they turn by 2° a frame, spread by 1 %, and drift together
    let fx = 200;
    let fy = 300;
    const under = toPlan(V0, fx, fy);
    for (let i = 0; i < 60; i++) {
      // a drift of the fingers' centre is a pan: the live transform moves with it
      live = simCompose({ a: 1, b: 0, tx: 1.5, ty: -0.5 }, live);
      fx += 1.5;
      fy -= 0.5;
      const { d } = rotFrame(st, V0.rot, 2 * D);
      live = rotateAbout(live, d, fx, fy);
      live = scaleAbout(live, 1.01, fx, fy);
      const v = applySim(V0, live);
      nearPt(toScreen(v, under.x, under.y), { x: fx, y: fy }, 1e-6);
    }
  });
});

describe("the start threshold: a pinch does not turn by itself, and the turn begins without a jump", () => {
  it("a twist under ROT_START_DEG turns nothing", () => {
    const st = idleRot();
    let sum = 0;
    for (const c of [3, -2, 4, 2, -1, 3]) sum += rotFrame(st, 0, c * D).d; // 9° of the fingers at most
    expect(st.on).toBe(false);
    expect(sum).toBe(0);
  });
  it("past the threshold the view turns by the frame's own step — never by the threshold at once", () => {
    const st = idleRot();
    let shown = 0;
    let maxStep = 0;
    for (let i = 0; i < 40; i++) {
      const { d } = rotFrame(st, 37 * D, 1 * D); // base 37°: far from a right angle, no stick
      maxStep = Math.max(maxStep, Math.abs(d));
      shown += d;
    }
    expect(st.on).toBe(true);
    expect(maxStep).toBeLessThanOrEqual(1 * D + 1e-12);
    near(shown, (40 - ROT_START_DEG) * D, 1e-9);
  });
  it("the other way the same (the sign of the threshold follows the fingers)", () => {
    const st = idleRot();
    let shown = 0;
    for (let i = 0; i < 30; i++) shown += rotFrame(st, 37 * D, -1 * D).d;
    near(shown, -(30 - ROT_START_DEG) * D, 1e-9);
  });
  it("turning back through the start in one gesture is no jump (+15°, then −30°)", () => {
    for (const base of [37, 0, 3, 88]) {
      const st = idleRot();
      let shown = 0;
      let prev = 0;
      let maxStep = 0;
      for (const step of [...Array(60).fill(0.25), ...Array(120).fill(-0.25)]) {
        shown += rotFrame(st, base * D, step * D).d;
        maxStep = Math.max(maxStep, Math.abs(shown - prev));
        prev = shown;
      }
      expect(maxStep).toBeLessThanOrEqual((0.25 * SNAP_OUT_DEG) / (SNAP_OUT_DEG - SNAP_IN_DEG) * D + 1e-9);
    }
  });
  it("the fingers came up: the next gesture starts from nothing", () => {
    const st = idleRot();
    for (let i = 0; i < 20; i++) rotFrame(st, 0, 1 * D);
    endRot(st);
    expect(st).toEqual(idleRot());
    expect(rotFrame(st, 0, 5 * D).d).toBe(0);
  });
});

describe("right angles: the view sticks to 0°, 90°, 180°, 270°, continuously", () => {
  /** drive the fingers to a total turn `deg` from base `baseDeg` in 0.25° frames; the view's angle at the end and the ticks */
  const drive = (baseDeg: number, path: number[]) => {
    const st = idleRot();
    let shown = 0;
    let ticks = 0;
    let at = 0;
    for (const to of path) {
      const step = to > at ? 0.25 : -0.25;
      while (Math.abs(to - at) > 1e-9) {
        const r = rotFrame(st, baseDeg * D, step * D);
        shown += r.d;
        if (r.tick) ticks++;
        at += step;
      }
    }
    return { angle: (baseDeg * D + shown) / D, ticks, st };
  };

  it("comes close to 90° — sits exactly on 90°, one tick", () => {
    // base 0°: the fingers turn 10° (threshold) + 86° → the view would be at 86°, within SNAP_IN of 90°
    const r = drive(0, [ROT_START_DEG + 90 - SNAP_IN_DEG + 1]);
    near(r.angle, 90, 1e-9);
    expect(r.ticks).toBe(1);
  });
  it("a hand shaking at the edge of the window ticks once, not on every frame", () => {
    const edge = ROT_START_DEG + 90 - SNAP_IN_DEG; // the view at exactly 84°
    const path: number[] = [edge + 0.5];
    for (let i = 0; i < 20; i++) path.push(edge - 1.5, edge + 0.5); // ±1° around the entry edge: still inside SNAP_OUT
    const r = drive(0, path);
    expect(r.ticks).toBe(1);
    near(r.angle, 90, 1e-9);
  });
  it("lets go past SNAP_OUT and turns freely — no jump on leaving", () => {
    const st = idleRot();
    let shown = 0;
    let prev = 0;
    let maxStep = 0;
    // to 90°, then on to 90° + SNAP_OUT + 3°
    const total = ROT_START_DEG + 90 + SNAP_OUT_DEG + 3;
    for (let a = 0.25; a <= total + 1e-9; a += 0.25) {
      const { d } = rotFrame(st, 0, 0.25 * D);
      shown += d;
      maxStep = Math.max(maxStep, Math.abs(shown - prev));
      prev = shown;
    }
    expect(st.snap).toBeNull();
    near(shown / D, 90 + SNAP_OUT_DEG + 3, 1e-9);
    // no jump on leaving: the view catches up with the fingers at most SNAP_OUT / (SNAP_OUT − SNAP_IN) times a frame's own step
    expect(maxStep).toBeLessThanOrEqual((0.25 * SNAP_OUT_DEG) / (SNAP_OUT_DEG - SNAP_IN_DEG) * D + 1e-9);
  });
  it("a view that starts on 0° does not tick for 0°; the whole way to 90° has no jump (entry and leaving included)", () => {
    const st = idleRot();
    let shown = 0;
    let prev = 0;
    let maxStep = 0;
    const ticks: number[] = [];
    for (let i = 0; i < (ROT_START_DEG + 120) * 4; i++) {
      const r = rotFrame(st, 0, 0.25 * D);
      shown += r.d;
      if (r.tick) ticks.push(Math.round(shown / D));
      maxStep = Math.max(maxStep, Math.abs(shown - prev));
      prev = shown;
    }
    expect(ticks).toEqual([90]);
    expect(maxStep).toBeLessThanOrEqual((0.25 * SNAP_OUT_DEG) / (SNAP_OUT_DEG - SNAP_IN_DEG) * D + 1e-9);
  });
  it("a view that starts NEAR a right angle (in its window) is not pulled onto it on the first frame — no jump, no tick", () => {
    for (const base of [1, 3, 5, 6.5, 8, -4, 87]) {
      for (const dirn of [1, -1]) {
        const st = idleRot();
        let shown = 0;
        let prev = 0;
        let maxStep = 0;
        let ticks = 0;
        for (let i = 0; i < (ROT_START_DEG + 4) * 4; i++) {
          const r = rotFrame(st, base * D, dirn * 0.25 * D);
          shown += r.d;
          if (r.tick) ticks++;
          maxStep = Math.max(maxStep, Math.abs(shown - prev));
          prev = shown;
        }
        expect(maxStep).toBeLessThanOrEqual(0.25 * D + 1e-9);
        expect(ticks).toBe(0);
      }
    }
  });
  it("… and once it has left the window, it sticks to a right angle as usual", () => {
    // base 3°: away from 0° by 10° + 15° of the fingers (the view at 18°), back by 16° (the view at 2°) — onto 0°, one tick
    const st = idleRot();
    let shown = 0;
    let ticks = 0;
    for (const step of [...Array((ROT_START_DEG + 15) * 4).fill(0.25), ...Array(16 * 4).fill(-0.25)]) {
      const r = rotFrame(st, 3 * D, step * D);
      shown += r.d;
      if (r.tick) ticks++;
    }
    near(3 + shown / D, 0, 1e-9);
    expect(ticks).toBe(1);
  });
  it("the right angle is of the VIEW, not of the fingers: from a view at 80° a turn of the fingers by 10° + 7° sits on 90°", () => {
    const r = drive(80, [ROT_START_DEG + 7]);
    near(r.angle, 90, 1e-9);
  });
  it("180° and −90° are right angles too", () => {
    near(drive(0, [ROT_START_DEG + 178]).angle, 180, 1e-9);
    const st = idleRot();
    let shown = 0;
    for (let i = 0; i < (ROT_START_DEG + 88) * 4; i++) shown += rotFrame(st, 0, -0.25 * D).d;
    near(shown / D, -90, 1e-9);
  });
  it("a view stuck to 90° and committed is exactly π/2 (not 89.999…)", () => {
    const st = idleRot();
    let live: Sim = SIM_ID;
    for (let i = 0; i < (ROT_START_DEG + 89) * 4; i++) live = rotateAbout(live, rotFrame(st, 0, 0.25 * D).d, 195, 420);
    expect(applySim(V0, live).rot).toBe(Math.PI / 2);
  });
});

describe("the redraw does not move the picture", () => {
  it("rebaseSim: the live transform against the rendered view shows the same picture", () => {
    const base: ViewR = { k: 1.3, ox: 10, oy: -20, rot: 0.4 };
    let live: Sim = rotateAbout(scaleAbout(SIM_ID, 1.2, 100, 200), 0.3, 150, 250);
    live = simCompose({ a: 1, b: 0, tx: 7, ty: 3 }, live);
    // the render of a commit taken half-way (or of a view that is not ours: the «вписать» button) arrived
    for (const ref of [applySim(base, rotateAbout(SIM_ID, 0.1, 0, 0)), { k: 0.8, ox: 300, oy: 5, rot: -1.2 }]) {
      const again = rebaseSim(base, live, ref);
      const before = applySim(base, live);
      const after = applySim(ref, again);
      for (const [x, y] of [[0, 0], [50, -30], [400, 900]] as const) nearPt(toScreen(after, x, y), toScreen(before, x, y), 1e-6);
    }
  });
  it("the render of its own commit leaves the identity", () => {
    const live = rotateAbout(SIM_ID, 0.5, 40, 60);
    const ref = applySim(V0, live);
    const left = rebaseSim(V0, live, ref);
    near(left.a, 1); near(left.b, 0); near(left.tx, 0, 1e-7); near(left.ty, 0, 1e-7);
  });
});

describe("«север вверх»", () => {
  it("gives exactly 0° and keeps the plan point at the canvas's centre", () => {
    for (const rot of [0.7, -2.9, Math.PI / 2, Math.PI]) {
      const v: ViewR = { k: 1.6, ox: 55, oy: -10, rot };
      const centre = toPlan(v, 195, 422);
      const up = northUp(v, 195, 422);
      expect(up.rot).toBe(0);
      expect(isTurned(up)).toBe(false);
      near(up.k, v.k, 1e-9);
      nearPt(toScreen(up, centre.x, centre.y), { x: 195, y: 422 }, 1e-6);
    }
  });
  it("the button is shown only on a turned view", () => {
    expect(isTurned(V0)).toBe(false);
    expect(isTurned({ ...V0, rot: 0.01 })).toBe(true);
  });
});

describe("labels stay readable on a turned view", () => {
  it("a label's angle is kept in (−90°, 90°]", () => {
    for (const [inp, out] of [[0, 0], [45, 45], [90, 90], [91, -89], [135, -45], [180, 0], [-90, 90], [-135, 45], [270, 90], [-270, 90], [405, 45]] as const) near(uprightDeg(inp), out);
  });
});
