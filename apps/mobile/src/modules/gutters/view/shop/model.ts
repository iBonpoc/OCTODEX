/**
 * The measurement as a shop drawing reads it (#1349): gutter lines walked end to end («RUN 1», segments 1-1, 1-2 …) at their
 * TRUE lengths (the typed length wins over the sketch), every end named (end cap L / R, miter, bay), the tags of the
 * plan (A, B, C …), the downspouts. Pure; quantities are the estimate's (the engine's parts), not counted here. Nothing is invented: what the measurement does not say is
 * `undefined` here and «TBD» / «VERIFY» on the sheet.
 */
import { capSide, cornerChoiceOf, findCorners, houseSides, runEnds, runLengthIn, withoutDuplicates, type CornerChoice, type Drawing, type DrawnRun, type FoundCorner, type P } from "../../geometry";

export interface ShopEnd {
  kind: "cap" | "corner" | "join";
  hand?: "L" | "R";
  cornerKind?: FoundCorner["kind"];
  /** the angle between the two gutters, as a tape reads it (90, 126) */
  angleDeg?: number;
  outward?: boolean;
  cornerId?: string;
  /** how the corner is made: its own choice, else the company's (as the estimate takes it) */
  method?: CornerChoice["method"];
  /** the plan tag of the part at this end (A, B — end caps; C, D … — miters) */
  tag?: string;
}
export interface ShopSeg {
  id: string;
  /** «1-2»: run 1, its 2nd segment */
  tag: string;
  /** true-scale plan points, inches, as walked */
  a: P;
  b: P;
  lengthIn: number;
  /** the house, looking a → b */
  house: "L" | "R";
  widthIn: number;
  story: number;
  ends: [ShopEnd, ShopEnd];
  run: DrawnRun;
  /** walked a → b as it was drawn */
  forward: boolean;
}
export interface ShopChain { n: number; story: number; segs: ShopSeg[]; totalIn: number; /** an outline that ends where it began */ closed: boolean }
export interface ShopDs {
  n: number;
  tag: string;
  seg: ShopSeg;
  at: P;
  /** from the nearer end of its segment */
  fromEndIn: number;
  size: string;
  color?: string;
  material?: string;
  /** elbows by style, as measured */
  elbows?: { style: string; qty: number }[];
  offsets?: { lengthIn: number; qty: number }[];
  dropIn?: number;
}
export interface ShopTag { tag: string; kind: "capL" | "capR" | "miter"; cornerKind?: FoundCorner["kind"]; angleDeg?: number; outward: number; inward: number; qty: number; /** of them cut on site from the gutter (the rest are parts of the estimate) */ cut: number }
export interface ShopModel { chains: ShopChain[]; ds: ShopDs[]; tags: ShopTag[]; stories: number[] }

const near = (p: P, q: P, tol = 1) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;

/** the runs of one storey joined end to end, each walked once from a free end (the earliest drawn one) */
function walk(runs: DrawnRun[]): { run: DrawnRun; forward: boolean }[][] {
  const left = new Set(runs.map((r) => r.id));
  const out: { run: DrawnRun; forward: boolean }[][] = [];
  const degree = (p: P, story: number) => runs.filter((r) => (Number(r.attrs.story) || 1) === story).flatMap((r) => [r.a, r.b]).filter((q) => near(p, q)).length;
  while (left.size) {
    const pool = runs.filter((r) => left.has(r.id));
    const story = Number(pool[0]!.attrs.story) || 1;
    // the chain of the earliest run left
    const chain = new Set([pool[0]!.id]);
    for (let grown = true; grown; ) {
      grown = false;
      for (const r of pool) {
        if (chain.has(r.id) || (Number(r.attrs.story) || 1) !== story) continue;
        if (pool.some((o) => chain.has(o.id) && [o.a, o.b].some((p) => near(p, r.a) || near(p, r.b)))) { chain.add(r.id); grown = true; }
      }
    }
    const rs = pool.filter((r) => chain.has(r.id));
    const start = rs.find((r) => degree(r.a, story) === 1 || degree(r.b, story) === 1) ?? rs[0]!;
    let forward = degree(start.a, story) === 1 || degree(start.b, story) !== 1;
    const steps = [{ run: start, forward }];
    const used = new Set([start.id]);
    let at = forward ? start.b : start.a;
    for (;;) {
      const next = rs.find((r) => !used.has(r.id) && (near(r.a, at) || near(r.b, at)));
      if (!next) break;
      forward = near(next.a, at);
      steps.push({ run: next, forward });
      used.add(next.id);
      at = forward ? next.b : next.a;
    }
    // a branch (three ends at a point) leaves runs unwalked: they start chains of their own
    for (const s of steps) left.delete(s.run.id);
    out.push(steps);
  }
  return out;
}

export function shopModel(d0: Drawing, storyFt?: number, corner: CornerChoice["method"] = "cut"): ShopModel {
  // as the estimate reads the drawing: a gutter lying on another is counted once (#1256)
  const d = withoutDuplicates(d0);
  const side = houseSides(d);
  const corners = findCorners(d);
  const ends = runEnds(d, corners);
  const chains: ShopChain[] = walk(d.runs).map((steps, ci) => {
    let at: P | null = null;
    const closed = steps.length > 2 && near(steps[0]!.forward ? steps[0]!.run.a : steps[0]!.run.b, steps[steps.length - 1]!.forward ? steps[steps.length - 1]!.run.b : steps[steps.length - 1]!.run.a);
    const segs = steps.map(({ run, forward }, si): ShopSeg => {
      const a0 = forward ? run.a : run.b, b0 = forward ? run.b : run.a;
      const L = runLengthIn(run), dl = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1;
      // a closed outline keeps its sketch (its typed lengths may not close); an open line is laid out by the tape
      const a: P = closed || !at ? a0 : at;
      const b: P = closed ? b0 : [a[0] + ((b0[0] - a0[0]) / dl) * L, a[1] + ((b0[1] - a0[1]) / dl) * L];
      at = b;
      const s = side(run);
      const house = forward ? s : s === "L" ? "R" : "L";
      const end = (e: 0 | 1): ShopEnd => {
        const x = ends[run.id]![forward ? e : ((1 - e) as 0 | 1)];
        if (x.kind === "cap") return { kind: "cap", hand: capSide(forward ? e : ((1 - e) as 0 | 1), s) };
        if (x.kind === "corner") { const c = corners.find((k) => k.id === x.cornerId)!; return { kind: "corner", cornerKind: c.kind, angleDeg: 180 - c.turnDeg, outward: !!c.outward, cornerId: c.id, method: d.corners?.[c.id]?.method ?? cornerChoiceOf(d, c)?.method ?? corner }; }
        return { kind: "join" };
      };
      const w = parseFloat(String(run.attrs.size));
      return { id: run.id, tag: `${ci + 1}-${si + 1}`, a, b, lengthIn: L, house, widthIn: Number.isFinite(w) && w > 0 ? w : 5, story: Number(run.attrs.story) || 1, ends: [end(0), end(1)], run, forward };
    });
    return { n: ci + 1, story: segs[0]!.story, segs, totalIn: segs.reduce((n, s) => n + s.lengthIn, 0), closed };
  });

  // tags: A — end cap left, B — end cap right, then one letter a kind of miter (its kind and angle), in the order met
  const tags: ShopTag[] = [];
  const tagOf = (kind: ShopTag["kind"], cornerKind?: FoundCorner["kind"], angleDeg?: number) => {
    let t = tags.find((x) => x.kind === kind && x.cornerKind === cornerKind && x.angleDeg === angleDeg);
    if (!t) { t = { tag: "", kind, cornerKind, angleDeg, outward: 0, inward: 0, qty: 0, cut: 0 }; tags.push(t); }
    return t;
  };
  const seen = new Set<string>();
  const all = chains.flatMap((c) => c.segs);
  for (const s of all) for (const e of s.ends) if (e.kind === "cap") tagOf(e.hand === "L" ? "capL" : "capR").qty++;
  tags.sort((x, y) => x.kind.localeCompare(y.kind));
  for (const s of all) for (const e of s.ends) {
    if (e.kind !== "corner" || seen.has(e.cornerId!)) continue;
    seen.add(e.cornerId!);
    const t = tagOf("miter", e.cornerKind, e.angleDeg);
    t.qty++;
    if (e.method === "cut") t.cut++;
    if (e.outward) t.outward++; else t.inward++;
  }
  // A and B are always the end caps (left, right), even when the drawing has one hand only
  let letter = 67;
  for (const t of tags) t.tag = t.kind === "capL" ? "A" : t.kind === "capR" ? "B" : String.fromCharCode(letter++);
  for (const s of all) for (const e of s.ends) e.tag = e.kind === "cap" ? (e.hand === "L" ? "A" : "B") : e.kind === "corner" ? tagOf("miter", e.cornerKind, e.angleDeg).tag : undefined;

  // a downspout whose gutter is gone is not on the sheet; the rest are numbered in a row
  const ds: ShopDs[] = d.downspouts.filter((x) => all.some((s) => s.id === x.runId)).map((x, i): ShopDs => {
    const seg = all.find((s) => s.id === x.runId)!;
    const along = Math.min(seg.lengthIn, Math.max(0, seg.forward ? x.atIn : seg.lengthIn - x.atIn));
    const t = along / (seg.lengthIn || 1);
    const drop = x.heightIn ?? (storyFt ? seg.story * storyFt * 12 : undefined);
    return {
      n: i + 1, tag: `DS${i + 1}`, seg, at: [seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t],
      fromEndIn: Math.min(along, seg.lengthIn - along), size: String(x.size), color: x.color, material: x.material,
      elbows: x.elbows?.filter((e) => e.qty > 0), offsets: x.offsets?.filter((o) => o.qty > 0), dropIn: drop,
    };
  });
  return { chains, ds, tags, stories: [...new Set(chains.map((c) => c.story))].sort((a, b) => a - b) };
}

/** the corner's cut on each of its two gutters: half the turn — 90° → 45°, 126° → 27° */
export const miterCutDeg = (angleDeg: number) => Math.round((180 - angleDeg) * 5) / 10;

/** feet and inches as a drawing writes them (ANSI, architectural): 44'-6", 28'-10 1/2", 0'-9" */
export function fi(inches: number): string {
  const e = Math.max(0, Math.round(inches * 16));
  const whole = Math.floor(e / 16), k = e % 16;
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const frac = k ? ` ${k / g(k, 16)}/${16 / g(k, 16)}` : "";
  return `${Math.floor(whole / 12)}'-${whole % 12}${frac}"`;
}

