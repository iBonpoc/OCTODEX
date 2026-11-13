/** Dimensions of the shop drawings (#1349), ANSI style: aligned (extension lines, architectural ticks, the text over the line) and angular. */
import { LW, TH, V, type Part, type Pt } from "./sheet";

export const rotOf = (u: Pt) => { let r = (Math.atan2(u[1], u[0]) * 180) / Math.PI; if (r > 90) r -= 180; if (r <= -90) r += 180; return r; };
export const dir = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
export const turn = (v: Pt, deg: number): Pt => { const [c, s] = dir(deg); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
export const norm = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
/** the left normal of a direction */
export const left = (u: Pt): Pt => [-u[1], u[0]];

/** an aligned dimension: extension lines, the line with architectural ticks, the text over it */
export function dimAligned(p: Part, a: Pt, b: Pt, n: Pt, off: number, txt: string, h: number = TH.sm) {
  const u = V.unit(a, b), A = V.add(a, V.mul(n, off)), Bq = V.add(b, V.mul(n, off));
  const exo = 1 / 16, exe = 1 / 16, dle = 1 / 16, tick = 0.05;
  for (const q of [a, b]) p.line(V.add(q, V.mul(n, exo)), V.add(q, V.mul(n, off + exe)));
  p.line(V.sub(A, V.mul(u, dle)), V.add(Bq, V.mul(u, dle)));
  const tk = norm(V.add(u, n));
  for (const q of [A, Bq]) p.line(V.sub(q, V.mul(tk, tick)), V.add(q, V.mul(tk, tick)), { lw: LW.ttlb, ghost: true });
  const rot = rotOf(u), upv = left(dir(rot)), m = V.add(V.lerp(A, Bq, 0.5), V.mul(upv, 1 / 32 + h / 2));
  p.text(txt, m[0], m[1], h, { anchor: "c", rot });
}

/** an angular dimension at `c` between the legs towards p1 and p2: an arc with arrowheads, the angle beside it */
export function dimAngle(p: Part, c: Pt, p1: Pt, p2: Pt, r: number, txt: string) {
  const a1 = (Math.atan2(p1[1] - c[1], p1[0] - c[0]) * 180) / Math.PI;
  let d = (Math.atan2(p2[1] - c[1], p2[0] - c[0]) * 180) / Math.PI - a1;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  p.arc(c, r, a1, a1 + d);
  const head = 3 / 64;
  for (const [ang, sgn] of [[a1, 1], [a1 + d, -1]] as const) {
    const tip = V.add(c, V.mul(dir(ang), r)), tan = V.mul(turn(dir(ang), 90), Math.sign(d) * sgn), back = V.add(tip, V.mul(tan, head)), w = V.mul(dir(ang), head / 5);
    p.poly([tip, V.add(back, w), V.sub(back, w)], { close: true, fill: "ink", lw: 0, ghost: true });
  }
  const am = a1 + d / 2, at = V.add(c, V.mul(dir(am), r + 0.1));
  p.text(txt, at[0], at[1], TH.sm, { anchor: "c", rot: rotOf(dir(am - 90)) });
}
