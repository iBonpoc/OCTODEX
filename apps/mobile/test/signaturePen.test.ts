/**
 * #2215 — the signature pen: math of the spring (the pen catches the finger, no jumps, a touch is a dot, the same input
 * gives the same points), «Отменить штрих», and «shown = saved» (the stored path is the shown one, old paths unchanged).
 */
import { describe, expect, it } from "vitest";
import { PEN, penEnd, penMove, penStart, strokeController, strokePath, undoStroke, type Pt } from "../src/features/signaturePen";
import { SIG_BOX, fitSignature, normalizeSignature } from "../src/features/signaturePath";

const FRAME = 1 / 60;
function draw(path: Pt[], dt = FRAME) {
  const pen = penStart(path[0]!);
  for (const p of path.slice(1)) penMove(pen, p, dt);
  penEnd(pen, path[path.length - 1]!);
  return pen;
}
const line = (n: number, dx = 4): Pt[] => Array.from({ length: n }, (_, i) => ({ x: 10 + i * dx, y: 50 }));

describe("unit:signaturePen — the pen follows the finger", () => {
  it("catches up: it ends exactly at the finger's last point", () => {
    const pen = draw(line(40));
    expect(pen.points[pen.points.length - 1]).toEqual({ x: 10 + 39 * 4, y: 50 });
  });
  it("lags behind the finger while it moves (the spring) and starts under it", () => {
    const pen = penStart({ x: 0, y: 0 });
    penMove(pen, { x: 100, y: 0 }, FRAME);
    expect(pen.x).toBeGreaterThan(0);
    expect(pen.x).toBeLessThan(100);
    expect(pen.points[0]).toEqual({ x: 0, y: 0 });
  });
  it("no jumps: consecutive written points are ≥ MIN_STEP apart and never farther than a fast hand allows", () => {
    const pts = draw(line(60, 12)).points;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(d).toBeGreaterThanOrEqual(PEN.MIN_STEP - 1e-9);
      expect(d).toBeLessThan(12); // one 1/240 s step of a 720 px/s finger is 3 px; far below a jump
    }
  });
  it("a sharp corner is rounded: the pen does not pass through the corner point", () => {
    const corner: Pt[] = [...line(15, 6).map((p) => p), ...Array.from({ length: 15 }, (_, i) => ({ x: 10 + 14 * 6, y: 50 + (i + 1) * 6 }))];
    const pts = draw(corner).points;
    const cx = 10 + 14 * 6;
    const nearest = Math.min(...pts.map((p) => Math.hypot(p.x - cx, p.y - 50)));
    expect(nearest).toBeGreaterThan(0.5);
  });
  it("the tremor is damped: a finger jittering ±1 px makes a calmer path than the raw points", () => {
    const raw: Pt[] = Array.from({ length: 80 }, (_, i) => ({ x: 10 + i * 3, y: 50 + (i % 2 ? 1.5 : -1.5) }));
    const ys = draw(raw).points.map((p) => p.y).slice(5, -5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3);
  });
  it("a single touch gives a dot", () => {
    const pen = draw([{ x: 30, y: 40 }]);
    expect(pen.points).toEqual([{ x: 30, y: 40 }]);
    expect(strokePath(pen.points)).toBe("M30.0 40.0 L30.0 40.0 ");
  });
  it("a stalled frame (huge dt) does not make a jump: dt is clamped", () => {
    const a = penStart({ x: 0, y: 0 });
    const b = penStart({ x: 0, y: 0 });
    penMove(a, { x: 200, y: 0 }, 5);
    penMove(b, { x: 200, y: 0 }, PEN.MAX_DT);
    expect(a.x).toBeCloseTo(b.x, 9);
  });
  it("deterministic: the same events give the same points; the frame rate of the events does not matter at the end", () => {
    expect(draw(line(30)).points).toEqual(draw(line(30)).points);
    const slow = draw(line(30), 1 / 30).points;
    expect(slow[slow.length - 1]).toEqual({ x: 10 + 29 * 4, y: 50 });
  });
});

describe("unit:signaturePen — the stored signature", () => {
  it("the stored path format is the old one (M … L …), all numbers with one decimal", () => {
    const d = strokePath(draw(line(20)).points);
    expect(d).toMatch(/^M\d+\.\d \d+\.\d (L\d+\.\d \d+\.\d )+$/);
  });
  it("shown = saved: a phone-sized field is stored exactly as drawn; a wide field is only scaled evenly", () => {
    const d = strokePath(draw(line(40)).points);
    expect(normalizeSignature(d, 300, 120)).toBe(d);
    const wide = normalizeSignature(d, 800, 160);
    expect(fitSignature(wide)).toBe(wide);
    const xs = (wide.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(SIG_BOX.w);
  });
  it("old signatures (raw polylines) are drawn as before: fitSignature leaves a path inside the box untouched", () => {
    const old = "M10.0 20.0 L11.0 22.0 L15.5 30.0 ";
    expect(fitSignature(old)).toBe(old);
  });
  it("«Отменить штрих»: removes only the last stroke; with one stroke — everything; with none — nothing", () => {
    const a = strokePath(draw(line(10)).points);
    const b = strokePath(draw(line(10, 5)).points);
    expect(undoStroke(a + b)).toBe(a);
    expect(undoStroke(a)).toBe("");
    expect(undoStroke("")).toBe("");
    expect(undoStroke(undoStroke(a + b))).toBe("");
  });
});

describe("unit:signaturePen — the stroke controller (pad and full screen share it)", () => {
  it("draws on top of the existing path, one stroke per touch; up settles at the finger", () => {
    let d = "M1.0 1.0 L2.0 2.0 ";
    const s = strokeController(() => d, (v) => { d = v; });
    s.down({ x: 10, y: 10 }, 0);
    s.move({ x: 20, y: 10 }, 16);
    s.move({ x: 30, y: 10 }, 33);
    s.up();
    expect(d.startsWith("M1.0 1.0 L2.0 2.0 M10.0 10.0 ")).toBe(true);
    expect(d.trim().endsWith("L30.0 10.0")).toBe(true);
    s.down({ x: 50, y: 50 }, 100);
    s.up();
    expect(d.endsWith("M50.0 50.0 L50.0 50.0 ")).toBe(true);
    expect(undoStroke(d).endsWith("L30.0 10.0 ")).toBe(true);
  });
});
