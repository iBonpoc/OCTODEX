/**
 * Length labels that never overlap (docs/specs/33-gutters-canvas.md П20.2 №10). Pure, screen pixels.
 * Each label wants to sit beside its anchor (a line's middle, a downspout); candidates are tried in order —
 * either side of the line, then slid along it — and the first one that hits no placed label and stays inside the
 * viewport wins. Labels go by priority (longer lines first): what does not fit is hidden, not drawn on top. A place off
 * every drawn line (and off every mark) is preferred to one over a line (#1185, the founder's «David Kim» sample: words
 * lay on gutters and ticks when the drawing was zoomed out).
 */
export interface LabelWant {
  id: string;
  /** anchor segment in screen px (a point: a === b) */
  a: [number, number];
  b: [number, number];
  w: number;
  h: number;
  /** higher goes first */
  priority: number;
  /** a point drawn as a marker: keep the label this far off it (the downspout's mark, П20.8) */
  pad?: number;
  /** the label may lie over a line when there is no clear place (a long gutter's length, the picked one's): the others are
   *  hidden instead — a word on a line it does not belong to reads as someone else's (#1185) */
  must?: boolean;
}
export interface PlacedLabel {
  id: string;
  /** centre, screen px */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Box { x0: number; y0: number; x1: number; y1: number }

const boxOf = (x: number, y: number, w: number, h: number): Box => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
/** the work of the last layouts, for the speed test: how many segment-vs-box checks were made (a count does not depend on the machine) */
export const work = { segTests: 0 };
export const overlaps = (p: Box, q: Box) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;

/** does the segment a–b cross the box (Liang–Barsky)? */
export function segmentHitsBox(a: [number, number], b: [number, number], q: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, d] of [[a[0] - q.x0, -dx], [q.x1 - a[0], dx], [a[1] - q.y0, -dy], [q.y1 - a[1], dy]] as const) {
    if (d === 0) {
      if (p < 0) return false;
    } else {
      const r = p / d;
      if (d < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** where a label may sit for its anchor, best first */
export function candidates(l: LabelWant, gap: number): [number, number][] {
  const [ax, ay] = l.a;
  const [bx, by] = l.b;
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  // the normal of the line (a point: straight up); the label's half-extent along the normal keeps it off the line
  const [nx, ny] = L > 0 ? [-dy / L, dx / L] : [0, -1];
  const pad = l.pad ?? 0;
  const reach = Math.abs(nx) * (l.w / 2) + Math.abs(ny) * (l.h / 2) + gap + pad;
  const out: [number, number][] = [];
  const along = L > 0 ? [0.5, 0.3, 0.7, 0.15, 0.85, 0.05, 0.95] : [0.5];
  // beside the line first; then a little further off it (the room next to a short run is taken by its neighbours)
  for (const far of [1, 1.8]) {
    for (const t of along) {
      const cx = ax + dx * t;
      const cy = ay + dy * t;
      out.push([cx + nx * reach * far, cy + ny * reach * far], [cx - nx * reach * far, cy - ny * reach * far]);
    }
  }
  if (L === 0) out.push([ax + l.w / 2 + gap * 2 + pad, ay], [ax - l.w / 2 - gap * 2 - pad, ay], [ax, ay + l.h + gap + pad]);
  return out;
}

/** Greedy placement; a uniform grid (labels, and the drawn lines by the cells they pass) keeps a candidate's check to the few
 *  neighbours in its cells, not to every line of the drawing (#1198 review: 150 gutters stay within a frame). */
/** `keepAll` (the speed bench only): a label with no free place still goes to its first place — the worst load;
 *  `marks` — drawn points no label may cover (a downspout's mark, spec 33 П20.8) */
export function layoutLabels(want: readonly LabelWant[], viewport: { w: number; h: number }, gap: number, keepAll = false, marks: readonly { at: [number, number]; r: number }[] = [], lines: readonly { a: [number, number]; b: [number, number] }[] = []): PlacedLabel[] {
  const cell = 64;
  const grid = new Map<number, Box[]>();
  const keys = (b: Box) => {
    const ks: number[] = [];
    for (let i = Math.floor(b.x0 / cell); i <= Math.floor(b.x1 / cell); i++)
      for (let j = Math.floor(b.y0 / cell); j <= Math.floor(b.y1 / cell); j++) ks.push(i * 100_003 + j);
    return ks;
  };
  const free = (b: Box) => keys(b).every((k) => !(grid.get(k) ?? []).some((q) => overlaps(b, q)));
  const inside = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= viewport.w && b.y1 <= viewport.h;
  // a mark is avoided where there is room; a label with no room but over a mark still shows (a length is never lost)
  const markBoxes = marks.map((m) => boxOf(m.at[0], m.at[1], m.r * 2, m.r * 2));
  const offMarks = (b: Box) => !markBoxes.some((q) => overlaps(b, q));
  // the drawn lines, put into the same cells they pass through: a candidate looks only at the lines of its own cells
  const lineGrid = new Map<number, { a: [number, number]; b: [number, number] }[]>();
  for (const l of lines) {
    const n = Math.max(1, Math.ceil(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) / (cell / 2)));
    const seen = new Set<number>();
    // a step of half a cell can not skip one; the neighbours of a point are added for a box that only touches the edge
    for (let i = 0; i <= n; i++) {
      const x = l.a[0] + ((l.b[0] - l.a[0]) * i) / n, y = l.a[1] + ((l.b[1] - l.a[1]) * i) / n;
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const k = (Math.floor(x / cell) + dx) * 100_003 + (Math.floor(y / cell) + dy);
        if (!seen.has(k)) { seen.add(k); (lineGrid.get(k) ?? lineGrid.set(k, []).get(k)!).push(l); }
      }
    }
  }
  const offLines = (b: Box) => {
    if (lines.length === 0) return true;
    for (const k of keys(b)) for (const q of lineGrid.get(k) ?? []) {
      work.segTests++;
      if (segmentHitsBox(q.a, q.b, b)) return false;
    }
    return true;
  };
  const order = [...want].sort((p, q) => q.priority - p.priority || (p.id < q.id ? -1 : 1));
  const out: PlacedLabel[] = [];
  for (const l of order) {
    const cs = candidates(l, gap);
    const ok = (x: number, y: number) => {
      const b = boxOf(x, y, l.w, l.h);
      return inside(b) && free(b);
    };
    const clear = (x: number, y: number, marks: boolean, lines: boolean) => {
      const b = boxOf(x, y, l.w, l.h);
      return (!marks || offMarks(b)) && (!lines || offLines(b));
    };
    // best: off the marks and off every line; then off the lines only (a mark is covered rather than a length lost); a
    // label that `must` show may then lie over a line, any other is hidden (#1185); the speed bench draws all
    const at =
      cs.find(([x, y]) => ok(x, y) && clear(x, y, true, true)) ??
      cs.find(([x, y]) => ok(x, y) && clear(x, y, false, true)) ??
      (l.must || lines.length === 0 ? (cs.find(([x, y]) => ok(x, y) && clear(x, y, true, false)) ?? cs.find(([x, y]) => ok(x, y))) : undefined) ??
      (keepAll ? cs[0] : undefined);
    if (!at) continue;
    const b = boxOf(at[0], at[1], l.w, l.h);
    for (const k of keys(b)) (grid.get(k) ?? grid.set(k, []).get(k)!).push(b);
    out.push({ id: l.id, x: at[0], y: at[1], w: l.w, h: l.h });
  }
  return out;
}

/** an estimate of a label's width without measuring text: tabular digits of the app font ≈ 0.6 em */
export const labelWidth = (text: string, fontSize: number, padX: number) => Math.ceil(text.length * fontSize * 0.6) + padX * 2;
