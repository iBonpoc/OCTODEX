import { D, dec, ceilTo, type Dec, type DecLike } from "./decimal.js";

/**
 * Gutters module quantities (PRD 06 §7.4–7.8).
 * Input is the normalized `calc_inputs` JSON (from the drawing or the quick form).
 * Output is quantities only; pricing happens in estimate.ts.
 */

export type Profile = "K5" | "K6" | "HR5" | "HR6" | "BOX7";
export type DsSize = "2x3" | "3x4" | "round_3" | "round_4";
export type HangerType = "hidden" | "strap_tile";

export interface GutterRun {
  id: string;
  story: number;
  profile: Profile;
  gauge: string; // ".027" | ".032"
  color: string;
  guards?: boolean;
  tearOff?: boolean;
  hangerType?: HangerType;
  /** Straight segment lengths in feet (from drawing or quick form). */
  segmentsFt: DecLike[];
  /** Free (open) ends of this run that get end caps. Default 2 for an open run. */
  freeEnds?: number;
}

export interface Downspout {
  runId: string;
  size: DsSize;
  heightMode?: "story" | "custom";
  customHeightFt?: DecLike;
  lengthOverrideFt?: DecLike;
  elbows?: { style: string; qty: number }[];
}

export interface GutterConstants {
  hangerSpacingFt: DecLike;
  storyHeightsFt: Record<number, DecLike>;
  dsExtensionFt: DecLike;
  dsStickFt: DecLike;
  defaultElbows: { style: string; qty: number }[];
  coilWastePct: DecLike; // 0.05 = 5%
  lfRoundingFt: DecLike;
  jointsPerSealantTube: number;
  lfPerScrewBox: number;
}

/** Defaults agreed with the founder on 03.11.2026 (PRD 06 §7.6). */
export const DEFAULT_GUTTER_CONSTANTS: GutterConstants = {
  hangerSpacingFt: 2,
  storyHeightsFt: { 1: 10, 2: 20, 3: 30, 4: 40 },
  dsExtensionFt: 0,
  dsStickFt: 10,
  defaultElbows: [{ style: "a", qty: 3 }],
  coilWastePct: "0.05",
  lfRoundingFt: "0.5",
  jointsPerSealantTube: 8,
  lfPerScrewBox: 150,
};

export const COIL_WIDTH_IN: Record<Profile, string> = { K5: "11.875", K6: "15", HR5: "-", HR6: "-", BOX7: "-" };

export interface GutterInput {
  runs: GutterRun[];
  miters: { runId: string; kind: "in" | "out"; angleDeg?: number }[];
  downspouts: Downspout[];
  fasciaLf?: DecLike;
  property?: { storyHeightsOverrideFt?: Record<number, DecLike> };
  constants?: Partial<GutterConstants>;
}

export interface GutterQuantities {
  runLf: Record<string, Dec>;
  gutterLf: Record<string, Dec>; // key `${profile}|${gauge}`
  storyFeeLf: Record<number, Dec>; // stories >= 2
  mitersOut: number;
  mitersIn: number;
  endCaps: Record<string, number>; // by profile
  downspoutLengthsFt: Dec[];
  downspoutLf: Record<string, Dec>; // by size
  elbows: Record<string, number>; // `${style}.${size}`
  outlets: Record<string, number>; // by size
  tearOffLf: Dec;
  guardsLf: Dec;
  tileLf: Dec;
  fasciaLf: Dec;
  hangers: Record<string, number>; // by hanger type
  dsSticks: number;
  sealantTubes: number;
  screwBoxes: number;
  coilLf: Record<string, number>; // `${width}|${gauge}|${color}`
  halfRoundSections: number;
  errors: string[];
}

const add = (m: Record<string, Dec>, k: string | number, v: Dec) => { m[k] = (m[k] ?? dec(0)).add(v); };
const addN = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

export function resolveConstants(over?: Partial<GutterConstants>): GutterConstants {
  return { ...DEFAULT_GUTTER_CONSTANTS, ...(over ?? {}) };
}

export function storyHeightFt(story: number, c: GutterConstants, propertyOverride?: Record<number, DecLike>): Dec | null {
  const v = propertyOverride?.[story] ?? c.storyHeightsFt[story];
  return v === undefined ? null : dec(v);
}

export function computeGutterQuantities(input: GutterInput): GutterQuantities {
  const c = resolveConstants(input.constants);
  const errors: string[] = [];
  const q: GutterQuantities = {
    runLf: {}, gutterLf: {}, storyFeeLf: {}, mitersOut: 0, mitersIn: 0, endCaps: {},
    downspoutLengthsFt: [], downspoutLf: {}, elbows: {}, outlets: {},
    tearOffLf: dec(0), guardsLf: dec(0), tileLf: dec(0), fasciaLf: dec(input.fasciaLf ?? 0),
    hangers: {}, dsSticks: 0, sealantTubes: 0, screwBoxes: 0, coilLf: {}, halfRoundSections: 0, errors,
  };
  const runsById = new Map(input.runs.map(r => [r.id, r]));
  const coilRaw: Record<string, Dec> = {};
  let totalGutterLf = dec(0);
  let totalEndCaps = 0;

  for (const r of input.runs) {
    const segSum = r.segmentsFt.reduce<Dec>((s, x) => s.add(dec(x)), dec(0));
    const lf = ceilTo(c.lfRoundingFt, segSum);
    q.runLf[r.id] = lf;
    totalGutterLf = totalGutterLf.add(lf);
    add(q.gutterLf, `${r.profile}|${r.gauge}`, lf);
    if (r.story >= 2) add(q.storyFeeLf, Math.min(r.story, 4), lf);
    if (r.tearOff) q.tearOffLf = q.tearOffLf.add(lf);
    if (r.guards) q.guardsLf = q.guardsLf.add(lf);
    const ht = r.hangerType ?? "hidden";
    if (ht === "strap_tile") q.tileLf = q.tileLf.add(lf);
    addN(q.hangers, ht, lf.div(dec(c.hangerSpacingFt)).ceil().toNumber());
    const ends = r.freeEnds ?? 2;
    addN(q.endCaps, r.profile, ends);
    totalEndCaps += ends;
    if (r.profile === "HR5" || r.profile === "HR6") {
      q.halfRoundSections += lf.div(10).ceil().toNumber();
    } else {
      add(coilRaw, `${COIL_WIDTH_IN[r.profile]}|${r.gauge}|${r.color}`, segSum);
    }
  }

  for (const m of input.miters) {
    if (m.kind === "out") q.mitersOut++; else q.mitersIn++;
  }

  for (const [i, ds] of input.downspouts.entries()) {
    const run = runsById.get(ds.runId);
    if (!run) { errors.push(`Downspout #${i + 1}: run ${ds.runId} not found`); continue; }
    let len: Dec;
    if (ds.lengthOverrideFt !== undefined) {
      len = dec(ds.lengthOverrideFt);
    } else {
      let h: Dec | null;
      if (ds.heightMode === "custom") {
        h = ds.customHeightFt !== undefined ? dec(ds.customHeightFt) : null;
      } else {
        h = storyHeightFt(run.story, c, input.property?.storyHeightsOverrideFt);
      }
      if (h === null) {
        errors.push(`Downspout #${i + 1}: задайте высоту downspout — этажа ${run.story} нет в таблице`);
        continue;
      }
      len = h.add(dec(c.dsExtensionFt));
    }
    q.downspoutLengthsFt.push(len);
    add(q.downspoutLf, ds.size, len);
    addN(q.outlets, ds.size, 1);
    q.dsSticks += len.div(dec(c.dsStickFt)).ceil().toNumber();
    for (const e of ds.elbows ?? c.defaultElbows) addN(q.elbows, `${e.style}.${ds.size}`, e.qty);
  }

  const outlets = Object.values(q.outlets).reduce((s, n) => s + n, 0);
  q.sealantTubes = Math.ceil((totalEndCaps + q.mitersIn + q.mitersOut + outlets) / c.jointsPerSealantTube);
  q.screwBoxes = totalGutterLf.isZero() ? 0 : totalGutterLf.div(c.lfPerScrewBox).ceil().toNumber();
  const waste = dec(1).add(dec(c.coilWastePct));
  for (const [k, v] of Object.entries(coilRaw)) q.coilLf[k] = v.mul(waste).ceil().toNumber();
  return q;
}

/* ---------------- Geometry (PRD 06 §7.1–7.3) ---------------- */

export type Pt = [number, number];

/** Web Mercator feet per pixel for a north-up static image. */
export function feetPerPixel(latDeg: DecLike, zoom: number, scale = 1): Dec {
  const lat = dec(latDeg).toNumber() * Math.PI / 180; // cos needs float; result rounded below
  const mPerPx = dec(156543.03392).mul(Math.cos(lat)).div(dec(2).pow(zoom)).div(scale);
  return mPerPx.mul("3.28084");
}

/** Calibrated scale from one known length. */
export const calibrate = (knownFt: DecLike, linePx: DecLike): Dec => dec(knownFt).div(dec(linePx));

export function segmentLengthsFt(points: Pt[], ftPerPx: DecLike): Dec[] {
  const out: Dec[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!, [x2, y2] = points[i]!;
    out.push(dec(x2 - x1).pow(2).add(dec(y2 - y1).pow(2)).sqrt().mul(dec(ftPerPx)));
  }
  return out;
}

export interface CornerResult { index: number; kind: "in" | "out"; turnDeg: number; angleDeg?: number }

/**
 * Corners of a polyline drawn in screen coordinates (y down).
 * roofSide = side of the eave line where the roof is, relative to drawing direction.
 * Turn toward the roof = outside miter; away from the roof = inside miter.
 * Turns < minTurnDeg produce no miter; 20–70° turns are bay miters with angle = 180 − turn.
 */
export function corners(points: Pt[], roofSide: "left" | "right", closed = false, minTurnDeg = 20): CornerResult[] {
  const pts = closed ? [...points, points[0]!, points[1]!] : points;
  const res: CornerResult[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!;
    const v1: Pt = [b[0] - a[0], b[1] - a[1]], v2: Pt = [c[0] - b[0], c[1] - b[1]];
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const turn = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
    if (turn < minTurnDeg) continue;
    const turnsRight = cross > 0; // y-down screen coordinates
    const towardRoof = (turnsRight && roofSide === "right") || (!turnsRight && roofSide === "left");
    const r: CornerResult = { index: i % points.length, kind: towardRoof ? "out" : "in", turnDeg: Math.round(turn) };
    if (turn <= 70) r.angleDeg = Math.round(180 - turn);
    res.push(r);
  }
  return res;
}

/** Free ends of a set of runs on one story; ends within tolFt of another run's end are joints. */
export function freeEndsByRun(runs: { id: string; points: Pt[]; closed?: boolean }[], ftPerPx: DecLike, tolFt = 1.5): Record<string, number> {
  const ends: { id: string; p: Pt }[] = [];
  const out: Record<string, number> = {};
  for (const r of runs) {
    out[r.id] = 0;
    if (r.closed) continue;
    ends.push({ id: r.id, p: r.points[0]! }, { id: r.id, p: r.points[r.points.length - 1]! });
  }
  const tolPx = dec(tolFt).div(dec(ftPerPx));
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i]!;
    const joined = ends.some((o, j) => j !== i && o.id !== e.id &&
      dec(o.p[0] - e.p[0]).pow(2).add(dec(o.p[1] - e.p[1]).pow(2)).sqrt().lte(tolPx));
    if (!joined) out[e.id] = (out[e.id] ?? 0) + 1;
  }
  return out;
}

export { D };
