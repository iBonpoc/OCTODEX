/**
 * The drawing as the painter sees it (docs/specs/33-gutters-canvas.md П20.1): plain data in screen pixels, no React.
 * The painter (SvgPainter today; Skia only if the device check fails — rule 17) draws exactly this, nothing else,
 * so swapping it changes one file. Plan coordinates are integer inches, x east, y north (geometry.ts).
 */
import { runLengthIn, type Drawing, type P } from "../geometry";
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

export interface SceneRun { id: string; a: [number, number]; b: [number, number]; story: Story; selected: boolean }
export interface SceneDs { id: string; at: [number, number]; story: Story; selected: boolean }
export interface SceneLabel extends PlacedLabel { text: string; kind: "len" | "ds" | "story" }
export interface Scene { runs: SceneRun[]; ds: SceneDs[]; labels: SceneLabel[] }

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
  /** extra labels (the bench: up to 150 in all) — anchored at a plan point */
  extra?: { id: string; at: P; text: string; kind: SceneLabel["kind"] }[];
  /** the canvas: a run's label is «12′ · эт 2» (founder О3: colour + word); the bench marks storeys apart */
  lenWithStory?: boolean;
  /** the speed bench: draw every label even where it would overlap (the worst load) */
  keepAll?: boolean;
}

export function buildScene(d: Drawing, o: SceneOpts): Scene {
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const runs: SceneRun[] = d.runs.map((r) => ({ id: r.id, a: toScreen(o.view, r.a), b: toScreen(o.view, r.b), story: storyOf(r.attrs.story), selected: r.id === o.selected }));
  const ds: SceneDs[] = [];
  for (const s of d.downspouts) {
    const r = byId.get(s.runId);
    if (!r) continue;
    // atIn is along the run's length (typed wins over drawn, geometry.ts)
    const t = Math.min(1, Math.max(0, s.atIn / (runLengthIn(r) || 1)));
    const at: P = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
    ds.push({ id: s.id, at: toScreen(o.view, at), story: storyOf(r.attrs.story), selected: s.id === o.selected });
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
  ds.forEach((s, i) => add(`ds:${s.id}`, s.at, s.at, o.dsText(i + 1), "ds", -1, o.dsPad));
  for (const x of o.extra ?? []) {
    const p = toScreen(o.view, x.at);
    add(`x:${x.id}`, p, p, x.text, x.kind, -2);
  }
  const placed = layoutLabels(want, o.viewport, o.gap, o.keepAll, o.dsPad ? ds.map((x) => ({ at: x.at, r: o.dsPad! })) : []);
  return { runs, ds, labels: placed.map((p) => ({ ...p, ...texts.get(p.id)! })) };
}
