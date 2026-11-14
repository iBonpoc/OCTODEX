/**
 * #1403 (founder 14.11, iPhone: «прыгает, то больше, то меньше… пальцы отлипают»), after #1458 (settle on a new view only).
 * What was left is between the threads:
 * 1. The settle read the live transform on the JS thread and wrote it back a moment later; the fingers change it on the UI thread between
 *    frames, so those frames were lost. Now the UI thread re-bases the live transform onto the rendered view (`rebase`) in one step.
 * 2. A commit taken on the UI thread was applied on the JS thread to the view the JS thread renders. While a settle is on its way to the
 *    UI thread the two differ: a finger lifting twice in one pinch took the first commit twice (code-reviewer). Now a commit carries the
 *    view it is against on the UI thread.
 * 3. The gestures' configs were new objects on every render; RNGH 3 keys its handler on the config object, so every render registered the
 *    gestures again, mid-pinch too. Now they are made once (canvas and drawing gestures).
 * Below: a model of the two threads with the real `pinchFrame` / `rebase`; the wiring is a source guard. The device is the proof (rule 27).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTf, idleState, IDENTITY, pinchFrame, rebase, sub, type LiveState, type Tf, type View } from "../src/modules/gutters/canvas/gestureState";

const tfOf = (st: LiveState): Tf => ({ S: st.S, Tx: st.Tx, Ty: st.Ty });
const near = (a: View, b: View) => {
  expect(a.k).toBeCloseTo(b.k, 9);
  expect(a.ox).toBeCloseTo(b.ox, 6);
  expect(a.oy).toBeCloseTo(b.oy, 6);
};

describe("rebase: the same picture against another view", () => {
  it("the render of our own commit: the same as `sub` (the live transform loses exactly the commit)", () => {
    const base: View = { k: 2, ox: 100, oy: 300 };
    const done: Tf = { S: 0.8, Tx: 12, Ty: -7 };
    const live: Tf = { S: 0.6, Tx: 30, Ty: 4 };
    const r = rebase(base, live, applyTf(base, done));
    const s = sub(live, done);
    expect(r.S).toBeCloseTo(s.S, 12);
    expect(r.Tx).toBeCloseTo(s.Tx, 9);
    expect(r.Ty).toBeCloseTo(s.Ty, 9);
  });
  it("any views: the picture on the screen does not move", () => {
    const base: View = { k: 3, ox: -50, oy: 900 }, live: Tf = { S: 0.4, Tx: 70, Ty: -20 }, ref: View = { k: 0.7, ox: 210, oy: 12 };
    near(applyTf(ref, rebase(base, live, ref)), applyTf(base, live));
  });
});

/**
 * Two threads. UI: `base` (the view the live transform is against there) and the fingers' LiveState. JS: the rendered view and the
 * pending commits. Events are applied in the order given: the UI thread's frames, the JS thread's commits and renders, and the UI
 * thread's settles (sent by a render, run a little later).
 */
class Threads {
  base: View;
  st = idleState();
  jsView: View;
  pending: { view: View; ref: View }[] = [];
  queue: { v: View; ref: View | null }[] = []; // settles sent to the UI thread, not run yet
  commitsToJs: { t: Tf; base: View }[] = [];
  constructor(v: View, private old = false) {
    this.base = v;
    this.jsView = v;
  }
  /** the picture on the screen: the UI's base under the live transform */
  screen = () => applyTf(this.base, tfOf(this.st));
  frame(k: number, n = 2) {
    const req = pinchFrame(this.st, { scaleChange: k, numberOfPointers: n, focalX: 195, focalY: 422 });
    if (req) this.commitsToJs.push({ t: req, base: this.base });
  }
  /** the JS thread takes the commits the UI thread sent (scheduleOnRN) */
  jsCommits() {
    for (const c of this.commitsToJs) {
      const raw = applyTf(this.old ? this.jsView : c.base, c.t); // before: against the JS thread's view
      this.pending.push({ view: raw, ref: raw });
    }
    this.commitsToJs = [];
  }
  /** React renders a view (the newest, or `which`) and sends the settle to the UI thread */
  render(which = this.pending.length - 1) {
    const p = this.pending[which]!;
    this.jsView = p.view;
    this.pending = this.pending.slice(which + 1);
    this.queue.push({ v: p.view, ref: p.ref });
  }
  /** the UI thread runs the settles waiting for it */
  uiSettles() {
    for (const q of this.queue) {
      const next = q.ref ? rebase(this.base, tfOf(this.st), q.ref) : IDENTITY;
      this.base = q.v;
      this.st.S = next.S;
      this.st.Tx = next.Tx;
      this.st.Ty = next.Ty;
    }
    this.queue = [];
  }
}

describe("#1403: a pinch with a finger lifting twice — the picture never moves by itself, whatever order the threads take", () => {
  /** one finger lifts for a frame and lands again: the segment closes (a commit), then the pinch goes on */
  const lift = (m: Threads) => {
    m.frame(1, 1);
    m.frame(1, 2);
    return m.screen(); // the picture the commit was taken at: the view it must make
  };
  const scenario = (m: Threads, order: "settle-first" | "commit-first" | "skip-first") => {
    let atB: View | null = null;
    const watch = (step: () => void) => {
      const before = m.screen();
      step();
      near(m.screen(), before); // a step of the threads (not a finger's frame) leaves the picture where it was
    };
    for (let i = 0; i < 8; i++) m.frame(0.95);
    lift(m); // commit A
    watch(() => m.jsCommits());
    for (let i = 0; i < 3; i++) m.frame(0.95);
    if (order === "settle-first") {
      watch(() => m.render()); // A rendered, its settle on its way
      watch(() => m.uiSettles()); // A settled on the UI thread
      atB = lift(m); // commit B, against A there
      watch(() => m.jsCommits());
    } else if (order === "commit-first") {
      watch(() => m.render()); // A rendered on the JS thread, its settle NOT run yet on the UI thread…
      atB = lift(m); // …and B taken there, against the view before A
      watch(() => m.jsCommits()); // B reaches the JS thread after A's render
      watch(() => m.uiSettles()); // A's settle runs
    } else {
      atB = lift(m); // B taken before A was rendered at all
      watch(() => m.jsCommits());
    }
    for (let i = 0; i < 3; i++) m.frame(0.95);
    watch(() => m.render()); // B rendered (in "skip-first" React never rendered A)
    watch(() => m.uiSettles());
    return { m, atB: atB! };
  };
  for (const order of ["settle-first", "commit-first", "skip-first"] as const) {
    it(`${order}: every step of the threads keeps the picture; the end view is what the fingers made`, () => {
      const { m, atB } = scenario(new Threads({ k: 2, ox: 195, oy: 422 }), order);
      // B rendered: the committed view is the picture B was taken at, on both threads; the live transform is only the 3 frames after B
      near(m.jsView, atB);
      near(m.base, atB);
      expect(m.st.S).toBeCloseTo(0.95 ** 3, 9);
    });
  }
  it("before (a commit against the JS thread's view): with B taken before A's settle ran, B's view took A twice", () => {
    const { m, atB } = scenario(new Threads({ k: 2, ox: 195, oy: 422 }, true), "commit-first");
    expect(Math.abs(m.jsView.k / atB.k - 1)).toBeGreaterThan(0.1); // the view the screen committed is not the one the fingers made
  });
  it("a view not ours (the «fit» button) drops the live transform whole, as before", () => {
    const m = new Threads({ k: 2, ox: 0, oy: 0 });
    for (let i = 0; i < 4; i++) m.frame(0.9);
    m.queue.push({ v: { k: 5, ox: 1, oy: 2 }, ref: null });
    m.uiSettles();
    expect(tfOf(m.st)).toEqual(IDENTITY);
  });
});

describe("#1403 guard: the wiring in CanvasView, the drawing screen and the grid", () => {
  const src = (f: string) => readFileSync(join(__dirname, "../src/modules/gutters", f), "utf8");
  const canvas = src("canvas/CanvasView.tsx");
  it("a commit carries the view it is against on the UI thread; the JS thread builds the view on it", () => {
    expect(canvas).toMatch(/scheduleOnRN\(commit, req\.S, req\.Tx, req\.Ty, vk\.value, vox\.value, voy\.value\)/);
    expect(canvas).toMatch(/applyTf\(bk > 0 \? \{ k: bk, ox: box, oy: boy \} : now\.current\.view, t\)/);
  });
  it("settleView hands the view to the UI thread and writes no shared value; applySettle re-bases and writes the view in one step", () => {
    const body = canvas.slice(canvas.indexOf("const settleView = "), canvas.indexOf("const applySettle = "));
    expect(body).toMatch(/scheduleOnUI\(applySettle, v\.k, v\.ox, v\.oy, ref\)/);
    expect(body).not.toMatch(/\.value\s*=/);
    const apply = canvas.slice(canvas.indexOf("const applySettle = "), canvas.indexOf("};", canvas.indexOf("const applySettle = ")));
    expect(apply).toMatch(/"worklet"/);
    expect(apply).toMatch(/rebase\(/);
    for (const sv of ["vk", "vox", "voy", "tx", "ty", "s", "fx", "fy"]) expect(apply).toMatch(new RegExp(`\\b${sv}\\.value = `));
  });
  it("the gestures' configs are made once: the canvas's (useMemo) and the drawing screen's that go with the pinch (useJsGestureConfig)", () => {
    expect(canvas).toMatch(/usePanGesture\(panConfig\)/);
    expect(canvas).toMatch(/usePinchGesture\(pinchConfig\)/);
    expect(canvas).not.toMatch(/use(Pan|Pinch)Gesture\(\{/);
    const draw = src("draw/DrawScreen.tsx");
    // every gesture of the drawing screen that runs with the canvas's pinch / pan has a config made once
    const withPinch = [...draw.matchAll(/const (\w+) = use(\w+)Gesture\(([\s\S]*?)\n {2}\}/g)].filter((m) => m[3]!.includes("simultaneousWith: [canvas.pinch, canvas.pan]"));
    expect(withPinch.map((m) => m[1])).toEqual(["pan", "tap"]);
    for (const m of withPinch) expect(m[3]!.startsWith("useJsGestureConfig<")).toBe(true);
  });
  it("the grid draws the view from the canvas's live (written with the transform), not from a copy of its own", () => {
    const grid = src("canvas/GridLayer.tsx");
    expect(grid).toMatch(/liveView\(vk\.value, vox\.value, voy\.value,/);
    expect(grid).not.toMatch(/useSharedValue|useLayoutEffect/);
  });
});
