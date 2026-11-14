/**
 * #1271 (founder 12.11: «щипком приблизил с 1% до 100%, отпустил — откатилось примерно до 80%»; review of the director on #1278).
 * The live transform of the canvas's two gestures as pure steps (canvas/gestureState.ts), run on SEQUENCES of the library's events.
 * Three plausible causes, each with a test; the old logic is written out below (`Legacy`, a faithful copy of the first hook: both
 * gestures commit at their end, every `scaleChange` multiplies, the render drops the whole live transform) — it fails every one of them.
 */
import { describe, expect, it } from "vitest";
import { applyTf, EDGE_FREE, endGesture, idleState, IDENTITY, panFrame, pinchFrame, settle, sub, type LiveState, type Pending, type Tf, type View } from "../src/modules/gutters/canvas/gestureState";

type Ev =
  | { t: "pinch"; n: number; k: number; fx?: number; fy?: number }
  | { t: "pan"; n: number; dx?: number; dy?: number }
  | { t: "end" }
  | { t: "render" };

/** the canvas as the hook runs it: live state, the rendered view, commits made and not rendered yet (JS handles them at once here) */
class Sim {
  st: LiveState = idleState();
  view: View = { k: 1, ox: 0, oy: 0 };
  /** the views commits made, waiting for their render */
  queue: Pending[] = [];
  commits = 0;
  need = 2;
  run(evs: Ev[]) {
    for (const e of evs) {
      let req: Tf | null = null;
      if (e.t === "pinch") req = pinchFrame(this.st, { scaleChange: e.k, numberOfPointers: e.n, focalX: e.fx ?? 100, focalY: e.fy ?? 100 });
      else if (e.t === "pan") req = panFrame(this.st, { changeX: e.dx ?? 0, changeY: e.dy ?? 0, numberOfPointers: e.n }, this.need);
      else if (e.t === "end") req = endGesture(this.st);
      else this.render();
      if (req) this.commit(req);
    }
    return this;
  }
  commit(t: Tf) {
    this.commits++;
    const v = applyTf(this.view, t); // the base: the view on the screen, the live transform is cumulative against it
    this.queue.push({ view: v, tf: { ...t } });
  }
  /** React renders the oldest waiting commit's view */
  render() {
    const next = this.queue[0];
    if (!next) return;
    const r = settle({ S: this.st.S, Tx: this.st.Tx, Ty: this.st.Ty }, this.queue, next.view);
    this.view = next.view;
    this.queue = r.pending;
    this.st.S = r.live.S;
    this.st.Tx = r.live.Tx;
    this.st.Ty = r.live.Ty;
  }
  /** the view the person sees at the end: everything rendered */
  final(): View {
    while (this.queue.length) this.render();
    return applyTf(this.view, { S: this.st.S, Tx: this.st.Tx, Ty: this.st.Ty });
  }
}

/** the first hook, as it was: what it did with the same events */
class Legacy {
  s = 1; tx = 0; ty = 0;
  view: View = { k: 1, ox: 0, oy: 0 };
  commits: Tf[] = [];
  pinch(k: number) { this.s *= k; }
  end() { if (this.s !== 1 || this.tx !== 0) this.commits.push({ S: this.s, Tx: this.tx, Ty: this.ty }); }
  /** the render: every commit lands (from the view of the moment), the live transform is dropped */
  render() { for (const c of this.commits) this.view = applyTf(this.view, c); this.commits = []; this.s = 1; this.tx = 0; this.ty = 0; }
}

const zoom = (frames: number, k = 1.5): Ev[] => Array.from({ length: frames }, () => ({ t: "pinch" as const, n: 2, k }));

describe("cause 1: a double end and the lift (the pan ends at the first lifted finger, the pinch goes on to the last)", () => {
  it("Legacy: the late frames (one finger, scaleChange 0.8) multiply, both gestures commit — the view is not what was under the fingers", () => {
    const l = new Legacy();
    for (let i = 0; i < 6; i++) l.pinch(1.5);
    l.end(); // the pan ends: a commit of 1.5^6
    l.pinch(0.8); l.pinch(0.5); // the pinch goes on: its late frames
    l.end(); // the pinch ends: a second commit of what is left
    l.render();
    expect(l.view.k).not.toBeCloseTo(1.5 ** 6, 3);
  });
  it("new: 6 frames with two fingers, the pan ends (a commit), late one-finger frames are dropped, the pinch ends (nothing): the view is exactly 1.5^6", () => {
    const sim = new Sim().run([...zoom(6), { t: "end" }, { t: "pinch", n: 1, k: 0.8 }, { t: "pinch", n: 1, k: 0.5 }, { t: "end" }]);
    expect(sim.commits).toBe(1);
    expect(sim.final().k).toBeCloseTo(1.5 ** 6, 9);
  });
  it("the focal point stays where it is under the fingers: scaling about (100, 100) maps the screen point (100, 100) to itself", () => {
    const st = idleState();
    for (let i = 0; i < 4; i++) pinchFrame(st, { scaleChange: 1.5, numberOfPointers: 2, focalX: 100, focalY: 100 });
    expect(st.S * 100 + st.Tx).toBeCloseTo(100, 9);
    expect(st.S * 100 + st.Ty).toBeCloseTo(100, 9);
  });
});

describe("cause 2: frames with ONE finger on iOS (the lift: the span collapses, the focal point jumps to the finger left)", () => {
  it("one-finger frames of the pinch and of the pan are dropped; so is the first frame after the finger count changed", () => {
    const sim = new Sim().run([
      ...zoom(3),
      { t: "pan", n: 2, dx: 5, dy: 0 },
      { t: "pinch", n: 1, k: 0.5, fx: 900, fy: 900 }, // the lift: the focal point jumps
      { t: "pan", n: 1, dx: 80, dy: 60 }, // the centre jumps to the finger left
      { t: "end" },
    ]);
    expect(sim.commits).toBe(1);
    const v = sim.final();
    expect(v.k).toBeCloseTo(1.5 ** 3, 9);
    expect(Math.abs(v.ox)).toBeLessThan(400); // not shifted by the jump of 80 / 900
  });
  it("a pan that only looks (one finger is enough, need 1) counts one finger; a pinch's one-finger frames still do not", () => {
    const sim = new Sim();
    sim.need = 1;
    sim.run([{ t: "pan", n: 1, dx: 10, dy: 4 }, { t: "pan", n: 1, dx: 10, dy: 4 }, { t: "end" }]);
    expect(sim.final()).toMatchObject({ k: 1, ox: 20, oy: 8 });
  });
});

describe("review Б1: a second finger put down after the first lifted goes on zooming (the pinch lives to the last finger)", () => {
  it("the pan ends at the lift (a commit); the second finger comes back — a NEW segment: its frames count, the view is the product of both", () => {
    const sim = new Sim().run([
      ...zoom(3), { t: "end" }, // pan: the first finger lifted — a commit
      { t: "pinch", n: 1, k: 0.9 }, // one finger left: dropped
      { t: "pinch", n: 2, k: 1.3 }, // the second finger is back: the first frame is a jump, dropped…
      ...zoom(3, 2), // …these count
      { t: "end" },
    ]);
    expect(sim.commits).toBe(2);
    expect(sim.final().k).toBeCloseTo(1.5 ** 3 * 2 ** 3, 9);
  });
});

describe("cause 3: the race with the redraw — a new segment begins before the render of the last commit", () => {
  it("Legacy: the render drops the whole live transform — the part the new segment has made is eaten", () => {
    const l = new Legacy();
    for (let i = 0; i < 3; i++) l.pinch(2);
    l.end();
    for (let i = 0; i < 3; i++) l.pinch(2); // the new segment, before the render
    l.render(); // drops everything
    expect(l.s).toBe(1); // the second segment's 2^3 is gone
  });
  it("new: the render of a commit takes away exactly that commit — the new segment's part stays, and its own commit lands on it", () => {
    const sim = new Sim().run([
      ...zoom(3, 2), { t: "end" }, // a commit of 2^3 — not rendered yet
      { t: "pinch", n: 1, k: 1 }, // one finger…
      { t: "pinch", n: 2, k: 1 }, ...zoom(3, 2), // …the second back: a new segment of 2^3 BEFORE the render
      { t: "render" }, // the first commit renders: the live transform keeps the new segment's 2^3
    ]);
    expect(sim.st.S).toBeCloseTo(8, 9);
    sim.run([{ t: "end" }]);
    expect(sim.final().k).toBeCloseTo(64, 9);
  });
  it("two commits waiting for one render each: both land, in order, with nothing lost or twice", () => {
    const sim = new Sim().run([
      ...zoom(2, 2), { t: "end" },
      { t: "pinch", n: 1, k: 1 }, { t: "pinch", n: 2, k: 1 }, ...zoom(2, 2), { t: "end" },
    ]);
    expect(sim.commits).toBe(2);
    expect(sim.final().k).toBeCloseTo(16, 9);
  });
  it("translation too: the shift of the first commit is taken away exactly, the second keeps its own", () => {
    const sim = new Sim();
    sim.run([{ t: "pan", n: 2, dx: 0, dy: 0 }, { t: "pan", n: 2, dx: 30, dy: 10 }, { t: "end" }]);
    sim.run([{ t: "pan", n: 1, dx: 0, dy: 0 }, { t: "pan", n: 2, dx: 0, dy: 0 }, { t: "pan", n: 2, dx: 5, dy: 5 }]);
    sim.render();
    expect([sim.st.Tx, sim.st.Ty]).toEqual([5, 5]);
    sim.run([{ t: "end" }]);
    expect(sim.final()).toMatchObject({ k: 1, ox: 35, oy: 15 });
  });
});

describe("#1403 — another render of the SAME view mid-pinch changes nothing (founder 14.11: «прыгает, то больше, то меньше»)", () => {
  it("the same view settled again (a blink, a hint, a toast re-rendered the screen) keeps the live transform under the fingers", () => {
    const st = idleState();
    for (let i = 0; i < 10; i++) pinchFrame(st, { scaleChange: 0.95, numberOfPointers: 2, focalX: 120, focalY: 300 });
    const live = { S: st.S, Tx: st.Tx, Ty: st.Ty };
    const v = { k: 2, ox: 10, oy: 400 };
    const pending: Pending[] = [];
    const r = settle(live, pending, v, v);
    expect(r.live).toEqual(live); // was IDENTITY: the drawing jumped back to its size before the pinch
    expect(r.pending).toBe(pending);
  });
  it("a render of the same view between commits keeps the waiting commits too", () => {
    const v0 = { k: 1, ox: 0, oy: 0 };
    const t = { S: 0.5, Tx: 10, Ty: 0 };
    const v1 = applyTf(v0, t);
    const pending: Pending[] = [{ view: v1, tf: t }];
    const r = settle({ S: 0.4, Tx: 12, Ty: 1 }, pending, v0, v0);
    expect(r.pending).toEqual(pending);
    expect(r.live).toEqual({ S: 0.4, Tx: 12, Ty: 1 });
    // the commit's own render then takes away exactly its commit, as before
    expect(settle(r.live, r.pending, v1, v0).live.S).toBeCloseTo(0.8, 9);
  });
  it("a NEW view that is not ours (the «fit» button) still drops the live transform", () => {
    expect(settle({ S: 2, Tx: 3, Ty: 4 }, [], { k: 5, ox: 0, oy: 0 }, { k: 1, ox: 0, oy: 0 }).live).toEqual(IDENTITY);
  });
});

describe("the rest", () => {
  it("a view that is not ours (the «fit» button, a new size): the live transform is dropped, as before", () => {
    const r = settle({ S: 2, Tx: 3, Ty: 4 }, [], { k: 5, ox: 0, oy: 0 });
    expect(r.live).toEqual(IDENTITY);
    expect(r.pending).toEqual([]);
  });
  it("a ⊖ b: what is left when b was committed", () => {
    const a = { S: 6, Tx: 40, Ty: 10 }, b = { S: 2, Tx: 4, Ty: 1 };
    const d = sub(a, b);
    expect(d.S).toBe(3);
    // b then d is a: S = 2·3, T = 3·4 + d.T
    expect(d.S * b.Tx + d.Tx).toBeCloseTo(a.Tx, 9);
    expect(d.S * b.Ty + d.Ty).toBeCloseTo(a.Ty, 9);
  });
  it("nothing moved → no commit; an end with no segment → none; two ends → one", () => {
    expect(new Sim().run([{ t: "pan", n: 2 }, { t: "end" }]).commits).toBe(0);
    expect(new Sim().run([{ t: "end" }]).commits).toBe(0);
    expect(new Sim().run([...zoom(2), { t: "end" }, { t: "end" }]).commits).toBe(1);
  });
  it("1% → 100% in one pinch and in three goes: the same view, whatever the lifts do", () => {
    const one = new Sim().run([...zoom(12, 1.5), { t: "end" }, { t: "pinch", n: 1, k: 0.5 }, { t: "end" }]).final().k;
    const three = new Sim().run([...zoom(4, 1.5), { t: "end" }, { t: "pinch", n: 1, k: 0.5 }, { t: "pinch", n: 2, k: 1 }, ...zoom(4, 1.5), { t: "end" }, { t: "pinch", n: 1, k: 0.5 }, { t: "pinch", n: 2, k: 1 }, ...zoom(4, 1.5), { t: "end" }]).final().k;
    expect(one).toBeCloseTo(1.5 ** 12, 6);
    expect(three).toBeCloseTo(1.5 ** 12, 6);
  });
});

describe("#1281 — the limits of the scale: a soft stop, a tick at the limit, the commit inside the limits", () => {
  const lim = { lo: 0.5, hi: 4 };
  const frames = (n: number, k: number) => Array.from({ length: n }, () => ({ scaleChange: k, numberOfPointers: 2, focalX: 100, focalY: 100 }));
  it("zooming in: the live scale stops softly at the nearest limit (at most OVERSHOOT past it), the edge is flagged once it is reached", () => {
    const st = idleState();
    let edges = 0, last = 0;
    for (const f of frames(40, 1.2)) {
      pinchFrame(st, f, lim);
      if (st.edge !== 0 && last === 0) edges++;
      last = st.edge;
    }
    expect(st.S).toBeLessThanOrEqual(lim.hi * (1 + OVERSHOOT) + 1e-9);
    expect(st.S).toBeGreaterThan(lim.hi * 0.99);
    expect(st.edge).toBe(1);
    expect(edges).toBe(1); // one tick, not one per frame
  });
  it("zooming out: the same at the farthest limit", () => {
    const st = idleState();
    for (const f of frames(40, 0.8)) pinchFrame(st, f, lim);
    expect(st.S).toBeGreaterThanOrEqual(lim.lo / (1 + OVERSHOOT) - 1e-9);
    expect(st.S).toBeLessThan(lim.lo * 1.01);
    expect(st.edge).toBe(-1);
  });
  it("the focal point stays under the fingers also at the limit (the map is scaled about it by the factor that was allowed)", () => {
    const st = idleState();
    for (const f of frames(40, 1.2)) pinchFrame(st, { ...f, focalX: 130, focalY: 70 }, lim);
    expect(st.S * 130 + st.Tx).toBeCloseTo(130, 6);
    expect(st.S * 70 + st.Ty).toBeCloseTo(70, 6);
  });
  it("back from the limit the edge is free again; no limit given (the bench): the scale is free", () => {
    const st = idleState();
    for (const f of frames(40, 1.2)) pinchFrame(st, f, lim);
    pinchFrame(st, { scaleChange: 0.5, numberOfPointers: 2, focalX: 0, focalY: 0 }, lim);
    expect(st.edge).toBe(0);
    const free = idleState();
    for (const f of frames(40, 1.2)) pinchFrame(free, f);
    expect(free.S).toBeGreaterThan(1000);
  });
  it("one tick at the limit (founder 14.11: «тик нравится»): a hand shaking at the limit does not tick again; back inside by EDGE_FREE and out again — a second tick", () => {
    const st = idleState();
    let ticks = 0, last = 0;
    const run = (k: number, n: number) => { for (const f of frames(n, k)) { pinchFrame(st, f, lim); if (st.edge !== 0 && last === 0) ticks++; last = st.edge; } };
    run(1.2, 20);
    expect(ticks).toBe(1);
    for (let i = 0; i < 10; i++) { run(0.995, 1); run(1.005, 1); }
    expect(ticks).toBe(1);
    for (let i = 0; i < 60 && st.edge !== 0; i++) run(0.9, 1);
    expect(st.edge).toBe(0);
    expect(st.S).toBeLessThan(lim.hi * (1 - EDGE_FREE) + 1e-9);
    run(1.3, 20);
    expect(ticks).toBe(2);
  });
  it("the segment's end clears the edge", () => {
    const st = idleState();
    for (const f of frames(40, 1.2)) pinchFrame(st, f, lim);
    endGesture(st);
    expect(st.edge).toBe(0);
  });
});

import { OVERSHOOT } from "../src/modules/gutters/canvas/gestureState";

describe("#1403 — the scale's math at once (the director's list: limits, the point under the fingers, a lifted finger, a render of the same view, the release)", () => {
  const lim = { lo: 0.25, hi: 4 };
  /** a fixed pseudo-random sequence (no Math.random: the test is the same every run) */
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  it("300 frames of a shaking pinch with moving fingers, a finger lifted and put back, renders of the same view in between", () => {
    const st = idleState();
    const view: View = { k: 1, ox: 0, oy: 0 };
    let pending: Pending[] = [];
    let n = 2;
    for (let i = 0; i < 300; i++) {
      // every 40th frame: one finger lifts for a frame, then comes back (the count changes twice)
      const lift = i % 40 === 20;
      const back = i % 40 === 21;
      const fingers = lift ? 1 : 2;
      const f = { x: 100 + rnd() * 200, y: 200 + rnd() * 400 };
      const k = 0.85 + rnd() * 0.3;
      const before = { S: st.S, Tx: st.Tx, Ty: st.Ty };
      const planUnder = { x: (f.x - st.Tx) / st.S, y: (f.y - st.Ty) / st.S }; // the plan point under the fingers before the frame
      const req = pinchFrame(st, { scaleChange: k, numberOfPointers: fingers, focalX: f.x, focalY: f.y }, lim);
      if (lift) {
        // a lifted finger closes the segment: its commit is exactly the live transform — no jump on the release
        if (req) {
          expect(req).toEqual(before);
          const v = applyTf(view, req);
          pending.push({ view: v, tf: req });
          // its render arrives: the live transform loses exactly that commit, the screen shows the same as before
          const r = settle({ S: st.S, Tx: st.Tx, Ty: st.Ty }, pending, v, view);
          pending = r.pending;
          expect(applyTf(v, r.live).k).toBeCloseTo(applyTf(view, before).k, 9);
          Object.assign(view, v);
          st.S = r.live.S; st.Tx = r.live.Tx; st.Ty = r.live.Ty;
        }
        n = 1;
        continue;
      }
      if (back || n !== fingers) {
        // the first frame after the count changed is the jump itself: nothing moves
        expect({ S: st.S, Tx: st.Tx, Ty: st.Ty }).toEqual(before);
        n = fingers;
        continue;
      }
      // within the soft bounds of the limits, always
      expect(st.S).toBeLessThanOrEqual(lim.hi * (1 + 0.05) + 1e-9);
      expect(st.S).toBeGreaterThanOrEqual(lim.lo / (1 + 0.05) - 1e-9);
      // the plan point under the fingers stays under them
      expect(planUnder.x * st.S + st.Tx).toBeCloseTo(f.x, 6);
      expect(planUnder.y * st.S + st.Ty).toBeCloseTo(f.y, 6);
      // a render of the same view in between changes nothing
      if (i % 7 === 0) {
        const r = settle({ S: st.S, Tx: st.Tx, Ty: st.Ty }, pending, view, view);
        expect(r.live).toEqual({ S: st.S, Tx: st.Tx, Ty: st.Ty });
        expect(r.pending).toBe(pending);
      }
    }
    // the release: the commit is the live transform as it is — the view after it is what was on the screen
    const live = { S: st.S, Tx: st.Tx, Ty: st.Ty };
    const t = endGesture(st);
    if (t) expect(t).toEqual(live);
  });
});
