/**
 * A downspout by itself (spec 33-gutters-ds-auto, #1246; founder 12.11: «на каждом водостоке по-любому должен быть даунспот»).
 *
 * The unit is the CHAIN (a joined line: gutters whose ends meet, a corner or a straight join, not split by the user), not a
 * single gutter — two gutters joined into a corner are one chain, so «a corner of two lines has ONE downspout» needs no special
 * case. A chain wants ⌈length ÷ spacing⌉ downspouts (spacing 35 ft by default: one downspout on a very long straight gutter
 * overflows). Downspouts the user put by hand count and are never touched; the ones put here carry `auto`. A removed auto one
 * is not put back (`dsAutoOff` on its gutter). Pure functions: the same drawing back when nothing changes.
 */
import { addDownspout, removeElement } from "./edit";
import { isOpenEnd, runLengthIn, sameStory, type Drawing, type DrawnDownspout, type DrawnRun } from "../geometry";
import type { Choices } from "../settings";

/** a chain: the gutters that meet end to end (a join the user split with «Разъединить угол» breaks it) */
export function chains(d: Pick<Drawing, "runs">, tolIn = 1): string[][] {
  const rs = d.runs;
  const parent = rs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const A = rs[i]!, B = rs[j]!;
      if (!sameStory(A, B)) continue;
      let joined = false;
      for (const ea of [0, 1] as const) for (const eb of [0, 1] as const) {
        const pa = ea ? A.b : A.a, pb = eb ? B.b : B.a;
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) <= tolIn && !(isOpenEnd(A, ea) && isOpenEnd(B, eb))) joined = true;
      }
      if (joined) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, string[]>();
  rs.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r.id]));
  return [...groups.values()];
}

export interface AutoDsOptions {
  /** one downspout per this much chain length, inches (company setting; 35 ft by default) */
  spacingIn: number;
  /** from the end, inches (company setting; 12″) */
  edgeIn: number;
  /** the downspout as the company makes it (`newDsAttrs`), and the choices (size by the gutter's size, colour) */
  attrs: Omit<DrawnDownspout, "id" | "runId" | "atIn">;
  ch?: Choices;
  newId: () => string;
}

export const AUTO_DS_SPACING_IN = 35 * 12;
export const AUTO_DS_EDGE_IN = 12;

const sig = (d: Pick<Drawing, "runs">, id: string) => {
  const c = chains(d).find((g) => g.includes(id));
  return c ? [...c].sort().join(",") : "";
};
const shape = (r: DrawnRun) => `${r.a}|${r.b}|${r.lengthIn ?? ""}|${r.attrs.story ?? ""}|${JSON.stringify(r.attrs.openEnds ?? null)}`;

/** the runs a change touched: new, moved, or whose chain is not the same any more (a join made, split, a neighbour deleted) */
function touched(before: Drawing, after: Drawing): Set<string> {
  const was = new Map(before.runs.map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const r of after.runs) {
    const w = was.get(r.id);
    if (!w || shape(w) !== shape(r) || sig(before, r.id) !== sig(after, r.id)) out.add(r.id);
  }
  return out;
}

/** a free end: no other gutter's end meets it (or the join was split) */
function freeEnds(d: Drawing, r: DrawnRun): (0 | 1)[] {
  return ([0, 1] as const).filter((e) => {
    const p = e ? r.b : r.a;
    return isOpenEnd(r, e) || !d.runs.some((o) => o.id !== r.id && sameStory(o, r) && [o.a, o.b].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= 1));
  });
}

/** how far a downspout stands from the nearest free end of its gutter, inches (Infinity: none) */
const edgeDistance = (d: Drawing, s: DrawnDownspout): number => {
  const r = d.runs.find((x) => x.id === s.runId);
  if (!r) return Infinity;
  const L = runLengthIn(r);
  return Math.min(...freeEnds(d, r).map((e) => (e ? L - s.atIn : s.atIn)), Infinity);
};

/**
 * Put the downspouts of the chains a change touched (`before`: the drawing before the change; none — every chain). Adds what a
 * chain lacks, takes off the auto ones it has over (the ones nearest a free end stay).
 */
export function autoDownspouts(d: Drawing, o: AutoDsOptions, before?: Drawing): Drawing {
  const hot = before ? touched(before, d) : null;
  let next = d;
  for (const ids of chains(d)) {
    if (hot && !ids.some((id) => hot.has(id))) continue;
    const set = new Set(ids);
    const runs = next.runs.filter((r) => set.has(r.id));
    const total = runs.reduce((n, r) => n + runLengthIn(r), 0);
    if (total <= 0) continue;
    const here = next.downspouts.filter((s) => set.has(s.runId));
    const manual = here.filter((s) => !s.auto);
    const autos = here.filter((s) => s.auto);
    const off = runs.some((r) => r.dsAutoOff);
    const want = off ? 0 : Math.max(0, Math.ceil(total / o.spacingIn) - manual.length);
    if (autos.length > want) {
      const keep = new Set([...autos].sort((a, b) => edgeDistance(next, a) - edgeDistance(next, b)).slice(0, want).map((s) => s.id));
      const drop = new Set(autos.filter((s) => !keep.has(s.id)).map((s) => s.id));
      next = { ...next, downspouts: next.downspouts.filter((s) => !drop.has(s.id)) };
    } else if (autos.length < want) {
      // slots: the free ends (the one the line was finished at first — the last drawn gutter's end), then the middle of the longest gutters
      const slots: { runId: string; atIn: number }[] = [];
      for (const r of [...runs].reverse()) {
        const L = runLengthIn(r);
        const free = freeEnds(next, r);
        const edge = L < 2 * o.edgeIn ? Math.round(L / 2) : o.edgeIn;
        for (const e of ([1, 0] as const)) if (free.includes(e)) slots.push({ runId: r.id, atIn: e ? L - edge : edge });
      }
      for (const r of [...runs].sort((a, b) => runLengthIn(b) - runLengthIn(a))) slots.push({ runId: r.id, atIn: Math.round(runLengthIn(r) / 2) });
      let need = want - autos.length;
      for (const sl of slots) {
        if (need <= 0) break;
        const taken = next.downspouts.some((s) => s.runId === sl.runId && Math.abs(s.atIn - sl.atIn) < 2 * o.edgeIn);
        if (taken) continue;
        const r = next.runs.find((x) => x.id === sl.runId)!;
        const L = runLengthIn(r);
        const t = L > 0 ? sl.atIn / L : 0;
        const p: [number, number] = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
        const id = o.newId();
        const added = addDownspout(next, id, p, 1.5, o.attrs, o.ch);
        const s = added.downspouts.find((x) => x.id === id);
        if (!s || s.runId !== sl.runId) continue;
        next = { ...added, downspouts: added.downspouts.map((x) => (x.id === id ? { ...x, atIn: sl.atIn, auto: true } : x)) };
        need--;
      }
    }
  }
  return next;
}

/**
 * A downspout taken off by hand: a gutter of the chain that had an auto one there says «no more by itself» (`dsAutoOff`), so the
 * next change does not put it back. A hand-put one just goes. `keepOutlet`: the outlet stays (water goes to another gutter / a chain).
 */
export function removeDownspout(d: Drawing, id: string, opts: { keepOutlet?: boolean } = {}): Drawing {
  const s = d.downspouts.find((x) => x.id === id);
  if (!s) return d;
  if (opts.keepOutlet) {
    return { ...d, downspouts: d.downspouts.map((x) => (x.id === id ? { ...x, pipe: false as const, auto: undefined } : x)) };
  }
  return removeElement(d, id);
}
