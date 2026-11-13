/**
 * The corner sheet's drawing, as pure geometry (spec 33 §1 #1276.1; founder 12.11: «чертёж угла — каша»): two gutters seen from above as
 * strips, the wall (back) solid, the face dashed, the cut line (the miter) between them, an arc across the angle between the walls.
 * Screen coordinates (y down); `u` — a unit vector along a leg from the corner, `n` — a unit vector from the wall towards the face.
 */
export type V = [number, number];

export interface Leg { u: V; n: V }

/** the point where the two faces meet (the far end of the cut line from the corner); `off` — how far the face stands from the wall */
export function cutPoint(corner: V, a: Leg, b: Leg, off: number): V {
  const p0: V = [corner[0] + a.n[0] * off, corner[1] + a.n[1] * off];
  const q0: V = [corner[0] + b.n[0] * off, corner[1] + b.n[1] * off];
  const den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
  const t = Math.abs(den) < 1e-6 ? 0 : ((q0[0] - p0[0]) * b.u[1] - (q0[1] - p0[1]) * b.u[0]) / den;
  return [p0[0] + a.u[0] * t, p0[1] + a.u[1] * t];
}

/** the angle between the two legs, degrees (0…180): the angle between the walls */
export const legsAngleDeg = (a: V, b: V): number => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI;

/**
 * The arc across the angle at the corner, radius `r`, and where its degrees are written (on the bisector, `gap` past the arc);
 * null for legs on one line (no angle to mark). `sweep` is the SVG flag that takes the short way from leg a to leg b.
 */
export function angleArc(corner: V, a: V, b: V, r: number, gap: number): { from: V; to: V; sweep: 0 | 1; label: V } | null {
  const cross = a[0] * b[1] - a[1] * b[0];
  if (Math.abs(cross) < 1e-3) return null;
  const sum: V = [a[0] + b[0], a[1] + b[1]];
  const len = Math.hypot(sum[0], sum[1]) || 1;
  return {
    from: [corner[0] + a[0] * r, corner[1] + a[1] * r],
    to: [corner[0] + b[0] * r, corner[1] + b[1] * r],
    sweep: cross > 0 ? 1 : 0,
    label: [corner[0] + (sum[0] / len) * (r + gap), corner[1] + (sum[1] / len) * (r + gap)],
  };
}

/** the cut written the way it is cut: 45° and 22½° (halves only: the angle between walls is whole degrees) */
export function fmtDeg(deg: number): string {
  const r = Math.round(deg * 2) / 2;
  const whole = Math.trunc(r);
  return r === whole ? `${whole}` : whole === 0 ? "½" : `${whole}½`;
}
