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
    /** the splash guard of the inside corner at its start (a) / end (b) taken off (founder 09.11: «не всегда нужен») */
    noSplash?: { a?: true; b?: true };
  };
  /** the user removed the end cap at this end (start, end) */
  noCap?: [boolean, boolean];
  /** how its length is shown on the drawing (founder 09.11): feet + inches (none), inches, mm — a view, not a size */
  unit?: "in" | "m" | "cm" | "mm";
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

/** two runs on the same storey (none set — the 1st): only they join at their ends */
export const sameStory = (a: Pick<DrawnRun, "attrs">, b: Pick<DrawnRun, "attrs">) => (Number(a.attrs.story) || 1) === (Number(b.attrs.story) || 1);

/** Which side of the run (looking a→b) the point `c` is on (the old guess: the centre of all points, #758). */
export function autoHouseSide(r: Pick<DrawnRun, "a" | "b">, c: P): "L" | "R" {
  return cross(sub(r.b, r.a), sub(c, r.a)) > 0 ? "L" : "R";
}

/**
 * The house's side of every run, guessed (#758, audit G-01): one gutter line round the house (runs joined end to end on
 * one storey) has the house on ONE side all along it. The line is walked end to end; its signed area says that side —
 * a closed outline exactly, an open line as if its two free ends were joined (round an outside corner or three sides of
 * a house the house is inside). The centre of all points (the old guess) was outside an L-shaped (Г) house: corners
 * swapped inside ↔ outside, both caps the same hand, the face lengths of the crew's sheet off by the gutter's size.
 * A line with no area (one straight run, straight joins) or a branching one keeps the old guess. A run's own
 * `houseSide` (flipFace) always wins — `houseSides` below.
 */
export function autoHouseSides(runs: readonly DrawnRun[], tolIn = 1): Map<string, "L" | "R"> {
  const out = new Map<string, "L" | "R">();
  const c = centre([...runs]);
  const near = (p: P, q: P) => dist(p, q) <= tolIn;
  for (const r of runs) {
    if (out.has(r.id)) continue;
    const ids = chainOf({ runs: [...runs] }, r.id, tolIn);
    const chain = runs.filter((x) => ids.has(x.id));
    const walk = walkChain(chain, near);
    const area = walk ? signedArea(walk.points) : 0;
    // less than a sliver (1 in² per inch of line): a straight line — no side from its shape
    const lineIn = chain.reduce((n, x) => n + dist(x.a, x.b), 0);
    if (!walk || Math.abs(area) < lineIn) {
      for (const x of chain) out.set(x.id, autoHouseSide(x, c));
      continue;
    }
    const inside: "L" | "R" = area > 0 ? "L" : "R";
    for (const s of walk.steps) out.set(s.id, s.forward ? inside : inside === "L" ? "R" : "L");
  }
  return out;
}

/** the side of every run: its own (turned by hand), else the guess of its line */
export function houseSides(d: Pick<Drawing, "runs">): (r: DrawnRun) => "L" | "R" {
  const auto = autoHouseSides(d.runs);
  return (r) => r.houseSide ?? auto.get(r.id) ?? "R";
}

/** twice the signed area of a polygon (shoelace); > 0 — its inside is on the left of the walk (the same `cross` as above) */
function signedArea(ps: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < ps.length; i++) s += cross(ps[i]!, ps[(i + 1) % ps.length]!);
  return s;
}

/**
 * One line walked end to end: from a free end (an open line) or from any run (a closed one), each run once, `forward`
 * when walked a→b. Null when the runs branch (an end shared by three) or do not make one line.
 */
function walkChain(chain: readonly DrawnRun[], near: (p: P, q: P) => boolean): { points: P[]; steps: { id: string; forward: boolean }[] } | null {
  const ends = chain.flatMap((r) => [r.a, r.b]);
  const degree = (p: P) => ends.filter((q) => near(p, q)).length;
  if (ends.some((p) => degree(p) > 2)) return null;
  const free = chain.find((r) => degree(r.a) === 1 || degree(r.b) === 1);
  const first = free ?? chain[0]!;
  let forward = free ? degree(first.a) === 1 : true;
  const steps: { id: string; forward: boolean }[] = [{ id: first.id, forward }];
  const points: P[] = [forward ? first.a : first.b];
  let at = forward ? first.b : first.a;
  const used = new Set([first.id]);
  while (used.size < chain.length) {
    const next = chain.find((r) => !used.has(r.id) && (near(r.a, at) || near(r.b, at)));
    if (!next) return null;
    forward = near(next.a, at);
    points.push(at);
    steps.push({ id: next.id, forward });
    used.add(next.id);
    at = forward ? next.b : next.a;
  }
  points.push(at);
  // a closed outline ends where it began: that point once
  if (!free && points.length > 1 && near(points[0]!, points[points.length - 1]!)) points.pop();
  return { points, steps };
}



/**
 * The end cap at a run's start (0) / end (1): left or right, looking at the gutter's face (from outside the house).
 * The same rule as the engine's (gutterParts.ts): the start is R when the house is on the right, and the other way.
 */
export const capSide = (end: 0 | 1, side: "L" | "R"): "L" | "R" => ((end === 0) === (side === "R") ? "R" : "L");

/** The runs joined end to end with `runId` (itself included): one gutter line round the house — one face side. */
export function chainOf(d: Pick<Drawing, "runs">, runId: string, tolIn = 1): Set<string> {
  const seen = new Set<string>([runId]);
  const todo = [runId];
  while (todo.length) {
    const id = todo.pop();
    const r = d.runs.find((x) => x.id === id);
    if (!r) continue;
    for (const o of d.runs) {
      if (seen.has(o.id) || !sameStory(o, r)) continue;
      if ([o.a, o.b].some((p) => dist(p, r.a) <= tolIn || dist(p, r.b) <= tolIn)) {
        seen.add(o.id);
        todo.push(o.id);
      }
    }
  }
  return seen;
}

export interface FoundCorner {
  id: string;
  /** the two runs and which of their ends meet: 0 = start (a), 1 = end (b) */
  runs: [{ id: string; end: 0 | 1 }, { id: string; end: 0 | 1 }];
  at: P;
  kind: "out" | "in" | "bay";
  turnDeg: number;
  /** the turn is towards the house (an outside corner, a bay corner bending out): the face goes round the outside */
  outward?: boolean;
}

/**
 * Corners from topology: two run ends at the same point (after snapping).
 * Walk the first run towards the meeting point and continue along the second: a turn towards the house is an
 * outside corner, away from the house an inside corner; a turn below 70° (between 20° and 70°) is a bay corner.
 * Turns under 20° are a straight join (no corner).
 */
export function findCorners(d: Pick<Drawing, "runs">, tolIn = 1): FoundCorner[] {
  const side = houseSides(d);
  const out: FoundCorner[] = [];
  const rs = d.runs;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const A = rs[i]!, B = rs[j]!;
      // gutters on different storeys never meet (founder 09.11: a 2nd and a 3rd storey were joined into a corner)
      if (!sameStory(A, B)) continue;
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
          const sideA = side(A);
          const walkSide = ea ? sideA : (sideA === "L" ? "R" : "L");
          const towardHouse = (turn > 0 && walkSide === "L") || (turn < 0 && walkSide === "R");
          const kind = t < 70 ? "bay" : towardHouse ? "out" : "in";
          out.push({ id: `c:${A.id}:${B.id}`, runs: [{ id: A.id, end: ea }, { id: B.id, end: eb }], at: pa, kind, turnDeg: Math.round(t), outward: towardHouse });
        }
      }
    }
  }
  return out;
}

/** a length to the nearest 1/8″ (founder 08.11: «8′ 9¼″») */
export const eighth = (n: number) => Math.round(n * 8) / 8;

/** how far the gutter's face stands from its back (the line drawn along the fascia): its size, 5″ → 5″ */
export const faceOffsetIn = (r: Pick<DrawnRun, "attrs">) => {
  const n = parseFloat(String(r.attrs.size));
  return Number.isFinite(n) && n > 0 ? n : 5;
};

/**
 * The cut of a corner (founder 08.11): for each of its runs, the length along the back (the wall) and along the face.
 * At a corner end the face is longer (outside) or shorter (inside) by offset · tan(turn / 2) — 90° → the offset itself;
 * a cap end adds nothing. Both ends of a run count (a run between two corners). To the nearest 1/8″.
 */
export interface CornerCutRun { id: string; backIn: number; frontIn: number; offsetIn: number }
export function cornerCut(d: Pick<Drawing, "runs">, f: Pick<FoundCorner, "runs">, all: FoundCorner[] = findCorners(d)): { angleDeg: number; runs: CornerCutRun[] } {
  const here = all.find((c) => c.runs.every((x, i) => x.id === f.runs[i]!.id && x.end === f.runs[i]!.end));
  const runs = f.runs.map(({ id }) => {
    const r = d.runs.find((x) => x.id === id)!;
    const off = faceOffsetIn(r);
    let delta = 0;
    for (const c of all) {
      if (!c.runs.some((x) => x.id === id)) continue;
      const k = off * Math.tan((c.turnDeg * Math.PI) / 360);
      delta += c.outward ? k : -k;
    }
    const back = runLengthIn(r);
    return { id, backIn: eighth(back), frontIn: eighth(back + delta), offsetIn: off };
  });
  return { angleDeg: 180 - (here?.turnDeg ?? 90), runs };
}

/** Ends of each run: corner, straight join with another run, or an end cap (unless the user removed it). */
export function runEnds(d: Pick<Drawing, "runs">, corners: FoundCorner[], tolIn = 1): Record<string, [RunEnd, RunEnd]> {
  const res: Record<string, [RunEnd, RunEnd]> = {};
  for (const r of d.runs) {
    res[r.id] = ([0, 1] as const).map((e): RunEnd => {
      const corner = corners.find((c) => c.runs.some((x) => x.id === r.id && x.end === e));
      if (corner) return { kind: "corner", cornerId: corner.id };
      const p = e ? r.b : r.a;
      const joined = d.runs.some((o) => o.id !== r.id && sameStory(o, r) && (dist(o.a, p) <= tolIn || dist(o.b, p) <= tolIn));
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
/**
 * The corner's own method: only when BOTH runs hold the same one at their meeting ends (setCornerMethod writes both).
 * A run deleted, or a new run drawn to an end that kept a method, is a new corner — the company's default again
 * (review M7c №4). None → undefined.
 */
export function cornerChoiceOf(d: Pick<Drawing, "runs">, f: Pick<FoundCorner, "runs">): CornerChoice | undefined {
  const [x, y] = f.runs.map((end) => d.runs.find((r) => r.id === end.id)?.attrs.cornerMethod?.[end.end ? "b" : "a"]);
  return x && x === y ? { method: x } : undefined;
}

/** the inside corner's splash guard was taken off: both runs say so at their meeting ends (like the corner's method) */
export function splashOff(d: Pick<Drawing, "runs">, f: Pick<FoundCorner, "runs">): boolean {
  return f.runs.every((end) => !!d.runs.find((r) => r.id === end.id)?.attrs.noSplash?.[end.end ? "b" : "a"]);
}

export function toMeasurement(d: Drawing, defaultCorner: CornerChoice = { method: "cut" }): MeasurementInput {
  const side = houseSides(d);
  const found = findCorners(d);
  const ends = runEnds(d, found);
  const runs: MeasuredRun[] = d.runs.map((r) => {
    // the corner methods are the drawing's, not the engine's run input
    const { cornerMethod: _cm, noSplash: _ns, ...attrs } = r.attrs;
    return { ...attrs, id: r.id, lengthIn: runLengthIn(r), houseSide: side(r), ends: ends[r.id]! };
  });
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  const corners: MeasuredCorner[] = found.map((f) => {
    const first = byId.get(f.runs[0].id)!;
    const choice = d.corners?.[f.id] ?? cornerChoiceOf(d, f) ?? defaultCorner;
    // the corner is made of the first run's stock: gauge and finish too, or the coil splits into two lines
    const { profile, size, material, gauge, finish, color, story } = first.attrs;
    // an inside corner gets a splash guard by itself (founder 08.11): water from two roofs meets there
    const splashGuard = choice.splashGuard ?? (f.kind === "in" && !splashOff(d, f) ? true : undefined);
    return { id: f.id, kind: f.kind, method: choice.method, ...(splashGuard !== undefined ? { splashGuard } : {}), profile, size, material, gauge, finish, color, story };
  });
  const downspouts: MeasuredDownspout[] = d.downspouts.filter((x) => byId.has(x.runId)).map(({ atIn: _at, ...x }) => x);
  return { runs, corners, downspouts };
}

/**
 * The angle between the walls from a triangle measured on site (founder 08.11): `a` along one gutter from the corner,
 * `b` along the other, `c` straight between the two marks (end cap to end cap, or 3′ and 4′ marks). Law of cosines.
 * Not a triangle (c too long or too short) → null.
 */
export function angleFromTriangle(a: number, b: number, c: number): number | null {
  if (!(a > 0 && b > 0 && c > 0)) return null;
  const cos = (a * a + b * b - c * c) / (2 * a * b);
  if (cos < -1 || cos > 1) return null;
  return Math.round(((Math.acos(cos) * 180) / Math.PI) * 10) / 10;
}
