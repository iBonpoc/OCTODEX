import { component } from "@octo/design-tokens";

/**
 * The smooth pen (#2215, step 1): how a signature is DRAWN — never how it is stored. The stored path stays what it was (M/L, every
 * point of the finger, `signaturePath.ts`: a client's signature is legally meaningful); only the picture smooths it:
 * - the line goes through the midpoints of the finger's points with each point as the control of a quadratic curve (no corners,
 *   no point dropped: every point of the stroke is in the drawn path);
 * - the width follows the finger's speed — the length of a step between two samples, in field pixels (`unit` = pixels of the
 *   canvas per field pixel, so the full-screen canvas, the preview and the PDF look alike): slow → thicker, fast → thinner, within
 *   `component.signInk` thin..thick × the base width; it follows by `follow` per step (no jumps) and is drawn in `levels` steps,
 *   one path per step (a handful of paths, not one per point).
 * Pure: test/signatureInk.test.ts (rule 27: no jumps, no point lost, the width's limits).
 */
export type Pt = { x: number; y: number };

const CMD = /([ML])\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g;

/** the strokes of a stored path: each M starts one, each L adds a point */
export function parseStrokes(d: string): Pt[][] {
  const out: Pt[][] = [];
  for (const m of d.matchAll(CMD)) {
    const p = { x: Number(m[2]), y: Number(m[3]) };
    if (m[1] === "M" || !out.length) out.push([p]);
    else out[out.length - 1]!.push(p);
  }
  return out;
}

export const strokeCount = (d: string): number => parseStrokes(d).length;

/** «Отменить штрих»: the stored path without its last stroke (the rest is kept character for character) */
export function undoStroke(d: string): string {
  const i = d.lastIndexOf("M");
  return i <= 0 ? "" : d.slice(0, i);
}

const r1 = (n: number) => String(Math.round(n * 10) / 10);
const pt = (p: Pt) => `${r1(p.x)} ${r1(p.y)}`;
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * The pieces of one smoothed stroke: piece k goes from anchor k to anchor k+1 (anchors: the first point, the midpoints, the last
 * point) with the finger's point between them as the control. A dot (one point) is a zero-length line — a round cap draws it.
 */
export function strokePieces(pts: readonly Pt[]): string[] {
  if (!pts.length) return [];
  if (pts.length === 1) return [`M${pt(pts[0]!)} L${pt(pts[0]!)}`];
  if (pts.length === 2) return [`M${pt(pts[0]!)} L${pt(pts[1]!)}`];
  const n = pts.length;
  const out: string[] = [];
  let from = pts[0]!;
  for (let i = 1; i < n - 1; i++) {
    const to = mid(pts[i]!, pts[i + 1]!);
    out.push(`M${pt(from)} Q${pt(pts[i]!)} ${pt(to)}`);
    from = to;
  }
  out.push(`M${pt(from)} L${pt(pts[n - 1]!)}`);
  return out;
}

/** one smoothed stroke as one path (the same curve as its pieces, joined) */
export function smoothStroke(pts: readonly Pt[]): string {
  return strokePieces(pts)
    .map((p, i) => (i === 0 ? p : p.replace(/^M\S+ \S+ /, "")))
    .join(" ");
}

/**
 * The width of each piece of a stroke (as many as `strokePieces`): from the speed of the step under it, eased by `follow`,
 * held within thin..thick × base. The first piece starts at its own target — no jump from nothing.
 */
export function pieceWidths(pts: readonly Pt[], base: number, unit = 1): number[] {
  const ink = component.signInk;
  const lo = ink.thin * base;
  const hi = ink.thick * base;
  const target = (len: number) => {
    const t = Math.min(1, Math.max(0, (len / (unit > 0 ? unit : 1) - ink.slow) / (ink.fast - ink.slow)));
    return hi - t * (hi - lo);
  };
  const pieces = pts.length <= 2 ? 1 : pts.length - 1;
  const steps: number[] = [];
  for (let i = 0; i < pieces; i++) {
    const a = pts[Math.min(i, pts.length - 1)]!;
    const b = pts[Math.min(i + 1, pts.length - 1)]!;
    steps.push(dist(a, b));
  }
  const out: number[] = [];
  let w = target(steps[0] ?? 0);
  for (const s of steps) {
    w += (target(s) - w) * (out.length ? ink.follow : 1);
    out.push(Math.min(hi, Math.max(lo, w)));
  }
  return out;
}

/** a width → one of `levels` steps between thin and thick (the drawn width) */
export function inkLevel(w: number, base: number): number {
  const ink = component.signInk;
  const lo = ink.thin * base;
  const hi = ink.thick * base;
  const k = Math.round(((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * (ink.levels - 1));
  return Math.round((lo + (k * (hi - lo)) / (ink.levels - 1)) * 100) / 100;
}

/** the whole signature as a few paths, one per width step (thinnest first); `d` is the stored path, untouched */
export function inkPaths(d: string, base: number, unit = 1): { d: string; w: number }[] {
  const by = new Map<number, string[]>();
  for (const stroke of parseStrokes(d)) {
    const pieces = strokePieces(stroke);
    const widths = pieceWidths(stroke, base, unit);
    pieces.forEach((p, i) => {
      const w = inkLevel(widths[i] ?? base, base);
      const list = by.get(w) ?? [];
      list.push(p);
      by.set(w, list);
    });
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([w, list]) => ({ w, d: list.join(" ") }));
}
