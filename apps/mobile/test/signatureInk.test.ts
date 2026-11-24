/**
 * The smooth pen (#2215, rule 27 а): the math of how a signature is drawn — no jumps, no point lost, the width within its limits,
 * the stored path untouched (it stays M/L with every point, signaturePath.ts).
 */
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { inkLevel, inkPaths, parseStrokes, pieceWidths, smoothStroke, strokeCount, strokePieces, undoStroke, type Pt } from "../src/features/signatureInk";
import { normalizeSignature, scale } from "../src/features/signaturePath";

const BASE = component.signStroke;
const ink = component.signInk;
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
/** a stored path from points, as the pad writes it */
const stored = (...strokes: Pt[][]) => strokes.map((s) => s.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `).join("")).join("");
/** a zig-zag at a given step: a fast or a slow finger */
const zig = (n: number, step: number, x0 = 10, y0 = 80): Pt[] => Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: y0 + (i % 2 ? step : -step) / 2 }));

/** points along the drawn curve (quadratic pieces sampled) */
function sample(pts: Pt[], per = 8): Pt[] {
  const out: Pt[] = [];
  for (const piece of strokePieces(pts)) {
    const n = nums(piece);
    const [ax, ay] = [n[0]!, n[1]!];
    if (piece.includes("Q")) {
      const [cx, cy, bx, by] = [n[2]!, n[3]!, n[4]!, n[5]!];
      for (let i = 0; i <= per; i++) {
        const t = i / per;
        out.push({ x: (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, y: (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by });
      }
    } else out.push({ x: ax, y: ay }, { x: n[2]!, y: n[3]! });
  }
  return out;
}

describe("parse / undo a stroke", () => {
  it("each M is a stroke, each L a point", () => {
    const d = stored([{ x: 1, y: 2 }, { x: 3, y: 4 }], [{ x: 5, y: 6 }]);
    expect(parseStrokes(d)).toEqual([[{ x: 1, y: 2 }, { x: 3, y: 4 }], [{ x: 5, y: 6 }]]);
    expect(strokeCount(d)).toBe(2);
    expect(strokeCount("")).toBe(0);
  });
  it("«Отменить штрих» removes only the last stroke; the rest is kept character for character", () => {
    const a = stored(zig(5, 3));
    const b = stored(zig(4, 2, 100));
    expect(undoStroke(a + b)).toBe(a);
    expect(undoStroke(a)).toBe("");
    expect(undoStroke("")).toBe("");
  });
});

describe("smoothing — through the midpoints, every point kept", () => {
  it("no point is lost: every finger point is in the drawn path (ends exactly, the rest as controls)", () => {
    const pts = zig(12, 7);
    const out = smoothStroke(pts);
    const drawn = nums(out);
    for (const p of pts) expect(drawn.join(" ")).toContain(`${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`);
    const first = drawn.slice(0, 2);
    const last = drawn.slice(-2);
    expect(first).toEqual([pts[0]!.x, pts[0]!.y]);
    expect(last).toEqual([pts[pts.length - 1]!.x, pts[pts.length - 1]!.y]);
  });
  it("one piece per step, joined end to start (no gap, no jump between pieces)", () => {
    const pts = zig(9, 6);
    const pieces = strokePieces(pts);
    expect(pieces).toHaveLength(pts.length - 1);
    for (let i = 1; i < pieces.length; i++) {
      const prev = nums(pieces[i - 1]!);
      const cur = nums(pieces[i]!);
      expect(cur.slice(0, 2)).toEqual(prev.slice(-2));
    }
  });
  it("no jump: the drawn line moves no further between samples than the finger's own step, and stays in the points' box", () => {
    const pts = zig(20, 9);
    const s = sample(pts);
    const maxStep = Math.max(...pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y)));
    for (let i = 1; i < s.length; i++) expect(Math.hypot(s[i]!.x - s[i - 1]!.x, s[i]!.y - s[i - 1]!.y)).toBeLessThanOrEqual(maxStep + 0.1);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    for (const p of s) {
      expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.1);
      expect(p.x).toBeLessThanOrEqual(Math.max(...xs) + 0.1);
      expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.1);
      expect(p.y).toBeLessThanOrEqual(Math.max(...ys) + 0.1);
    }
  });
  it("a dot and a two-point stroke are drawn too (a tap is part of a signature)", () => {
    expect(strokePieces([{ x: 5, y: 5 }])).toEqual(["M5 5 L5 5"]);
    expect(strokePieces([{ x: 5, y: 5 }, { x: 9, y: 7 }])).toEqual(["M5 5 L9 7"]);
  });
});

describe("width from speed — within its limits, no jumps", () => {
  const lo = ink.thin * BASE;
  const hi = ink.thick * BASE;
  it("slow is thick, fast is thin, never outside thin..thick × base", () => {
    const slow = pieceWidths(zig(30, 1), BASE);
    const fast = pieceWidths(zig(30, 60), BASE);
    for (const w of [...slow, ...fast]) {
      expect(w).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(w).toBeLessThanOrEqual(hi + 1e-9);
    }
    expect(slow[slow.length - 1]).toBeCloseTo(hi, 5);
    expect(fast[fast.length - 1]).toBeCloseTo(lo, 5);
  });
  it("no jump: from slow to fast the width changes at most `follow` of the range per step", () => {
    const pts = [...zig(15, 1), ...zig(15, 50, 30)];
    const w = pieceWidths(pts, BASE);
    for (let i = 1; i < w.length; i++) expect(Math.abs(w[i]! - w[i - 1]!)).toBeLessThanOrEqual(ink.follow * (hi - lo) + 1e-9);
  });
  it("as many widths as pieces", () => {
    for (const n of [1, 2, 3, 10]) expect(pieceWidths(zig(n, 4), BASE)).toHaveLength(strokePieces(zig(n, 4)).length);
  });
  it("the drawn widths are `levels` steps from thin to thick", () => {
    const levels = new Set(Array.from({ length: 101 }, (_, i) => inkLevel(lo + ((hi - lo) * i) / 100, BASE)));
    expect(levels.size).toBe(ink.levels);
    expect(Math.min(...levels)).toBeCloseTo(lo, 2);
    expect(Math.max(...levels)).toBeCloseTo(hi, 2);
    expect(inkLevel(hi * 3, BASE)).toBeCloseTo(hi, 2);
    expect(inkLevel(0, BASE)).toBeCloseTo(lo, 2);
  });
  it("the same look on any canvas: a path scaled by k with unit k gets the same widths (full screen, preview, PDF)", () => {
    const d = stored(zig(12, 5), zig(8, 20, 200));
    const k = 2.5;
    expect(inkPaths(scale(d, k), BASE, k).map((p) => p.w)).toEqual(inkPaths(d, BASE).map((p) => p.w));
  });
});

describe("the stored path is untouched", () => {
  it("inkPaths only draws: the stored path stays M/L with every point, and is saved as before", () => {
    const d = stored(zig(10, 4), zig(5, 9, 150));
    const copy = d.slice();
    const paths = inkPaths(d, BASE);
    expect(d).toBe(copy);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(ink.levels);
    expect(/^[ML0-9. -]+$/.test(normalizeSignature(d, 358, 160))).toBe(true);
    // every stroke piece is drawn once, at one width
    const pieces = parseStrokes(d).reduce((n, s) => n + strokePieces(s).length, 0);
    expect(paths.reduce((n, p) => n + (p.d.match(/M/g) ?? []).length, 0)).toBe(pieces);
  });
});
