/**
 * #1403 (founder 14.11, iPhone: «прыгает, то больше, то меньше… пальцы отлипают»), after #1458 (settle on a new view only).
 * Two causes left, both between the threads:
 * 1. The settle read the live transform on the JS thread and wrote it back a moment later. The fingers change it on the UI thread between
 *    frames, so the frames in between were lost: the drawing jumped under the fingers. Now the JS thread only says which commit was rendered
 *    (`settleDone`), and the UI thread subtracts it from the live transform as it is there (`settleLive`), in one step with the committed view.
 * 2. The gestures' configs were new objects on every render. RNGH 3 keys its handler on the config object, so every render of the screen
 *    sent the config to the native handler and registered the gesture again, in the middle of a pinch too. Now they are made once.
 * The math is a model of the two threads here; the wiring is a source guard. The device is the proof (rule 27).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTf, idleState, pinchFrame, settle, settleDone, settleLive, sub, type LiveState, type Pending, type Tf, type View } from "../src/modules/gutters/canvas/gestureState";

const tfOf = (st: LiveState): Tf => ({ S: st.S, Tx: st.Tx, Ty: st.Ty });
const screen = (v: View, t: Tf, x: number, y: number) => {
  const w = applyTf(v, t);
  return [x * w.k + w.ox, -y * w.k + w.oy];
};

describe("settleDone + settleLive = settle (the two halves of one step)", () => {
  const v = (k: number): View => ({ k, ox: 0, oy: 0 });
  it("a view of ours: `done` is its commit; the later pending ones are re-based on it; the live transform loses exactly it", () => {
    const a: Pending = { view: v(2), tf: { S: 2, Tx: 10, Ty: 5 } };
    const b: Pending = { view: v(4), tf: { S: 4, Tx: 30, Ty: -2 } };
    const r = settleDone([a, b], a.view);
    expect(r.done).toEqual(a.tf);
    expect(r.pending).toEqual([{ view: b.view, tf: sub(b.tf, a.tf) }]);
    const live = { S: 3, Tx: 25, Ty: 9 };
    expect(settleLive(live, r.done)).toEqual(sub(live, a.tf));
    expect(settle(live, [a, b], a.view)).toEqual({ live: sub(live, a.tf), pending: r.pending });
  });
  it("a view not ours (the «fit» button, a new size): no `done`, nothing pending, the live transform goes whole", () => {
    expect(settleDone([{ view: v(2), tf: { S: 2, Tx: 0, Ty: 0 } }], v(9))).toEqual({ done: null, pending: [] });
    expect(settleLive({ S: 3, Tx: 1, Ty: 2 }, null)).toEqual({ S: 1, Tx: 0, Ty: 0 });
  });
});

describe("#1403: the settle on the UI thread keeps every frame of a pinch that goes on before the render of its commit", () => {
  // a pinch out, a finger lifts for a frame (the segment closes: a commit), lands again, and the pinch goes on. The commit's render
  // arrives on the JS thread a few frames later; the settle the JS thread asked for runs on the UI thread a few frames after that.
  const view0: View = { k: 2, ox: 195, oy: 422 };
  const plan = [10, 20] as const; // a plan point under the fingers
  const run = (onJs: boolean) => {
    const st = idleState();
    const f = { focalX: 195, focalY: 422 };
    for (let i = 0; i < 10; i++) pinchFrame(st, { scaleChange: 0.97, numberOfPointers: 2, ...f });
    const done = pinchFrame(st, { scaleChange: 1, numberOfPointers: 1, ...f })!; // a finger lifts: the segment's commit
    const view1 = applyTf(view0, done);
    const pending: Pending[] = [{ view: view1, tf: done }];
    pinchFrame(st, { scaleChange: 1, numberOfPointers: 2, ...f }); // it lands again: the first frame is the jump itself, nothing moves
    for (let i = 0; i < 4; i++) pinchFrame(st, { scaleChange: 0.97, numberOfPointers: 2, ...f });
    const readOnJs = tfOf(st); // the render arrived: the old settle read the live transform here, on the JS thread…
    for (let i = 0; i < 3; i++) pinchFrame(st, { scaleChange: 0.97, numberOfPointers: 2, ...f }); // …the fingers went on, on the UI thread…
    const shown = screen(view0, tfOf(st), ...plan); // what the screen showed under the fingers the frame before the settle
    const r = settleDone(pending, view1);
    const next = settleLive(onJs ? readOnJs : tfOf(st), r.done); // …and wrote it back: the 3 frames are gone. On the UI thread: none is
    return { shown, after: screen(view1, next, ...plan) };
  };
  it("on the UI thread (now): the same plan point stays at the same screen point across the settle — no jump", () => {
    const { shown, after } = run(false);
    expect(after[0]).toBeCloseTo(shown[0]!, 6);
    expect(after[1]).toBeCloseTo(shown[1]!, 6);
  });
  it("read on the JS thread and written back (before): the drawing jumped under the fingers (the frames between were lost)", () => {
    const { shown, after } = run(true);
    expect(Math.hypot(after[0]! - shown[0]!, after[1]! - shown[1]!)).toBeGreaterThan(1);
  });
});

describe("#1403 guard: the wiring in CanvasView and the grid", () => {
  const src = (f: string) => readFileSync(join(__dirname, "../src/modules/gutters/canvas", f), "utf8");
  const canvas = src("CanvasView.tsx");
  it("settleView hands the commit to the UI thread and writes no shared value itself", () => {
    const body = canvas.slice(canvas.indexOf("const settleView = "), canvas.indexOf("const applySettle = "));
    expect(body).toMatch(/scheduleOnUI\(applySettle, v\.k, v\.ox, v\.oy, r\.done\)/);
    expect(body).not.toMatch(/\.value\s*=/);
    const apply = canvas.slice(canvas.indexOf("const applySettle = "), canvas.indexOf("};", canvas.indexOf("const applySettle = ")));
    expect(apply).toMatch(/"worklet"/);
    // the view and the live transform in one step
    for (const sv of ["vk", "vox", "voy", "tx", "ty", "s", "fx", "fy"]) expect(apply).toMatch(new RegExp(`\\b${sv}\\.value = `));
  });
  it("the gestures' configs are made once (useMemo), not as a new object on every render", () => {
    expect(canvas).toMatch(/usePanGesture\(panConfig\)/);
    expect(canvas).toMatch(/usePinchGesture\(pinchConfig\)/);
    expect(canvas).toMatch(/const panConfig = useMemo\(/);
    expect(canvas).toMatch(/const pinchConfig = useMemo\(/);
    expect(canvas).not.toMatch(/use(Pan|Pinch)Gesture\(\{/);
  });
  it("the grid draws the committed view from the canvas's live (written with the transform), not from its own copy", () => {
    const grid = src("GridLayer.tsx");
    expect(grid).toMatch(/liveView\(vk\.value, vox\.value, voy\.value,/);
    expect(grid).not.toMatch(/useSharedValue|useLayoutEffect/);
  });
});
