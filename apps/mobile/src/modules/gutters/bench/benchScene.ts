/**
 * The speed bench's drawing (docs/specs/33-gutters-module.md §9: 50 lines / 40 downspouts / 150 labels). Deterministic:
 * five houses of ten lines each, eight downspouts a house, twelve storey marks a house (50 + 40 + 60 = 150 labels).
 */
import type { DrawnDownspout, DrawnRun, Drawing, P } from "../geometry";

export const BENCH = { houses: 5, runsPerHouse: 10, dsPerHouse: 8, marksPerHouse: 12 } as const;

/** ten corners of a house outline with three notches, inches */
function outline(i: number): P[] {
  const W = 480 + 60 * i, H = 360 + 48 * (i % 3), a = 120, b = 144, c = 96, d = 72, w1 = W - 168;
  return [[0, 0], [w1, 0], [w1, d], [W, d], [W, H - a], [W - b, H - a], [W - b, H], [b, H], [b, H - c], [0, H - c]];
}

export function benchDrawing(): { drawing: Drawing; marks: { id: string; at: P; story: number }[] } {
  const runs: DrawnRun[] = [];
  const downspouts: DrawnDownspout[] = [];
  const marks: { id: string; at: P; story: number }[] = [];
  for (let h = 0; h < BENCH.houses; h++) {
    const dx = (h % 2) * 900, dy = Math.floor(h / 2) * 700;
    const pts = outline(h).map(([x, y]): P => [x + dx, y + dy]);
    pts.forEach((p, j) => {
      const q = pts[(j + 1) % pts.length]!;
      const id = `b${h}r${j}`;
      runs.push({ id, a: p, b: q, attrs: { story: 1 + ((h + j) % 4) } as DrawnRun["attrs"] });
      if (j < BENCH.dsPerHouse) downspouts.push({ id: `b${h}d${j}`, runId: id, atIn: Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2) } as DrawnDownspout);
    });
    for (let m = 0; m < BENCH.marksPerHouse; m++) {
      const p = pts[m % pts.length]!;
      marks.push({ id: `b${h}m${m}`, at: [p[0] + 24 * (m >= pts.length ? 1 : 0), p[1] + 24], story: 1 + (m % 4) });
    }
  }
  return { drawing: { runs, downspouts }, marks };
}
