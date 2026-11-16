/**
 * «Просмотр замера» (founder 09.11, #698; spec 33 П20.25 п.3): what the drawing is made of, as a list to read before an
 * estimate or a cut — the gutters (№, along the wall / along the face, storey, profile and size, colour), the corners (the
 * cut of each of their gutters), the downspouts (elbows, offsets) and the parts with their quantities. Pure: the drawing
 * and the engine's parts in, rows out (the screen words them). Numbers are the drawing's own: gutter №n is the n-th
 * drawn (as the corner sheet says «Желоб n»), DS n the n-th downspout (as the canvas label).
 */
import { dec, downspoutLengthIn, type Dec, resolveGutterRules, type GutterRulesOverride, type MeasurementInput, type PartQty } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";
import { cornerCut, findCorners, toMeasurement, type Drawing, type FoundCorner } from "../geometry";
import { manyStories, storyOf, type Story } from "../canvas/scene";
import { elbowCounts } from "../canvas/attrs";
import type { LenFormat } from "../canvas/format";
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
  /** elbows by style, the engine's way: unset — its default (3 of the shape's first style, «AAA» on the canvas; #1747) */
  elbows: { style: string; qty: number }[];
  /** offsets by length, inches */
  offsets: { lengthIn: number; qty: number }[];
  /** plain / corrugated; unset — plain */
  dsStyle?: string;
  material?: string;
  color?: string;
  /** what is at its foot: extension, splash block… ("none" — nothing) */
  bottom: string;
  /** the pipe's length the engine counts for it (#1766: the fact, not only the drawing's numbers), inches */
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
      offsets: (s.offsets ?? []).filter((o) => Number.isFinite(o.qty) && o.qty > 0).map((o) => ({ lengthIn: o.lengthIn, qty: o.qty })),
      ...(s.dsStyle ? { dsStyle: String(s.dsStyle) } : {}),
      ...(s.material ? { material: String(s.material) } : {}),
      ...(s.color ? { color: String(s.color) } : {}),
      bottom: String(s.bottom?.kind ?? "none"),
      lengthIn: md ? downspoutLengthIn(md, mRun.get(md.runId)?.story ?? story, rules) : story * rules.storyHeightIn + rules.dsExtensionIn,
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

/** downspouts that are the same in every fact (kind, size, colour, length, elbows, offsets, foot, storey) are one row */
export function foldDs(ds: readonly SpecDs[]): { ns: number[]; d: SpecDs }[] {
  const out = new Map<string, { ns: number[]; d: SpecDs }>();
  for (const d of ds) {
    const { n: _n, id: _id, ...facts } = d;
    const key = JSON.stringify(facts);
    const g = out.get(key);
    if (g) g.ns.push(d.n);
    else out.set(key, { ns: [d.n], d });
  }
  return [...out.values()];
}

export interface PartRow {
  key: string;
  title: string;
  props: string[];
  qty: string;
}
export interface PartGroup {
  key: "gutter" | "ds" | "fix";
  title: string;
  /** a property every row of the group has: said once, under the group's title */
  common: string[];
  rows: PartRow[];
}

/** the engine's sections → the three groups a person reads (the gutter, the downspout, the fasteners and supplies) */
const GROUP_OF: Record<string, PartGroup["key"]> = {
  gutter: "gutter", corners_caps: "gutter", guards: "gutter",
  downspouts: "ds", adapters: "ds", ds_bottom: "ds",
  fasteners: "fix", consumables: "fix",
};

/**
 * «Состав замера» (#1766, DS §8.14): the parts in three groups; each row a name in one line, the properties in the
 * human order, the quantity on its own; what is to buy says «купить»; the same rows are one (their quantities add up);
 * a property every row of a group has is said once, under the group's title (only when the group has 2+ rows).
 */
export function partGroups(t: Tr, parts: readonly PartQty[], fmt: LenFormat = "ftin"): PartGroup[] {
  const groups = new Map<PartGroup["key"], { rows: Map<string, PartRow & { n: Dec; unit: PartQty["unit"] }> }>();
  for (const p of parts) {
    const g = GROUP_OF[p.section] ?? "fix";
    const v = partView(t, p, fmt, { side: true });
    const props = p.use === "purchase" ? [...v.props, t("mod.gutters.view.buy")] : v.props;
    const key = [v.title, ...props, p.unit].join("|");
    const bucket = groups.get(g) ?? { rows: new Map() };
    groups.set(g, bucket);
    const had = bucket.rows.get(key);
    // the quantities add up in the engine's decimals (no float sum)
    const n = dec(p.qty);
    if (had) had.n = had.n.add(n);
    else bucket.rows.set(key, { key: p.key, title: v.title, props, qty: "", n, unit: p.unit });
  }
  const order: PartGroup["key"][] = ["gutter", "ds", "fix"];
  return order
    .filter((k) => groups.has(k))
    .map((k) => {
      const rows = [...groups.get(k)!.rows.values()].map(({ n, unit, ...r }) => ({ ...r, qty: partQty(t, { qty: n.toString(), unit }, fmt) }));
      const common = rows.length > 1 ? rows[0]!.props.filter((x) => x !== t("mod.gutters.view.buy") && rows.every((r) => r.props.includes(x))) : [];
      return {
        key: k,
        title: t(`mod.gutters.view.grp.${k}` as DictKey),
        common,
        rows: rows.map((r) => ({ ...r, props: r.props.filter((x) => !common.includes(x)) })),
      };
    });
}
