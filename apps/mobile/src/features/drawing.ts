import { calibrate, corners, segmentLengthsFt, type Pt } from "@octo/estimating-engine";

/**
 * Gutter drawing over the contractor's own photo (ADR-004: no satellite imagery tracing).
 * Coordinates are normalised to the canvas width (x 0..1, y 0..aspect), so a resize keeps lengths.
 * Scale comes from one calibration line of known length (e.g. a 16 ft garage door).
 */
export interface Calibration {
  a?: Pt;
  b?: Pt;
  knownFt: number;
}
export interface DrawingSummary {
  calibrated: boolean;
  ftPerUnit: number | null;
  runsFt: number[];
  segmentsFt: number[][];
  totalFt: number;
  outside: number;
  inside: number;
  downspouts: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function summarize(runs: Pt[][], cal: Calibration, downspouts: Pt[], roofSide: "left" | "right" = "left"): DrawingSummary {
  const calibrated = !!(cal.a && cal.b && dist(cal.a, cal.b) > 0.01 && cal.knownFt > 0);
  const ftPerUnit = calibrated ? calibrate(cal.knownFt, dist(cal.a!, cal.b!)).toNumber() : null;
  const usable = runs.filter((r) => r.length >= 2);
  const segmentsFt = usable.map((r) => (ftPerUnit ? segmentLengthsFt(r, ftPerUnit).map((d) => Math.round(d.toNumber() * 2) / 2) : []));
  const runsFt = segmentsFt.map((s) => s.reduce((a, b) => a + b, 0));
  let outside = 0;
  let inside = 0;
  for (const r of usable) {
    for (const c of corners(r, roofSide)) c.kind === "out" ? outside++ : inside++;
  }
  return {
    calibrated,
    ftPerUnit,
    runsFt,
    segmentsFt,
    totalFt: Math.round(runsFt.reduce((a, b) => a + b, 0) * 2) / 2,
    outside,
    inside,
    downspouts: downspouts.length,
  };
}
