/**
 * «Просмотр замера» (founder 09.11, #698; spec 33 П20.25 п.3): what the drawing is made of, as a list to read before an
 * estimate or a cut — the gutters (№, along the wall / along the face, storey, profile and size, colour), the corners (the
 * cut of each of their gutters), the downspouts (elbows, offsets) and the parts with their quantities. Pure: the drawing
 * and the engine's parts in, rows out (the screen words them). Numbers are the drawing's own: gutter №n is the n-th
 * drawn (as the corner sheet says «Желоб n»), DS n the n-th downspout (as the canvas label).
 */
import type { PartQty } from "@octo/estimating-engine";
import { cornerCut, findCorners, type Drawing, type FoundCorner } from "../geometry";
import { storyOf, type Story } from "../canvas/scene";

export interface SpecRun {
  n: number;
  id: string;
  /** along the wall (the back), inches to 1/16″ */
  backIn: number;
  /** along the face — longer at an outside corner, shorter at an inside one */
  frontIn: number;
  story: Story;
  profile: string;
  size: string;
  color?: string;
}
export interface SpecCorner {
  id: string;
  kind: FoundCorner["kind"];
  angleDeg: number;
  runs: { n: number; backIn: number; frontIn: number }[];
}
export interface SpecDs {
  n: number;
  id: string;
  story: Story;
  shape: string;
  size: string;
  /** all elbows, of every style */
  elbows: number;
  offsets: number;
}
export interface MeasureSpec {
  runs: SpecRun[];
  corners: SpecCorner[];
  ds: SpecDs[];
  /** the materials to bring (labour is the estimate's business), as the engine counted them */
  parts: PartQty[];
}

const sum = (xs: readonly { qty: number }[] | undefined) => (xs ?? []).reduce((s, x) => s + (Number.isFinite(x.qty) ? x.qty : 0), 0);

export function measureSpec(d: Drawing, parts: readonly PartQty[]): MeasureSpec {
  const all = findCorners(d);
  const nOf = new Map(d.runs.map((r, i) => [r.id, i + 1]));
  const runs = d.runs.map((r, i): SpecRun => {
    // a gutter's cut with every corner it has (both ends count) — the same numbers the corner sheet shows
    const cut = cornerCut(d, { runs: [{ id: r.id, end: 0 }, { id: r.id, end: 0 }] }, all).runs[0]!;
    return {
      n: i + 1,
      id: r.id,
      backIn: cut.backIn,
      frontIn: cut.frontIn,
      story: storyOf(r.attrs.story),
      profile: String(r.attrs.profile),
      size: String(r.attrs.size),
      ...(r.attrs.color ? { color: String(r.attrs.color) } : {}),
    };
  });
  const corners = all.map((c): SpecCorner => {
    const cut = cornerCut(d, c, all);
    return { id: c.id, kind: c.kind, angleDeg: Math.round(cut.angleDeg), runs: cut.runs.map((x) => ({ n: nOf.get(x.id) ?? 0, backIn: x.backIn, frontIn: x.frontIn })) };
  });
  const ds = d.downspouts.map((s, i): SpecDs => ({
    n: i + 1,
    id: s.id,
    story: storyOf(d.runs.find((r) => r.id === s.runId)?.attrs.story),
    shape: String(s.shape),
    size: String(s.size),
    elbows: sum(s.elbows),
    offsets: sum(s.offsets),
  }));
  return { runs, corners, ds, parts: parts.filter((p) => p.kind === "material" && Number(p.qty) > 0) };
}
