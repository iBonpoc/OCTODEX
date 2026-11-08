/**
 * The drawing as the painter sees it (docs/specs/33-gutters-canvas.md П20.1): plain data in screen pixels, no React.
 * The painter (SvgPainter today; Skia only if the device check fails — rule 17) draws exactly this, nothing else,
 * so swapping it changes one file. Plan coordinates are integer inches, x east, y north (geometry.ts).
 */
import { dsCode } from "./attrs";
import { capSide, centre, findCorners, houseSide, runEnds, runLengthIn, type Drawing, type P } from "../geometry";
import { ftIn } from "./format";
import { labelWidth, layoutLabels, type LabelWant, type PlacedLabel } from "./labels";

/** the view: screen = (x·k + ox, −y·k + oy) — north up */
export interface View { k: number; ox: number; oy: number }
export type Story = 1 | 2 | 3 | 4;
export const storyOf = (n: unknown): Story => (n === 2 || n === 3 ? n : typeof n === "number" && n >= 4 ? 4 : 1);

export const toScreen = (v: View, p: P): [number, number] => [p[0] * v.k + v.ox, -p[1] * v.k + v.oy];
export const toPlan = (v: View, s: [number, number]): P => [(s[0] - v.ox) / v.k, -(s[1] - v.oy) / v.k];

/** the view that fits plan points into a viewport with a margin (an empty drawing: 40 ft across, centred) */
export function fitView(pts: readonly P[], vp: { w: number; h: number }, margin: number): View {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1] = pts.length ? [Math.min(...xs), Math.max(...xs)] : [0, 480];
  const [y0, y1] = pts.length ? [Math.min(...ys), Math.max(...ys)] : [0, 480];
  const k = Math.min((vp.w - 2 * margin) / Math.max(x1 - x0, 1), (vp.h - 2 * margin) / Math.max(y1 - y0, 1));
  return { k, ox: vp.w / 2 - ((x0 + x1) / 2) * k, oy: vp.h / 2 + ((y0 + y1) / 2) * k };
}

/** zoom by `s` about a screen point (pinch focal point) */
export const zoomAt = (v: View, s: number, fx: number, fy: number): View => ({ k: v.k * s, ox: fx - (fx - v.ox) * s, oy: fy - (fy - v.oy) * s });
export const panBy = (v: View, dx: number, dy: number): View => ({ k: v.k, ox: v.ox + dx, oy: v.oy + dy });

export interface SceneRun {
  id: string; a: [number, number]; b: [number, number]; story: Story; selected: boolean;
  /** the gutter's face (founder 08.11): a thin line beside the run on the side away from the house */
  face: [[number, number], [number, number]];
}
/** an end cap (founder 08.11): left or right, looking at the face; a tap swaps both caps of the line */
export interface SceneCap { id: string; runId: string; end: 0 | 1; at: [number, number]; side: "L" | "R"; story: Story }
/** a corner: outside / inside (a tap swaps); an inside one gets a splash guard by itself */
export interface SceneCorner { id: string; runId: string; at: [number, number]; kind: "out" | "in" | "bay"; splash: boolean }
export interface SceneDs {
  id: string; at: [number, number]; story: Story; selected: boolean;
  /** «D1» inside the mark (founder 08.11) */
  text: string;
  /** just put: the mark blinks (founder 08.11) — the painter hides it on the off beat */
  dim?: boolean;
}
export interface SceneLabel extends PlacedLabel { text: string; kind: "len" | "ds" | "story" | "corner" }
/** the grid under the drawing (founder 08.11, as in CAD): minor and major lines as two paths; `stepIn` — a minor cell */
export interface SceneGrid { minor: string; major: string; stepIn: number }
export interface Scene { runs: SceneRun[]; ds: SceneDs[]; caps: SceneCap[]; corners: SceneCorner[]; labels: SceneLabel[]; grid?: SceneGrid }

/** a grid cell, inches: 1 ft, 5 ft, 10 ft, 50 ft, 100 ft, 500 ft — the smallest not finer than `minPx` on the screen */
export const GRID_STEPS_IN = [12, 60, 120, 600, 1200, 6000] as const;
export function gridStepIn(k: number, minPx: number): number {
  return GRID_STEPS_IN.find((s) => s * k >= minPx) ?? GRID_STEPS_IN[GRID_STEPS_IN.length - 1]!;
}

/** the grid lines over the viewport: every 5th is a major one (the next step up) */
export function buildGrid(v: View, vp: { w: number; h: number }, minPx: number): SceneGrid {
  const step = gridStepIn(v.k, minPx);
  const [x0, y1] = toPlan(v, [0, 0]);
  const [x1, y0] = toPlan(v, [vp.w, vp.h]);
  let minor = "", major = "";
  for (let i = Math.ceil(x0 / step); i * step <= x1; i++) {
    const sx = (i * step * v.k + v.ox).toFixed(1);
    const seg = `M${sx} 0V${vp.h}`;
    if (i % 5 === 0) major += seg; else minor += seg;
  }
  for (let j = Math.ceil(y0 / step); j * step <= y1; j++) {
    const sy = (-j * step * v.k + v.oy).toFixed(1);
    const seg = `M0 ${sy}H${vp.w}`;
    if (j % 5 === 0) major += seg; else minor += seg;
  }
  return { minor, major, stepIn: step };
}

export interface SceneOpts {
  view: View;
  viewport: { w: number; h: number };
  fontSize: number;
  padX: number;
  gap: number;
  selected?: string | null;
  /** the radius of a downspout's mark: its label stays off it (П20.8) */
  dsPad?: number;
  /** text of a downspout label and a storey label (i18n: «DS 3», «эт 2») */
  dsText: (n: number) => string;
  storyText: (n: Story) => string;
  /** a corner's chip (i18n: «наруж.», «внутр. · брызги»); none — no chip (the speed bench) */
  cornerText?: (kind: SceneCorner["kind"], splash: boolean) => string;
  /** how far the face line stands off the run, px */
  faceOff?: number;
  /** extra labels (the bench: up to 150 in all) — anchored at a plan point */
  extra?: { id: string; at: P; text: string; kind: SceneLabel["kind"] }[];
  /** the canvas: a run's label is «12′ · эт 2» (founder О3: colour + word); the bench marks storeys apart */
  lenWithStory?: boolean;
  /** a downspout just put, on its off beat: drawn dim (the blink) */
  dimDs?: string | null;
  /** the grid (founder 08.11): its smallest cell on the screen, px; none — no grid (the speed bench) */
  gridMinPx?: number;
  /** the speed bench: draw every label even where it would overlap (the worst load) */
  keepAll?: boolean;
}

export function buildScene(d: Drawing, o: SceneOpts): Scene {
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const c = centre(d.runs);
  const off = (o.faceOff ?? 0) / (o.view.k || 1);
  const runs: SceneRun[] = d.runs.map((r) => {
    const vx = r.b[0] - r.a[0], vy = r.b[1] - r.a[1];
    const L = Math.hypot(vx, vy) || 1;
    // right of a→b in plan (north up) is (vy, −vx); the face is the side away from the house
    const sgn = houseSide(r, c) === "L" ? 1 : -1;
    const n: P = [(vy / L) * off * sgn, (-vx / L) * off * sgn];
    const fa: P = [r.a[0] + n[0], r.a[1] + n[1]], fb: P = [r.b[0] + n[0], r.b[1] + n[1]];
    return { id: r.id, a: toScreen(o.view, r.a), b: toScreen(o.view, r.b), story: storyOf(r.attrs.story), selected: r.id === o.selected, face: [toScreen(o.view, fa), toScreen(o.view, fb)] };
  });
  const found = findCorners(d);
  const ends = runEnds(d, found);
  const caps: SceneCap[] = [];
  for (const r of d.runs) {
    const side = houseSide(r, c);
    ([0, 1] as const).forEach((e) => {
      if (ends[r.id]?.[e]?.kind !== "cap") return;
      caps.push({ id: `cap:${r.id}:${e}`, runId: r.id, end: e, at: toScreen(o.view, e ? r.b : r.a), side: capSide(e, side), story: storyOf(r.attrs.story) });
    });
  }
  const corners: SceneCorner[] = found.map((f) => ({
    id: f.id, runId: f.runs[0].id, at: toScreen(o.view, f.at), kind: f.kind,
    splash: d.corners?.[f.id]?.splashGuard ?? f.kind === "in",
  }));
  const ds: SceneDs[] = [];
  for (const s of d.downspouts) {
    const r = byId.get(s.runId);
    if (!r) continue;
    // atIn is along the run's length (typed wins over drawn, geometry.ts)
    const t = Math.min(1, Math.max(0, s.atIn / (runLengthIn(r) || 1)));
    const at: P = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
    ds.push({ id: s.id, at: toScreen(o.view, at), story: storyOf(r.attrs.story), selected: s.id === o.selected, text: o.dsText(ds.length + 1), ...(o.dimDs === s.id ? { dim: true } : {}) });
  }
  const h = Math.ceil(o.fontSize * 1.4);
  const texts = new Map<string, { text: string; kind: SceneLabel["kind"] }>();
  const want: LabelWant[] = [];
  const add = (id: string, a: [number, number], b: [number, number], text: string, kind: SceneLabel["kind"], priority: number, pad?: number) => {
    texts.set(id, { text, kind });
    want.push({ id, a, b, w: labelWidth(text, o.fontSize, o.padX), h, priority, pad });
  };
  d.runs.forEach((r, i) => {
    const s = runs[i]!;
    add(`len:${r.id}`, s.a, s.b, o.lenWithStory ? `${ftIn(runLengthIn(r))} · ${o.storyText(s.story)}` : ftIn(runLengthIn(r)), "len", runLengthIn(r) + (s.selected ? 1e6 : 0));
  });
  // over the mark: its fittings in one word («AABO⁴», founder 08.11); the number is inside the mark
  const dsById = new Map(d.downspouts.map((x) => [x.id, x]));
  ds.forEach((s) => {
    const code = dsCode(dsById.get(s.id)!);
    if (code) add(`ds:${s.id}`, s.at, s.at, code, "ds", -1, o.dsPad);
  });
  if (o.cornerText) for (const k of corners) add(`corner:${k.id}`, k.at, k.at, o.cornerText(k.kind, k.splash), "corner", -1, o.dsPad);
  for (const x of o.extra ?? []) {
    const p = toScreen(o.view, x.at);
    add(`x:${x.id}`, p, p, x.text, x.kind, -2);
  }
  const marks = o.dsPad ? [...ds.map((x) => x.at), ...caps.map((x) => x.at), ...corners.map((x) => x.at)].map((at) => ({ at, r: o.dsPad! })) : [];
  const placed = layoutLabels(want, o.viewport, o.gap, o.keepAll, marks);
  return { runs, ds, caps, corners, labels: placed.map((p) => ({ ...p, ...texts.get(p.id)! })), ...(o.gridMinPx ? { grid: buildGrid(o.view, o.viewport, o.gridMinPx) } : {}) };
}
