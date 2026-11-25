/**
 * «Просмотр замера» (founder 09.11, #698; spec 33 П20.25 п.3): what the drawing is made of, as a list to read before an
 * estimate or a cut — the gutters (№, along the wall / along the face, storey, profile and size, colour), the corners (the
 * cut of each of their gutters), the downspouts (elbows, offsets) and the parts with their quantities. Pure: the drawing
 * and the engine's parts in, rows out (the screen words them). Numbers are the drawing's own: gutter №n is the n-th
 * drawn (as the corner sheet says «Желоб n»), DS n the n-th downspout (as the canvas label).
 */
import { bendOf, dec, defaultOffsetsFor, downspoutLengthIn, fieldBendOf, type Dec, type GutterSection, resolveGutterRules, type GutterRulesOverride, type MeasurementInput, type PartQty } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";
import { cornerCut, findCorners, toMeasurement, type Drawing, type FoundCorner } from "../geometry";
import { manyStories, storyOf, type Story } from "../canvas/scene";
import { elbowCounts } from "../canvas/attrs";
import { fmtLen, type LenFormat } from "../canvas/format";
import { partQty, partView } from "../prices";

export interface SpecRun {
  n: number;
  id: string;
  /** along the wall (the back), inches to 1/16″ */
  backIn: number;
  /** along the face — longer at an outside corner, shorter at an inside one */
  frontIn: number;
  story: Story;
  profile: string;
  size: string;
  color?: string;
}
export interface SpecCorner {
  id: string;
  kind: FoundCorner["kind"];
  angleDeg: number;
  runs: { n: number; backIn: number; frontIn: number }[];
}
export interface SpecDs {
  n: number;
  id: string;
  story: Story;
  shape: string;
  size: string;
  /** elbows by style, the engine's way: unset — its default by kind (#1747, #1776, «Расход v2»: a plain rectangular one bent on site
   *  3 × A, a corrugated one 3 × A «AAA», a round one 1 × 75°) */
  elbows: { style: string; qty: number }[];
  /** offsets by length, inches (unset — the engine's default: a round one 1 × 2″) */
  offsets: { lengthIn: number; qty: number }[];
  /** the elbows (and the offsets) are bent on site (`bendOf`): the view says «гиб по месту», not «Elbows» */
  bent?: true;
  /** plain / corrugated; unset — plain */
  dsStyle?: string;
  material?: string;
  color?: string;
  /** what is at its foot: extension, splash block… ("none" — nothing) */
  bottom: string;
  /** the downspout's length the engine counts for it (#1766: the fact, not only the drawing's numbers), inches */
  lengthIn: number;
}
export interface MeasureSpec {
  runs: SpecRun[];
  corners: SpecCorner[];
  ds: SpecDs[];
  /** the materials to bring (labour is the estimate's business), as the engine counted them */
  parts: PartQty[];
  /** more than one storey: only then «эт N» is written (#1275, #1766) */
  manyStories: boolean;
}

/**
 * `rules` — the company's rules (a downspout's length: its storey × the storey height + the extension); `m` — the
 * measurement the parts were counted from (the screen has it; else it is made here the same way).
 */
export function measureSpec(d: Drawing, parts: readonly PartQty[], opts: { rules?: GutterRulesOverride; m?: MeasurementInput } = {}): MeasureSpec {
  const all = findCorners(d);
  const rules = resolveGutterRules(opts.rules);
  const mm = opts.m ?? (d.runs.length ? toMeasurement(d) : undefined);
  const mRun = new Map((mm?.runs ?? []).map((r) => [r.id, r]));
  const mDs = new Map((mm?.downspouts ?? []).map((x) => [x.id, x]));
  const nOf = new Map(d.runs.map((r, i) => [r.id, i + 1]));
  const runs = d.runs.map((r, i): SpecRun => {
    // a gutter's cut with every corner it has (both ends count) — the same numbers the corner sheet shows
    const cut = cornerCut(d, { runs: [{ id: r.id, end: 0 }, { id: r.id, end: 0 }] }, all).runs[0]!;
    return {
      n: i + 1,
      id: r.id,
      backIn: cut.backIn,
      frontIn: cut.frontIn,
      story: storyOf(r.attrs.story),
      profile: String(r.attrs.profile),
      size: String(r.attrs.size),
      ...(r.attrs.color ? { color: String(r.attrs.color) } : {}),
    };
  });
  const corners = all.map((c): SpecCorner => {
    const cut = cornerCut(d, c, all);
    return { id: c.id, kind: c.kind, angleDeg: Math.round(cut.angleDeg), runs: cut.runs.map((x) => ({ n: nOf.get(x.id) ?? 0, backIn: x.backIn, frontIn: x.frontIn })) };
  });
  const ds = d.downspouts.map((s, i): SpecDs => {
    const story = storyOf(d.runs.find((r) => r.id === s.runId)?.attrs.story);
    const md = mDs.get(s.id);
    return {
      n: i + 1,
      id: s.id,
      story,
      shape: String(s.shape),
      size: String(s.size),
      elbows: Object.entries(elbowCounts(s)).filter(([, q]) => q > 0).map(([style, qty]) => ({ style, qty })),
      offsets: (s.offsets ?? defaultOffsetsFor({ shape: s.shape === "round" ? "round" : "rect" }, rules)).filter((o) => Number.isFinite(o.qty) && o.qty > 0).map((o) => ({ lengthIn: o.lengthIn, qty: o.qty })),
      ...(bendOf(s) === "field" ? { bent: true as const } : {}),
      ...(s.dsStyle ? { dsStyle: String(s.dsStyle) } : {}),
      ...(s.material ? { material: String(s.material) } : {}),
      ...(s.color ? { color: String(s.color) } : {}),
      bottom: String(s.bottom?.kind ?? "none"),
      // the downspout the engine counts: the wall's length and what bending on site eats (§2.2), before the estimate rounds it
      lengthIn: (md ? downspoutLengthIn(md, mRun.get(md.runId)?.story ?? story, rules) : story * rules.storyHeightIn + rules.dsExtensionIn) + fieldBendOf(s, rules).addedIn,
    };
  });
  return { runs, corners, ds, parts: parts.filter((p) => p.kind === "material" && Number(p.qty) > 0), manyStories: manyStories(d.runs) };
}

/* ---------- the lists as a person reads them (#1766, DS §8.14) ---------- */

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/** «D1», «D1–D3», «D1, D4» — the numbers of the downspouts folded into one row */
export function dsNumbers(t: Tr, ns: readonly number[]): string {
  const name = (n: number) => t("mod.gutters.ds", { n });
  const run = ns.length > 1 && ns.every((n, i) => i === 0 || n === ns[i - 1]! + 1);
  return run ? `${name(ns[0]!)}–${name(ns[ns.length - 1]!)}` : ns.map(name).join(", ");
}

/** one kind of downspout on the drawing (#1800, founder 16.11: «водостоки — общее количество»): the total length, how many,
 *  the elbows by style and the offsets by length summed over them, what is at their feet */
export interface DsKindTotal {
  key: string;
  ns: number[];
  shape: string;
  size: string;
  dsStyle?: string;
  material?: string;
  color?: string;
  lengthIn: number;
  elbows: { style: string; qty: number }[];
  offsets: { lengthIn: number; qty: number }[];
  /** bent on site: a kind of its own (the same pipe with ready elbows is another row) */
  bent?: true;
  bottoms: { kind: string; qty: number }[];
}
export function dsTotals(ds: readonly SpecDs[]): DsKindTotal[] {
  const out = new Map<string, DsKindTotal>();
  const add = <T extends { qty: number }>(list: T[], same: (x: T) => boolean, x: T) => {
    const had = list.find(same);
    if (had) had.qty += x.qty;
    else list.push({ ...x });
  };
  for (const d of ds) {
    const key = [d.shape, d.size, d.dsStyle ?? "", d.material ?? "", d.color ?? "", d.bent ? "bent" : ""].join("|");
    const g = out.get(key) ?? { key, ns: [], shape: d.shape, size: d.size, ...(d.dsStyle ? { dsStyle: d.dsStyle } : {}), ...(d.bent ? { bent: true as const } : {}), ...(d.material ? { material: d.material } : {}), ...(d.color ? { color: d.color } : {}), lengthIn: 0, elbows: [], offsets: [], bottoms: [] };
    out.set(key, g);
    g.ns.push(d.n);
    g.lengthIn += d.lengthIn;
    for (const e of d.elbows) add(g.elbows, (x) => x.style === e.style, { style: e.style, qty: e.qty });
    for (const o of d.offsets) add(g.offsets, (x) => x.lengthIn === o.lengthIn, { lengthIn: o.lengthIn, qty: o.qty });
    if (d.bottom !== "none") add(g.bottoms, (x) => x.kind === d.bottom, { kind: d.bottom, qty: 1 });
  }
  return [...out.values()];
}


export interface PartRow {
  key: string;
  title: string;
  props: string[];
  qty: string;
  /** the supplier's order only, not on the client's estimate: «для заказа» with its «?» */
  buy?: boolean;
}
export interface PartGroup {
  key: "gutter" | "ds" | "fix";
  title: string;
  /** what the group is and how it is counted: the «?» beside its title */
  help: string;
  /** a property every row of the group has, said once under its title — none since #1800 (each row says all) */
  common: string[];
  rows: PartRow[];
}

/** the engine's sections → the three groups a person reads (the gutter, the downspout, the fasteners and supplies) */
export const GROUP_OF: Record<GutterSection, PartGroup["key"] | null> = {
  gutter: "gutter", corners_caps: "gutter", guards: "gutter",
  downspouts: "ds", adapters: "ds", ds_bottom: "ds",
  fasteners: "fix", consumables: "fix",
  // labour is the estimate's, never a part to bring (measureSpec keeps materials only)
  labor: null,
};

/**
 * «Состав замера» (#1766, #1800, DS §8.14): the parts in three groups; each row a name in one line (the supplier's), the
 * properties in the human order, the quantity on its own. A part that is NOT in the client's estimate — the supplier's
 * order only (`use: "purchase"`: the coil, rivets, screws, paint) — says «для заказа». The downspout's sticks to buy are
 * not a second «Downspout» row: they are its «2 × 10′ lengths». The same rows are one (their quantities add up, in the
 * engine's decimals). Each row says all its properties (founder 16.11: the caption of a group repeated them, unclear).
 */
export function partGroups(t: Tr, parts: readonly PartQty[], fmt: LenFormat = "ftin"): PartGroup[] {
  // the sticks of each downspout kind: «2 × 10′ lengths» on that kind's row (key — its properties without the stick)
  const stickKey = (a: Record<string, string>) => JSON.stringify(Object.entries(a).filter(([k]) => k !== "stickIn" && k !== "part").sort());
  const sticks = new Map<string, { n: Dec; stickIn: string }>();
  for (const p of parts) if (p.attrs.stickIn && p.section === "downspouts") {
    const key = stickKey(p.attrs);
    const had = sticks.get(key);
    sticks.set(key, { n: had ? had.n.add(dec(p.qty)) : dec(p.qty), stickIn: p.attrs.stickIn });
  }
  const pipes = new Set(parts.filter((p) => !p.attrs.stickIn && p.section === "downspouts" && !p.attrs.part).map((p) => stickKey(p.attrs)));
  const groups = new Map<PartGroup["key"], { rows: Map<string, PartRow & { n: Dec; unit: PartQty["unit"] }> }>();
  for (const p of parts) {
    // a stick whose downspout row is here: said on that row
    if (p.attrs.stickIn && pipes.has(stickKey(p.attrs))) continue;
    const g = GROUP_OF[p.section] ?? "fix";
    const v = partView(t, p, fmt, { side: true });
    const st = !p.attrs.stickIn && p.section === "downspouts" && !p.attrs.part ? sticks.get(stickKey(p.attrs)) : undefined;
    const props = [
      ...v.props,
      ...(st ? [t("mod.gutters.view.sticks", { n: st.n.toString(), len: fmtLen(Number(st.stickIn), fmt) })] : []),
      ...(p.use === "purchase" ? [t("mod.gutters.view.buy")] : []),
    ];
    const key = [v.title, ...props, p.unit].join("|");
    const bucket = groups.get(g) ?? { rows: new Map() };
    groups.set(g, bucket);
    const had = bucket.rows.get(key);
    // the quantities add up in the engine's decimals (no float sum)
    const n = dec(p.qty);
    if (had) had.n = had.n.add(n);
    else bucket.rows.set(key, { key: p.key, title: v.title, props, qty: "", n, unit: p.unit, buy: p.use === "purchase" });
  }
  const order: PartGroup["key"][] = ["gutter", "ds", "fix"];
  return order
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      title: t(`mod.gutters.view.grp.${k}` as DictKey),
      help: t(`mod.gutters.view.grpHelp.${k}` as DictKey),
      common: [],
      rows: [...groups.get(k)!.rows.values()].map(({ n, unit, ...r }) => ({ ...r, qty: partQty(t, { qty: n.toString(), unit }, fmt) })),
    }));
}
