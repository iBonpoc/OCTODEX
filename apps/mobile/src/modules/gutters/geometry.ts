import type { MeasurementInput, MeasuredCorner, MeasuredDownspout, MeasuredRun, RunEnd } from "@octo/estimating-engine";

/**
 * Geometry of the gutter drawing (docs/specs/33-gutters-module.md §3, П14.2 «модель замера»).
 * Pure functions, no React. Plan coordinates are integer inches, x east, y north (north up).
 * Each drawn line is one straight run; the typed length is the truth, the drawing is a sketch.
 */

export type P = [number, number];

export interface DrawnRun {
  id: string;
  a: P;
  b: P;
  /** typed length (tape or keypad) wins over the drawn length */
  lengthIn?: number;
  /** auto: from the house centre; the user can flip it */
  houseSide?: "L" | "R";
  attrs: Omit<MeasuredRun, "id" | "lengthIn" | "ends" | "houseSide"> & {
    /** how the corner at this run's start (a) / end (b) is made (M7c, spec 33 П22.2 №15); none — the company's default */
    cornerMethod?: { a?: CornerChoice["method"]; b?: CornerChoice["method"] };
  };
  /** the user removed the end cap at this end (start, end) */
  noCap?: [boolean, boolean];
}

export interface DrawnDownspout extends Omit<MeasuredDownspout, "runId"> {
  runId: string;
  /** distance from the run's start, inches */
  atIn: number;
}

export interface CornerChoice {
  method: "cut" | "strip" | "prefab";
  splashGuard?: boolean;
}

export interface Drawing {
  runs: DrawnRun[];
  downspouts: DrawnDownspout[];
  /** per corner id (`c:<runA>:<runB>`): how to make it; default from company settings */
  corners?: Record<string, CornerChoice>;
}

export const SNAP_POINT_IN = 18; // 1.5 ft
export const SNAP_ANGLE_DEG = 7;
export const MIN_TURN_DEG = 20;

const sub = (p: P, q: P): P => [p[0] - q[0], p[1] - q[1]];
const len = (v: P) => Math.hypot(v[0], v[1]);
const dist = (p: P, q: P) => len(sub(p, q));
const cross = (u: P, v: P) => u[0] * v[1] - u[1] * v[0];
const dot = (u: P, v: P) => u[0] * v[0] + u[1] * v[1];
const round = (p: P): P => [Math.round(p[0]), Math.round(p[1])];

export const drawnLengthIn = (r: Pick<DrawnRun, "a" | "b">) => Math.round(dist(r.a, r.b));
export const runLengthIn = (r: DrawnRun) => r.lengthIn ?? drawnLengthIn(r);

/** Snap `p` to the nearest existing end point within `tolIn`. */
export function snapPoint(p: P, ends: P[], tolIn = SNAP_POINT_IN): P {
  let best: P | null = null;
  let bd = tolIn;
  for (const e of ends) {
    const d = dist(p, e);
    if (d <= bd) { bd = d; best = e; }
  }
  return best ? [best[0], best[1]] : round(p);
}

/** Keep the length, turn the direction a→b to the nearest multiple of 45° if it is within `tolDeg`. */
export function snapDirection(a: P, b: P, tolDeg = SNAP_ANGLE_DEG): P {
  const v = sub(b, a);
  const L = len(v);
  if (L === 0) return b;
  const ang = Math.atan2(v[1], v[0]) * 180 / Math.PI;
  const near = Math.round(ang / 45) * 45;
  if (Math.abs(ang - near) > tolDeg) return round(b);
  const r = near * Math.PI / 180;
  return round([a[0] + L * Math.cos(r), a[1] + L * Math.sin(r)]);
}

/** Put the end at the typed length along the drawn direction (the drawing follows the tape). */
export function withLength(r: Pick<DrawnRun, "a" | "b">, lengthIn: number): P {
  const v = sub(r.b, r.a);
  const L = len(v) || 1;
  return round([r.a[0] + v[0] / L * lengthIn, r.a[1] + v[1] / L * lengthIn]);
}

/** Centre of all drawn points: the house is assumed to be around it. */
export function centre(runs: Pick<DrawnRun, "a" | "b">[]): P {
  if (!runs.length) return [0, 0];
  let x = 0, y = 0;
  for (const r of runs) { x += r.a[0] + r.b[0]; y += r.a[1] + r.b[1]; }
  return [x / (2 * runs.length), y / (2 * runs.length)];
}

/** Which side of the run (looking a→b) the house is on. */
export function autoHouseSide(r: Pick<DrawnRun, "a" | "b">, c: P): "L" | "R" {
  return cross(sub(r.b, r.a), sub(c, r.a)) > 0 ? "L" : "R";
}

export const houseSide = (r: DrawnRun, c: P) => r.houseSide ?? autoHouseSide(r, c);

export interface FoundCorner {
  id: string;
  /** the two runs and which of their ends meet: 0 = start (a), 1 = end (b) */
  runs: [{ id: string; end: 0 | 1 }, { id: string; end: 0 | 1 }];
  at: P;
  kind: "out" | "in" | "bay";
  turnDeg: number;
}

/**
 * Corners from topology: two run ends at the same point (after snapping).
 * Walk the first run towards the meeting point and continue along the second: a turn towards the house is an
 * outside corner, away from the house an inside corner; a turn below 70° (between 20° and 70°) is a bay corner.
 * Turns under 20° are a straight join (no corner).
 */
export function findCorners(d: Pick<Drawing, "runs">, tolIn = 1): FoundCorner[] {
  const c = centre(d.runs);
  const out: FoundCorner[] = [];
  const rs = d.runs;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const A = rs[i]!, B = rs[j]!;
      for (const ea of [0, 1] as const) {
        for (const eb of [0, 1] as const) {
          const pa = ea ? A.b : A.a, pb = eb ? B.b : B.a;
          if (dist(pa, pb) > tolIn) continue;
          // direction into the point along A, then out of the point along B
          const vin: P = ea ? sub(A.b, A.a) : sub(A.a, A.b);
          const vout: P = eb ? sub(B.a, B.b) : sub(B.b, B.a);
          const turn = Math.atan2(cross(vin, vout), dot(vin, vout)) * 180 / Math.PI; // + left, − right
          const t = Math.abs(turn);
          if (t < MIN_TURN_DEG) continue;
          // house side of A in the direction we walk (towards the point)
          const sideA = houseSide(A, c);
          const walkSide = ea ? sideA : (sideA === "L" ? "R" : "L");
          const towardHouse = (turn > 0 && walkSide === "L") || (turn < 0 && walkSide === "R");
          const kind = t < 70 ? "bay" : towardHouse ? "out" : "in";
          out.push({ id: `c:${A.id}:${B.id}`, runs: [{ id: A.id, end: ea }, { id: B.id, end: eb }], at: pa, kind, turnDeg: Math.round(t) });
        }
      }
    }
  }
  return out;
}

/** Ends of each run: corner, straight join with another run, or an end cap (unless the user removed it). */
export function runEnds(d: Pick<Drawing, "runs">, corners: FoundCorner[], tolIn = 1): Record<string, [RunEnd, RunEnd]> {
  const res: Record<string, [RunEnd, RunEnd]> = {};
  for (const r of d.runs) {
    res[r.id] = ([0, 1] as const).map((e): RunEnd => {
      const corner = corners.find((c) => c.runs.some((x) => x.id === r.id && x.end === e));
      if (corner) return { kind: "corner", cornerId: corner.id };
      const p = e ? r.b : r.a;
      const joined = d.runs.some((o) => o.id !== r.id && (dist(o.a, p) <= tolIn || dist(o.b, p) <= tolIn));
      if (joined || r.noCap?.[e]) return { kind: "join" };
      return { kind: "cap" };
    }) as [RunEnd, RunEnd];
  }
  return res;
}

/** Distance along the run (inches, clamped to the run) of the point nearest to `p`; for placing a downspout by a tap. */
export function projectOnRun(r: DrawnRun, p: P): { atIn: number; offIn: number } {
  const v = sub(r.b, r.a);
  const L2 = dot(v, v) || 1;
  const t = Math.min(1, Math.max(0, dot(sub(p, r.a), v) / L2));
  const q: P = [r.a[0] + v[0] * t, r.a[1] + v[1] * t];
  return { atIn: Math.round(t * runLengthIn(r)), offIn: Math.round(dist(p, q)) };
}

/** Nearest run to a tap within `tolIn` (a downspout must sit on a gutter). */
export function nearestRun(d: Pick<Drawing, "runs">, p: P, tolIn = 36): { runId: string; atIn: number } | null {
  let best: { runId: string; atIn: number; off: number } | null = null;
  for (const r of d.runs) {
    const { atIn, offIn } = projectOnRun(r, p);
    if (offIn <= tolIn && (!best || offIn < best.off)) best = { runId: r.id, atIn, off: offIn };
  }
  return best && { runId: best.runId, atIn: best.atIn };
}

/** The drawing → the engine's measurement input (docs/specs/33 S5g). */
/** the method stored on the corner's runs (first run first); none → undefined */
export function cornerChoiceOf(d: Pick<Drawing, "runs">, f: Pick<FoundCorner, "runs">): CornerChoice | undefined {
  for (const end of f.runs) {
    const m = d.runs.find((r) => r.id === end.id)?.attrs.cornerMethod?.[end.end ? "b" : "a"];
    if (m) return { method: m };
  }
  return undefined;
}

export function toMeasurement(d: Drawing, defaultCorner: CornerChoice = { method: "cut" }): MeasurementInput {
  const c = centre(d.runs);
  const found = findCorners(d);
  const ends = runEnds(d, found);
  const runs: MeasuredRun[] = d.runs.map((r) => {
    // the corner methods are the drawing's, not the engine's run input
    const { cornerMethod: _cm, ...attrs } = r.attrs;
    return { ...attrs, id: r.id, lengthIn: runLengthIn(r), houseSide: houseSide(r, c), ends: ends[r.id]! };
  });
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const corners: MeasuredCorner[] = found.map((f) => {
    const first = byId.get(f.runs[0].id)!;
    const choice = d.corners?.[f.id] ?? cornerChoiceOf(d, f) ?? defaultCorner;
    // the corner is made of the first run's stock: gauge and finish too, or the coil splits into two lines
    const { profile, size, material, gauge, finish, color, story } = first.attrs;
    return { id: f.id, kind: f.kind, method: choice.method, splashGuard: choice.splashGuard, profile, size, material, gauge, finish, color, story };
  });
  const downspouts: MeasuredDownspout[] = d.downspouts.filter((x) => byId.has(x.runId)).map(({ atIn: _at, ...x }) => x);
  return { runs, corners, downspouts };
}
