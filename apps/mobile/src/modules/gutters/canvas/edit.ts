/**
 * Editing the drawing with a finger (docs/specs/33-gutters-canvas.md П20.4 M4b). Pure: plan inches in, a new drawing
 * out. Tolerances come from the screen (a finger is ~22 px whatever the zoom) and are passed in as inches.
 * Prilipanie (snapping) is geometry.ts: to the ends of other lines first, else the direction to 45° steps.
 */
import { centre, chainOf, houseSide, nearestRun, projectOnRun, runLengthIn, snapDirection, snapPoint, type CornerChoice, type Drawing, type DrawnDownspout, type DrawnRun, type FoundCorner, type P } from "../geometry";
import type { Story } from "./scene";
import { changeDs, changeRun, type DsAttrs } from "./attrs";
import type { Choices } from "../settings";

/** shorter than this is a slip of the finger, not a line */
export const MIN_RUN_IN = 12;

export const endsOf = (d: Pick<Drawing, "runs">, except?: string): P[] => d.runs.filter((r) => r.id !== except).flatMap((r) => [r.a, r.b]);

/** where a line starts: on an existing end if the finger is near one */
export const startAt = (d: Drawing, p: P, tolIn: number): P => snapPoint(p, endsOf(d), tolIn);

/** where a line being drawn ends: an existing end wins, else the direction snaps to 45° steps */
export function endAt(d: Drawing, a: P, p: P, tolIn: number, except?: string): P {
  const ends = endsOf(d, except).filter((e) => e[0] !== a[0] || e[1] !== a[1]);
  const s = snapPoint(p, ends, tolIn);
  const snapped = ends.some((e) => e[0] === s[0] && e[1] === s[1]);
  return snapped ? s : snapDirection(a, s);
}

export function addRun(d: Drawing, id: string, a: P, b: P, attrs: DrawnRun["attrs"]): Drawing {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_RUN_IN) return d;
  return { ...d, runs: [...d.runs, { id, a, b, attrs: { ...attrs } }] };
}

export type Hit = { kind: "ds"; id: string } | { kind: "end"; id: string; end: 0 | 1 } | { kind: "run"; id: string };

/** what is under the finger: a downspout, then a line's end (to drag), then a line */
export function hitTest(d: Drawing, p: P, tolIn: number): Hit | null {
  let best: { h: Hit; dist: number } | null = null;
  const take = (h: Hit, dist: number) => {
    if (dist <= tolIn && (!best || dist < best.dist)) best = { h, dist };
  };
  const byId = new Map(d.runs.map((r) => [r.id, r]));
  for (const s of d.downspouts) {
    const r = byId.get(s.runId);
    if (!r) continue;
    const t = Math.min(1, Math.max(0, s.atIn / (runLengthIn(r) || 1)));
    take({ kind: "ds", id: s.id }, Math.hypot(p[0] - (r.a[0] + (r.b[0] - r.a[0]) * t), p[1] - (r.a[1] + (r.b[1] - r.a[1]) * t)));
  }
  if (best) return (best as { h: Hit }).h;
  for (const r of d.runs) {
    take({ kind: "end", id: r.id, end: 0 }, Math.hypot(p[0] - r.a[0], p[1] - r.a[1]));
    take({ kind: "end", id: r.id, end: 1 }, Math.hypot(p[0] - r.b[0], p[1] - r.b[1]));
  }
  if (best) return (best as { h: Hit }).h;
  const n = nearestRun(d, p, tolIn);
  return n ? { kind: "run", id: n.runId } : null;
}

/** drag one end of a line; it sticks to other lines' ends; a typed length no longer matches, so it is dropped */
export function moveEnd(d: Drawing, runId: string, end: 0 | 1, p: P, tolIn: number): Drawing {
  const r = d.runs.find((x) => x.id === runId);
  if (!r) return d;
  const fixed = end === 0 ? r.b : r.a;
  const at = endAt(d, fixed, p, tolIn, runId);
  if (Math.hypot(at[0] - fixed[0], at[1] - fixed[1]) < MIN_RUN_IN) return d;
  const { lengthIn: _typed, ...rest } = r;
  const moved: DrawnRun = end === 0 ? { ...rest, a: at } : { ...rest, b: at };
  // downspouts stay on the line: at most its new length
  const L = Math.round(Math.hypot(moved.b[0] - moved.a[0], moved.b[1] - moved.a[1]));
  return {
    ...d,
    runs: d.runs.map((x) => (x.id === runId ? moved : x)),
    downspouts: d.downspouts.map((s) => (s.runId === runId && s.atIn > L ? { ...s, atIn: L } : s)),
  };
}

/** a downspout on the nearest line under the finger (none if no line is near) */
export function addDownspout(d: Drawing, id: string, p: P, tolIn: number, attrs: Omit<DrawnDownspout, "id" | "runId" | "atIn">): Drawing {
  const n = nearestRun(d, p, tolIn);
  if (!n) return d;
  const r = d.runs.find((x) => x.id === n.runId)!;
  const L = runLengthIn(r);
  const atIn = Math.min(L, Math.max(0, Math.round(projectOnRun(r, p).atIn)));
  return { ...d, downspouts: [...d.downspouts, { ...attrs, id, runId: n.runId, atIn } as DrawnDownspout] };
}

/** remove a line (with its downspouts) or a downspout */
export function removeElement(d: Drawing, id: string): Drawing {
  if (d.runs.some((r) => r.id === id)) return { ...d, runs: d.runs.filter((r) => r.id !== id), downspouts: d.downspouts.filter((s) => s.runId !== id) };
  return { ...d, downspouts: d.downspouts.filter((s) => s.id !== id) };
}

/** the same drawing back when nothing changes (no empty «назад» step) */
export function setStory(d: Drawing, id: string, story: Story): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r || r.attrs.story === story) return d;
  return { ...d, runs: d.runs.map((x) => (x.id === id ? { ...x, attrs: { ...x.attrs, story } } : x)) };
}

/** a run's attributes changed in the panel (П21.8): the same drawing back when nothing changes */
export function setRunAttrs(d: Drawing, id: string, patch: Partial<DrawnRun["attrs"]>, ch?: Choices): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r) return d;
  const attrs = changeRun(r.attrs, patch, ch);
  return attrs === r.attrs ? d : { ...d, runs: d.runs.map((x) => (x.id === id ? { ...x, attrs } : x)) };
}

/** a downspout's attributes changed in the panel */
export function setDsAttrs(d: Drawing, id: string, patch: Partial<DsAttrs>, ch?: Choices): Drawing {
  const s = d.downspouts.find((x) => x.id === id);
  if (!s) return d;
  const { id: _id, runId, atIn, ...was } = s;
  const attrs = changeDs(was, patch, ch);
  return attrs === was ? d : { ...d, downspouts: d.downspouts.map((x) => (x.id === id ? { ...attrs, id, runId, atIn } : x)) };
}

/**
 * The tape: the typed length wins over the drawn one (confidence `taped`) and the line is redrawn to it; null drops
 * the tape (the line stays where it is — «по рисунку»).
 * A downspout stays where it is drawn: its distance along the run scales with the new length.
 */
export function setLength(d: Drawing, id: string, lengthIn: number | null): Drawing {
  const r = d.runs.find((x) => x.id === id);
  if (!r) return d;
  const want = lengthIn === null ? undefined : Math.round(lengthIn * 8) / 8;
  if (r.lengthIn === want) return d;
  const { lengthIn: _was, ...rest } = r;
  if (want === undefined) return { ...d, runs: d.runs.map((x) => (x.id === id ? rest : x)) };
  // the line takes the typed length on the drawing too (founder 08.11: 500 ft and 40 ft were the same size): its end
  // b moves along the line; what is joined beyond it moves along, so the corners hold
  const vx = r.b[0] - r.a[0], vy = r.b[1] - r.a[1];
  const D = Math.hypot(vx, vy) || 1;
  const nb: P = [Math.round(r.a[0] + (vx / D) * want), Math.round(r.a[1] + (vy / D) * want)];
  const near = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  const at = (p: P) => near(p, r.b);
  const next: DrawnRun = { ...rest, b: nb, lengthIn: want };
  const was = runLengthIn(r) || 1;
  // what hangs on end b (joined end to end, not through this run): it moves as a whole, keeping its shape — unless it
  // comes round to end a (a closed line), then only the joined ends move
  const beyond = new Set<string>();
  const todo = d.runs.filter((x) => x.id !== id && (at(x.a) || at(x.b))).map((x) => x.id);
  todo.forEach((x) => beyond.add(x));
  while (todo.length) {
    const cid = todo.pop();
    const cur = d.runs.find((x) => x.id === cid)!;
    for (const o of d.runs) {
      if (o.id === id || beyond.has(o.id)) continue;
      if ([o.a, o.b].some((p) => near(p, cur.a) || near(p, cur.b))) {
        beyond.add(o.id);
        todo.push(o.id);
      }
    }
  }
  const closed = d.runs.some((x) => beyond.has(x.id) && (near(x.a, r.a) || near(x.b, r.a)));
  const dx = nb[0] - r.b[0], dy = nb[1] - r.b[1];
  const shift = (p: P): P => [p[0] + dx, p[1] + dy];
  return {
    ...d,
    runs: d.runs.map((x) => {
      if (x.id === id) return next;
      if (!closed && beyond.has(x.id)) return { ...x, a: shift(x.a), b: shift(x.b) };
      return at(x.a) ? { ...x, a: nb } : at(x.b) ? { ...x, b: nb } : x;
    }),
    downspouts: d.downspouts.map((s) => (s.runId === id ? { ...s, atIn: Math.min(want, Math.round((s.atIn * want) / was)) } : s)),
  };
}

/** «Отменить» after a delete: put back what the delete took (a run and its downspouts), keep everything drawn since */
export function restoreRemoved(cur: Drawing, before: Drawing, removedId: string): Drawing {
  const run = before.runs.find((r) => r.id === removedId);
  const back = { runs: run ? [run] : [], downspouts: before.downspouts.filter((s) => s.id === removedId || (run && s.runId === run.id)) };
  const haveR = new Set(cur.runs.map((r) => r.id));
  const haveD = new Set(cur.downspouts.map((s) => s.id));
  const runs = back.runs.filter((r) => !haveR.has(r.id));
  const ids = new Set([...cur.runs, ...runs].map((r) => r.id));
  const downspouts = back.downspouts.filter((s) => !haveD.has(s.id) && ids.has(s.runId));
  return runs.length || downspouts.length ? { ...cur, runs: [...cur.runs, ...runs], downspouts: [...cur.downspouts, ...downspouts] } : cur;
}

/** a one-finger stroke in progress */
export type Stroke = { kind: "line"; a: P } | { kind: "end"; id: string; end: 0 | 1; before: Drawing } | { kind: "ds"; id: string; before: Drawing };

/** a downspout dragged by the finger (founder 08.11): it slides along its own run only */
export function moveDs(d: Drawing, id: string, p: P): Drawing {
  const s = d.downspouts.find((x) => x.id === id);
  const r = s && d.runs.find((x) => x.id === s.runId);
  if (!s || !r) return d;
  const atIn = Math.min(runLengthIn(r), Math.max(0, projectOnRun(r, p).atIn));
  return atIn === s.atIn ? d : { ...d, downspouts: d.downspouts.map((x) => (x.id === id ? { ...x, atIn } : x)) };
}

/**
 * The finger lifted (or the stroke was cancelled — a second finger came for the zoom): the drawing to keep.
 * The final point comes from the lift event itself, not from the last frame drawn. Cancelled: a line is dropped,
 * a dragged end goes back.
 */
export function finishStroke(g: Stroke, d: Drawing, p: P, tolIn: number, canceled: boolean, newRun: { id: string; attrs: DrawnRun["attrs"] }): Drawing {
  if (g.kind === "end") return canceled ? g.before : moveEnd(g.before, g.id, g.end, p, tolIn);
  if (g.kind === "ds") return canceled ? g.before : moveDs(g.before, g.id, p);
  if (canceled) return d;
  return addRun(d, newRun.id, g.a, endAt(d, g.a, p, tolIn), newRun.attrs);
}

/** the own «назад» of the canvas (П14.2 №5): snapshots, at most `max` back */
export interface History { past: Drawing[]; future: Drawing[] }
export const HISTORY_MAX = 50;
export const pushHistory = (h: History, prev: Drawing): History => ({ past: [...h.past, prev].slice(-HISTORY_MAX), future: [] });
export function undo(h: History, cur: Drawing): { h: History; d: Drawing } | null {
  const prev = h.past[h.past.length - 1];
  return prev ? { h: { past: h.past.slice(0, -1), future: [cur, ...h.future] }, d: prev } : null;
}
export function redo(h: History, cur: Drawing): { h: History; d: Drawing } | null {
  const next = h.future[0];
  return next ? { h: { past: [...h.past, cur], future: h.future.slice(1) }, d: next } : null;
}

/**
 * How a corner is made (M7c, spec 33 П22.2 №15): stored on both runs that meet there (each at its own end); it counts
 * only while both hold it (cornerChoiceOf), so a deleted run leaves no live choice behind. `null` — the company's default.
 */
export function setCornerMethod(d: Drawing, corner: Pick<FoundCorner, "runs">, method: CornerChoice["method"] | null): Drawing {
  let changed = false;
  const runs = d.runs.map((r) => {
    const end = corner.runs.find((x) => x.id === r.id);
    if (!end) return r;
    const key = end.end ? "b" : "a";
    const cur = r.attrs.cornerMethod ?? {};
    if ((cur[key] ?? null) === method) return r;
    changed = true;
    const next = { ...cur };
    if (method) next[key] = method;
    else delete next[key];
    const { cornerMethod: _old, ...rest } = r.attrs;
    return { ...r, attrs: Object.keys(next).length ? { ...rest, cornerMethod: next } : rest };
  });
  return changed ? { ...d, runs } : d;
}

/**
 * Flip the gutter's face (founder 08.11): a tap on an end cap swaps left ↔ right, a corner inside ↔ outside. The face
 * is one side of the whole line round the house, so every run joined to this one flips with it; the caps and the
 * corners follow (they are read from the house side).
 */
export function flipFace(d: Drawing, runId: string): Drawing {
  if (!d.runs.some((r) => r.id === runId)) return d;
  const c = centre(d.runs);
  const chain = chainOf(d, runId);
  return { ...d, runs: d.runs.map((r) => (chain.has(r.id) ? { ...r, houseSide: houseSide(r, c) === "L" ? "R" : "L" } : r)) };
}

/**
 * Set the angle between the walls at a corner (founder 08.11: measured by a triangle on site). The first run stays;
 * the second turns about the corner — the same way it turns now — and what hangs on its far end turns with it.
 * A closed line: only the second run's far end moves (its neighbours keep the join). Same drawing back when nothing
 * changes or the angle is out of 20°…180°.
 */
export function setCornerAngle(d: Drawing, f: Pick<FoundCorner, "runs" | "at">, angleDeg: number): Drawing {
  if (!(angleDeg >= 20 && angleDeg <= 180)) return d;
  const A = d.runs.find((x) => x.id === f.runs[0].id);
  const B = d.runs.find((x) => x.id === f.runs[1].id);
  if (!A || !B) return d;
  const c = f.at;
  const aFar = f.runs[0].end ? A.a : A.b;
  const bFar = f.runs[1].end ? B.a : B.b;
  const vin: P = [c[0] - aFar[0], c[1] - aFar[1]];
  const vout: P = [bFar[0] - c[0], bFar[1] - c[1]];
  const cur = (Math.atan2(vin[0] * vout[1] - vin[1] * vout[0], vin[0] * vout[0] + vin[1] * vout[1]) * 180) / Math.PI;
  const want = (cur >= 0 ? 1 : -1) * (180 - angleDeg);
  const rad = ((want - cur) * Math.PI) / 180;
  if (Math.abs(rad) < 1e-6) return d;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = (p: P): P => {
    const x = p[0] - c[0], y = p[1] - c[1];
    return [Math.round(c[0] + x * cos - y * sin), Math.round(c[1] + x * sin + y * cos)];
  };
  const near = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  // what hangs on B's far end, not through the corner
  const hang = new Set<string>();
  const todo = [bFar];
  const seenPts: P[] = [];
  while (todo.length) {
    const pt = todo.pop()!;
    if (seenPts.some((q) => near(q, pt)) || near(pt, c)) continue;
    seenPts.push(pt);
    for (const o of d.runs) {
      if (o.id === B.id || hang.has(o.id)) continue;
      if (near(o.a, pt) || near(o.b, pt)) {
        hang.add(o.id);
        todo.push(near(o.a, pt) ? o.b : o.a);
      }
    }
  }
  const closed = hang.has(A.id);
  const nb = rot(bFar);
  return {
    ...d,
    runs: d.runs.map((x) => {
      if (x.id === B.id) return f.runs[1].end ? { ...x, a: nb } : { ...x, b: nb };
      if (!closed && hang.has(x.id)) return { ...x, a: rot(x.a), b: rot(x.b) };
      if (closed && x.id !== A.id) return near(x.a, bFar) ? { ...x, a: nb } : near(x.b, bFar) ? { ...x, b: nb } : x;
      return x;
    }),
  };
}
