/**
 * The signature pen (#2215, founder 19.11: «наш работает криво… нужен этот, он сглаживает углы резкие»). The sample is
 * KokonutUI's Signature Pad (MIT; only the algorithm is taken, not the component): the finger sets a TARGET and the pen
 * follows it on a spring, so corners and the tremor of a finger are rounded off. What is stored does not change: the same
 * `M…L…` path of constant width in the 400 × 160 box (signaturePath.ts) — old signatures and the PDF draw as before, and
 * what the client saw on the field is exactly what is saved (the field draws the stored string). Pure and deterministic:
 * the same finger events give the same points. The variable width of the sample is a data-format change (rule 16, К1) —
 * a separate decision, not here.
 */

export type Pt = { x: number; y: number };

/** spring: acceleration = (target − position) · K − velocity · C, fixed step 1/240 s; a point is written when the pen has moved ≥ MIN_STEP px */
export const PEN = { K: 2600, C: 78, STEP: 1 / 240, MIN_STEP: 0.6, MAX_DT: 0.05, SETTLE_MAX: 1, SETTLE_EPS: 0.3 } as const;

export type Pen = { x: number; y: number; vx: number; vy: number; acc: number; last: Pt; points: Pt[] };

/** touch down: the pen is under the finger, the first point is written */
export function penStart(p: Pt): Pen {
  return { x: p.x, y: p.y, vx: 0, vy: 0, acc: 0, last: { x: p.x, y: p.y }, points: [{ x: p.x, y: p.y }] };
}

function step(pen: Pen, target: Pt): void {
  const ax = (target.x - pen.x) * PEN.K - pen.vx * PEN.C;
  const ay = (target.y - pen.y) * PEN.K - pen.vy * PEN.C;
  pen.vx += ax * PEN.STEP;
  pen.vy += ay * PEN.STEP;
  pen.x += pen.vx * PEN.STEP;
  pen.y += pen.vy * PEN.STEP;
  if (Math.hypot(pen.x - pen.last.x, pen.y - pen.last.y) >= PEN.MIN_STEP) {
    pen.last = { x: pen.x, y: pen.y };
    pen.points.push(pen.last);
  }
}

/** the finger moved to `target`, `dt` seconds after the previous event (clamped: a stalled frame does not make a jump) */
export function penMove(pen: Pen, target: Pt, dt: number): void {
  pen.acc += Math.min(Math.max(dt, 0), PEN.MAX_DT);
  while (pen.acc >= PEN.STEP) {
    pen.acc -= PEN.STEP;
    step(pen, target);
  }
}

/** finger up: the pen catches up with the last target (≤ 1 s of steps), and the last point is the finger's own */
export function penEnd(pen: Pen, target: Pt): void {
  for (let t = 0; t < PEN.SETTLE_MAX; t += PEN.STEP) {
    if (Math.hypot(target.x - pen.x, target.y - pen.y) < PEN.SETTLE_EPS && Math.hypot(pen.vx, pen.vy) < 5) break;
    step(pen, target);
  }
  const end = pen.points[pen.points.length - 1]!;
  if (pen.points.length > 1 && Math.hypot(target.x - end.x, target.y - end.y) > 0) pen.points.push({ x: target.x, y: target.y });
}

const f = (n: number) => n.toFixed(1);

/** the points of one stroke → path data; a single touch is a dot (a zero-length line, drawn by the round cap) */
export function strokePath(points: Pt[]): string {
  if (!points.length) return "";
  const [a, ...rest] = points as [Pt, ...Pt[]];
  if (!rest.length) return `M${f(a.x)} ${f(a.y)} L${f(a.x)} ${f(a.y)} `;
  return `M${f(a.x)} ${f(a.y)} ` + rest.map((p) => `L${f(p.x)} ${f(p.y)} `).join("");
}

/** «Отменить штрих»: the last stroke (from the last M) leaves; the rest is untouched */
export function undoStroke(d: string): string {
  const i = d.lastIndexOf("M");
  return i <= 0 ? "" : d.slice(0, i);
}

/**
 * One finger's strokes on a path string: `down` / `move` / `up` with the finger's point and the event time (ms). The path
 * is the existing one plus the current stroke; the pad and the full-screen canvas both use it.
 */
export function strokeController(getD: () => string, setD: (d: string) => void) {
  let pen: Pen | null = null;
  let base = "";
  let target: Pt = { x: 0, y: 0 };
  let t0 = 0;
  const show = () => setD(base + strokePath(pen!.points));
  return {
    down(p: Pt, ts: number) {
      base = getD();
      pen = penStart(p);
      target = p;
      t0 = ts;
      show();
    },
    move(p: Pt, ts: number) {
      if (!pen) return;
      target = p;
      penMove(pen, p, (ts - t0) / 1000);
      t0 = ts;
      show();
    },
    up() {
      if (!pen) return;
      penEnd(pen, target);
      show();
      pen = null;
    },
  };
}
