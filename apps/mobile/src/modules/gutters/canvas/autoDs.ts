/**
 * A downspout by itself (spec 33-gutters-ds-auto, #1246; founder 12.11: «на каждом водостоке по-любому должен быть даунспот»).
 *
 * The unit is the CHAIN (a joined line: gutters whose ends meet, a corner or a straight join, not split by the user), not a single
 * gutter — two gutters joined into a corner are one chain, so «a corner of two lines has ONE downspout» needs no special case.
 * A chain wants ⌈length ÷ spacing⌉ downspouts (spacing = the company's «runPerDsFt», 40 ft by default: one downspout on a very long
 * straight gutter overflows), less the ones the user put by hand. The ones put here carry `auto` and are the program's: whenever a
 * chain is touched (a gutter drawn, joined, split, deleted, moved, its length typed) its automatic downspouts are put again where
 * they belong — the free end, 12″ in — so they never stand where the line was before; one that already stands at a free end stays.
 * A downspout taken off by hand is COUNTED on its gutter (and the counts are zeroed when two chains are joined: the new chain is another) (`attrs.dsAutoOff`, a number): the chain wants that many less. The program
 * puts no downspout out of the drawing just because there is no place for it: it takes one off only when the chain wants fewer (it was
 * made shorter, joined, split), the one nearest the middle first.
 *
 * A drawing is managed only when it began so — it was empty when the first line was drawn, or a gutter carries `attrs.dsAuto`
 * (written here, in the attrs an old phone copies whole); a measurement from before this feature gets none by an edit — only by the
 * explicit «Расставить водостоки» (`force`). Pure functions: the same drawing back when nothing changes.
 */
import { addDownspout } from "./edit";
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
  /** one downspout per this much chain length, inches (the company's «runPerDsFt», 40 ft by default) */
  spacingIn: number;
  /** from the end, inches (company setting; 12″) */
  edgeIn: number;
  /** the downspout as the company makes it (`newDsAttrs`), and the choices (size by the gutter's size, colour) */
  attrs: Omit<DrawnDownspout, "id" | "runId" | "atIn">;
  ch?: Choices;
  newId: () => string;
}

export const AUTO_DS_SPACING_IN = 40 * 12; // = the rule «runPerDsFt» 40 ft by default (Rules, settings.ts)
export const AUTO_DS_EDGE_IN = 12;

const sig = (d: Pick<Drawing, "runs">, id: string) => {
  const c = chains(d).find((g) => g.includes(id));
  return c ? [...c].sort().join(",") : "";
};
const shape = (r: DrawnRun) => `${r.a}|${r.b}|${r.lengthIn ?? ""}|${r.attrs.story ?? ""}|${JSON.stringify(r.attrs.openEnds ?? null)}`;

/** the runs a change touched: new, moved, retyped, or whose chain is not the same any more (a join made, split, a neighbour deleted) */
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

/** does the program manage this drawing? (it was empty when the first line came, or a gutter says so) */
export const autoManaged = (before: Drawing | undefined): boolean => !before || before.runs.length === 0 || before.runs.some((r) => r.attrs.dsAuto);

type Slot = { runId: string; atIn: number };
/** how many automatic downspouts of this gutter the user took off */
const offOf = (r: DrawnRun): number => Number(r.attrs.dsAutoOff) || 0;

/** where `want` automatic downspouts of a chain stand: the free ends first (the last drawn gutter's end first), then evenly along the longest gutters */
function slotsFor(d: Drawing, runs: DrawnRun[], want: number, edgeIn: number, manual: DrawnDownspout[]): Slot[] {
  const slots: Slot[] = [];
  for (const r of [...runs].reverse()) {
    const L = runLengthIn(r);
    const free = freeEnds(d, r);
    const edge = L < 2 * edgeIn ? Math.round(L / 2) : edgeIn;
    for (const e of [1, 0] as const) if (free.includes(e)) slots.push({ runId: r.id, atIn: e ? L - edge : edge });
  }
  const near = (s: Slot) => manual.some((m) => m.runId === s.runId && Math.abs(m.atIn - s.atIn) < 2 * edgeIn);
  const out = slots.filter((s) => !near(s)).slice(0, want);
  let extra = want - out.length;
  if (extra > 0 && runs.length) {
    // the rest evenly: each extra goes to the gutter with the most length per downspout, at the middles of its parts
    const count = new Map(runs.map((r) => [r.id, 0]));
    for (const s of out) count.set(s.runId, (count.get(s.runId) ?? 0) + 1);
    const add = new Map<string, number>();
    while (extra-- > 0) {
      const best = runs.reduce((a, b) => (runLengthIn(b) / ((count.get(b.id) ?? 0) + 1) > runLengthIn(a) / ((count.get(a.id) ?? 0) + 1) ? b : a));
      count.set(best.id, (count.get(best.id) ?? 0) + 1);
      add.set(best.id, (add.get(best.id) ?? 0) + 1);
    }
    for (const r of runs) {
      const c = add.get(r.id) ?? 0;
      const L = runLengthIn(r);
      for (let j = 0; j < c; j++) {
        // evenly along the gutter: the middles of its c + 1 parts (one extra — the middle)
        const pos = Math.round((L * (j + 1)) / (c + 1));
        const s = { runId: r.id, atIn: Math.min(L, Math.max(0, pos)) };
        if (!near(s)) out.push(s);
      }
    }
  }
  return out;
}

/** does an automatic downspout stand where one belongs — `edgeIn` from a FREE end of its gutter (a short gutter: its middle)? Such a one is not moved */
function atFreeEnd(d: Drawing, s: DrawnDownspout, edgeIn: number): boolean {
  const r = d.runs.find((x) => x.id === s.runId);
  if (!r) return false;
  const L = runLengthIn(r);
  const edge = L < 2 * edgeIn ? Math.round(L / 2) : edgeIn;
  return freeEnds(d, r).some((e) => Math.abs((e ? L - s.atIn : s.atIn) - edge) <= 1);
}

/**
 * Put the downspouts of the chains a change touched (`before`: the drawing before the change; none — every chain). A chain wants
 * ⌈length ÷ spacing⌉ − (those by hand) − (the removed ones, counted on its gutters). Its automatic downspouts: the ones that stand
 * where they belong (a free end, or the evenly spread places) stay as they are, id and all; the others move to the places that are
 * lacking; the missing ones are put; taken off — only when the chain wants FEWER than it has (shorter, joined, split), the ones that
 * do not stand at a free end and nearest the middle first. No place for one is never a reason to take one off. Nothing is put in a
 * drawing the program does not manage (`autoManaged`) unless `force`.
 */
export function autoDownspouts(d: Drawing, o: AutoDsOptions, before?: Drawing, force = false): Drawing {
  if (!force && !autoManaged(before)) return d;
  const hot = before && !force ? touched(before, d) : null;
  let next = d;
  for (const ids of chains(d)) {
    if (hot && !ids.some((id) => hot.has(id))) continue;
    const set = new Set(ids);
    // two chains joined into one (the sign: its gutters came from two different chains before): the counts of removed downspouts are
    // zeroed — the person took one off in the OLD chain, the new one is another (decision of the director 12.11); the ones that stand stay
    if (before && !force && new Set(ids.map((id) => sig(before, id)).filter(Boolean)).size > 1 && next.runs.some((r) => set.has(r.id) && offOf(r))) {
      next = { ...next, runs: next.runs.map((r) => { if (!set.has(r.id) || !offOf(r)) return r; const { dsAutoOff: _o, ...rest } = r.attrs; return { ...r, attrs: rest }; }) };
    }
    const runs = next.runs.filter((r) => set.has(r.id));
    const total = runs.reduce((n, r) => n + runLengthIn(r), 0);
    if (total <= 0) continue;
    const here = next.downspouts.filter((s) => set.has(s.runId));
    const manual = here.filter((s) => !s.auto);
    const autos = here.filter((s) => s.auto);
    const removed = runs.reduce((n, r) => n + offOf(r), 0);
    const want = Math.max(0, Math.ceil(total / o.spacingIn) - manual.length - removed);
    const slots = slotsFor(next, runs, want, o.edgeIn, manual);
    const onSlot = (s: DrawnDownspout) => slots.some((sl) => sl.runId === s.runId && Math.abs(sl.atIn - s.atIn) <= 1);
    const settled = autos.filter((s) => onSlot(s) || atFreeEnd(next, s, o.edgeIn));
    const loose = autos.filter((s) => !settled.includes(s));
    // taken off: only the excess over what the chain wants; the loose ones first (farthest from a free end), then the settled
    const edgeDist = (s: DrawnDownspout) => { const r = next.runs.find((x) => x.id === s.runId)!; const L = runLengthIn(r); return Math.min(...freeEnds(next, r).map((e) => (e ? L - s.atIn : s.atIn)), Infinity); };
    const far = (a: DrawnDownspout, b: DrawnDownspout) => edgeDist(b) - edgeDist(a);
    let excess = Math.max(0, autos.length - want);
    const drop = new Set<string>();
    for (const s of [...loose].sort(far)) if (excess > 0) { drop.add(s.id); excess--; }
    for (const s of [...settled].sort(far)) if (excess > 0) { drop.add(s.id); excess--; }
    const keepSettled = settled.filter((s) => !drop.has(s.id));
    const keepLoose = loose.filter((s) => !drop.has(s.id));
    // the places still lacking: not near one that stays
    const taken = (sl: Slot) => keepSettled.some((s) => s.runId === sl.runId && Math.abs(s.atIn - sl.atIn) < 2 * o.edgeIn);
    const open = slots.filter((sl) => !taken(sl));
    const placed: DrawnDownspout[] = [...keepSettled];
    for (const s of keepLoose) {
      const sl = open.shift();
      placed.push(sl ? { ...s, runId: sl.runId, atIn: sl.atIn } : s); // no place: it stays where it is, never taken off for that
    }
    for (let need = want - placed.length; need > 0 && open.length; need--) {
      const sl = open.shift()!;
      const r = next.runs.find((x) => x.id === sl.runId)!;
      const L = runLengthIn(r);
      const t = L > 0 ? sl.atIn / L : 0;
      const p: [number, number] = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
      const id = o.newId();
      const added = addDownspout(next, id, p, 1.5, o.attrs, o.ch);
      const s = added.downspouts.find((x) => x.id === id);
      if (!s || s.runId !== sl.runId) { need++; continue; }
      placed.push({ ...s, atIn: sl.atIn, auto: true });
    }
    const keep = next.downspouts.filter((s) => !(set.has(s.runId) && s.auto));
    const same = placed.length === autos.length && placed.every((s) => autos.some((a) => a === s));
    // every gutter of the chain says «the program manages this» (written in attrs: an old phone copies them whole)
    const marked = runs.every((r) => r.attrs.dsAuto);
    if (same && marked) continue;
    next = {
      ...next,
      runs: marked ? next.runs : next.runs.map((r) => (set.has(r.id) ? { ...r, attrs: { ...r.attrs, dsAuto: true as const } } : r)),
      downspouts: same ? next.downspouts : [...keep, ...placed],
    };
  }
  return next;
}

/**
 * What a finished edit becomes (the one place `DrawScreen.commit` asks): the chains it touched get their downspouts — unless it is a
 * put-back (`placed`: «Отменить» of a toast, the drawing as it was), which is set as it is: the recount would see the old drawing as
 * «a join» and zero the counts (review of the director on #1264).
 */
export function commitAuto(made: Drawing, prev: Drawing, placed: boolean, o: AutoDsOptions | null): Drawing {
  return placed || !o ? made : autoDownspouts(made, o, prev);
}
