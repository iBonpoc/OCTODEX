/**
 * What a run and a downspout are made of: the choices of the attribute panel and the rules that keep them valid
 * (docs/specs/33-gutters-screens.md П21.8 M5c; engine input — docs/specs/33-gutters-parts.md П18.4, kits П18.6–П18.7).
 * Pure. The lists here are everything the module knows; the company's settings (M7b, ../settings.ts — `Choices`) narrow
 * them to what it installs, give its palette and its defaults. An element's own value is never thrown away because the
 * company stopped offering it (spec 33 П22.2 №7): validity is the module's lists, replacements come from the company's.
 * Changing a choice another one depends on (profile → size and hanger kit, material → gauge and finish, shape →
 * size and elbows, mount → the default kit, wall → the default wall kit) fixes the dependent fields in the same step.
 */
import { DEFAULT_HANGER_KITS, DEFAULT_WALL_KIT_BY_WALL, DEFAULT_WALL_KITS, defaultHangerKit, GUTTER_MOUNTS, type DsBottomKind, type GutterMount, type GutterProfile } from "@octo/estimating-engine";
import type { DrawnDownspout, DrawnRun } from "../geometry";
import type { Choices } from "../settings";
import { DENOM, MM_OF, MM_PER_IN, type LenUnit } from "./format";

export type RunAttrs = DrawnRun["attrs"];
export type DsAttrs = Omit<DrawnDownspout, "id" | "runId" | "atIn">;

export const PROFILES: readonly GutterProfile[] = ["k", "half_round", "fascia", "box", "euro"];
/** nominal sizes, inches, by profile (until M7) */
export const SIZES_BY_PROFILE: Record<GutterProfile, readonly string[]> = {
  k: ["5", "6", "7"],
  half_round: ["5", "6"],
  fascia: ["6", "7"],
  box: ["6", "7", "8"],
  euro: ["5", "6"],
};
export const MATERIALS = ["aluminum", "steel", "galvalume", "copper", "zinc"] as const;
/** thickness by material; the first one is the default (until M7: by material, profile and size) */
export const GAUGES_BY_MATERIAL: Record<string, readonly string[]> = {
  aluminum: [".027", ".032"],
  steel: ["26ga", "24ga"],
  galvalume: ["26ga", "24ga"],
  copper: ["16oz", "20oz"],
  zinc: [],
};
/** bare metal only: no paint, no color (the engine's stock key has no color then) */
export const MILL_ONLY = new Set(["copper", "zinc"]);
/** colour names, said as a word — never a swatch (rule 2): the module's palette until the company sets its own (M7b) */
export const COLORS = ["white", "almond", "linen", "clay", "brown", "musket", "bronze", "black", "gray"] as const;
export const MOUNTS: readonly GutterMount[] = GUTTER_MOUNTS;

/** the half-round kits (shanks, Rival, Regal, face clip) hang half round and euro; the rest K, fascia and box */
const roundFamily = (p: string) => p === "half_round" || p === "euro";
export const hangerKitsFor = (profile: string, ch?: Choices): string[] => {
  const all = Object.keys(DEFAULT_HANGER_KITS).filter((id) => id.startsWith("hr_") === roundFamily(profile));
  const mine = ch ? all.filter((id) => ch.offer.hangers.includes(id)) : all;
  return mine.length ? mine : all;
};

export const DS_SHAPES = ["rect", "round"] as const;
export const DS_SIZES: Record<(typeof DS_SHAPES)[number], readonly string[]> = { rect: ["2x3", "3x4", "4x5"], round: ["3", "4"] };
export const DS_STYLES = ["plain", "corrugated"] as const;
/**
 * The kind of a downspout as the contractor says it (#929): the shape and the style in one choice — four kinds, each with
 * its own icon in «Наряд». The data stay `shape` + `dsStyle` (the engine keys, the price lines); a kind is only how the
 * pair is picked and read. No style stored is plain.
 */
export const DS_KINDS = [
  { key: "rectPlain", shape: "rect", style: "plain", icon: "dsRect" },
  { key: "rectRibbed", shape: "rect", style: "corrugated", icon: "dsRectRibbed" },
  { key: "roundPlain", shape: "round", style: "plain", icon: "dsRound" },
  { key: "roundRibbed", shape: "round", style: "corrugated", icon: "dsRoundRibbed" },
] as const;
export type DsKind = (typeof DS_KINDS)[number];
export const dsKindOf = (shape: string, style?: string): DsKind => DS_KINDS.find((x) => x.shape === shape && x.style === (style ?? "plain")) ?? DS_KINDS[0];
/** elbow styles by shape; rect A/B, round by angle */
export const ELBOW_STYLES: Record<(typeof DS_SHAPES)[number], readonly string[]> = { rect: ["A", "B"], round: ["45", "60", "75", "90"] };
/** without `elbows` the engine counts 3 × A (П18.10) */
export const DEFAULT_ELBOWS = 3;
export const DS_BOTTOMS: readonly DsBottomKind[] = ["extension", "splash_block", "flex", "drain", "lower_roof", "none"];
export const WALLS = ["wood", "stucco", "brick"] as const;
export type Wall = (typeof WALLS)[number];

/** wall kits a downspout of this shape can use on this wall (П18.7): the default first, then the others that fit */
export const WALL_KITS_BY_WALL: Record<(typeof DS_SHAPES)[number], Record<Wall, readonly string[]>> = {
  rect: {
    wood: ["ds_strap", "sickle_hook", "u_bracket", "conductor_bracket", "coil_strap"],
    stucco: ["ds_strap_masonry", "u_bracket_masonry"],
    brick: ["brick_hook", "brick_hook_hd"],
  },
  round: {
    wood: ["hinged_hook", "pipe_cleat", "conductor_band"],
    stucco: ["pipe_cleat_masonry", "u_bracket_masonry"],
    brick: ["conductor_band_masonry", "brick_hook_hd"],
  },
};
export const wallKitsFor = (shape: string, wall: Wall, ch?: Choices): string[] => {
  const all = (WALL_KITS_BY_WALL[shape === "round" ? "round" : "rect"]?.[wall] ?? []).filter((id) => id in DEFAULT_WALL_KITS);
  const mine = ch ? all.filter((id) => ch.offer.wallKits.includes(id)) : all;
  // the company's kit for this wall first (its default), then the others it installs
  const def = ch?.wallKitByWall[shape === "round" ? "round" : "rect"]?.[wall];
  const list = mine.length ? mine : all;
  return def && list.includes(def) ? [def, ...list.filter((x) => x !== def)] : list;
};

/**
 * The engine's `wall` holds a wall type («wood») or a kit id («sickle_hook»). Which wall it is, and which kit:
 * a type means its default kit; a kit means the first wall whose list has it. Unknown or none — wood.
 */
export function wallOf(shape: string, wall: string | undefined): { wall: Wall; kit: string } {
  const sh = shape === "round" ? "round" : "rect";
  if (wall && (WALLS as readonly string[]).includes(wall)) {
    const w = wall as Wall;
    return { wall: w, kit: DEFAULT_WALL_KIT_BY_WALL[sh]?.[w] ?? wallKitsFor(sh, w)[0] ?? "" };
  }
  if (wall) for (const w of WALLS) if (wallKitsFor(sh, w).includes(wall)) return { wall: w, kit: wall };
  return wallOf(sh, "wood");
}

/**
 * The `wall` to store for a wall type: the type itself while the company's kit is the module's default for it (the
 * engine finds that kit), else the company's kit id — what the panel shows is what the engine counts (M7b, no rules yet).
 */
export function wallValue(shape: string, wall: Wall, ch?: Choices): string {
  const sh = shape === "round" ? "round" : "rect";
  const kit = ch?.wallKitByWall[sh]?.[wall];
  return kit && kit !== DEFAULT_WALL_KIT_BY_WALL[sh]?.[wall] ? kit : wall;
}

/** a list to offer on the panel: what the company installs, plus the element's own value when it is not in it */
export const withCurrent = <K extends string>(offered: readonly K[], cur: K | undefined): K[] => (cur === undefined || offered.includes(cur) ? [...offered] : [...offered, cur]);

const pick = <K extends string>(list: readonly K[], v: unknown): K | undefined => (list as readonly unknown[]).includes(v) ? (v as K) : list[0];

/** paint follows the material: copper and zinc are bare (no color); painted metal keeps a color (the company's default) */
function fixFinish<T extends { material: string; finish?: "mill" | "painted"; color?: string }>(a: T, color: string): T {
  const out = { ...a };
  if (MILL_ONLY.has(a.material)) {
    out.finish = "mill";
    delete out.color;
  } else if (out.finish === "mill") delete out.color;
  // painted (or unset: a colour means painted — the engine) keeps a colour
  else if (!out.color) out.color = color;
  return out;
}

/**
 * A run's attributes after one change: the change itself, then whatever depends on it made valid again.
 * The same object back when nothing changes (no empty «назад» step).
 */
export function changeRun(a: RunAttrs, patch: Partial<RunAttrs>, ch?: Choices): RunAttrs {
  let n: RunAttrs = { ...a, ...patch };
  const profile = pick(PROFILES, n.profile)!;
  n.profile = profile;
  if (!SIZES_BY_PROFILE[profile].includes(n.size)) n.size = firstOf(ch?.offer.sizes[profile], SIZES_BY_PROFILE[profile], ch?.run.profile === profile ? ch.run.size : undefined);
  const gauges = GAUGES_BY_MATERIAL[n.material];
  if (gauges) {
    if (!gauges.length) delete n.gauge;
    else if (!n.gauge || !gauges.includes(n.gauge)) n.gauge = firstOf(ch?.offer.gauges[n.material], gauges, ch?.run.material === n.material ? ch.run.gauge : undefined);
  }
  n = fixFinish(n, defaultColor(ch));
  // a new roof edge (or a profile whose kits are another family) puts the company's default kit back
  // a new profile takes a kit the company installs for it (review #372 №6); otherwise only a kit of another family is fixed
  const kits = patch.profile !== undefined && patch.profile !== a.profile ? hangerKitsFor(profile, ch) : hangerKitsFor(profile);
  if ((patch.mount !== undefined && patch.mount !== a.mount) || !kits.includes(n.hanger)) {
    const mount = (n.mount ?? "fascia") as GutterMount;
    n.hanger = ch ? ch.hangerByMount[profile][mount] : defaultHangerKit(profile, mount);
  }
  return same(a, n) ? a : n;
}

/** a replacement value: the company's default if it fits, else the first the company installs, else the module's first */
function firstOf(offered: readonly string[] | undefined, known: readonly string[], def?: string): string {
  const ok = (offered ?? []).filter((x) => known.includes(x));
  if (def && ok.includes(def)) return def;
  return ok[0] ?? known[0]!;
}
const defaultColor = (ch?: Choices) => ch?.run.color ?? ch?.palette[0] ?? COLORS[0];

/** a downspout's attributes after one change (see changeRun) */
export function changeDs(a: DsAttrs, patch: Partial<DsAttrs>, ch?: Choices): DsAttrs {
  let n: DsAttrs = { ...a, ...patch };
  const shape = pick(DS_SHAPES, n.shape)!;
  n.shape = shape;
  if (!DS_SIZES[shape].includes(n.size)) n.size = firstOf(ch?.offer.dsSizes[shape], DS_SIZES[shape], ch?.ds.shape === shape ? ch.ds.size : undefined);
  const gauges = GAUGES_BY_MATERIAL[n.material];
  if (gauges && n.gauge && !gauges.includes(n.gauge)) n.gauge = firstOf(ch?.offer.gauges[n.material], gauges);
  if (gauges && !gauges.length) delete n.gauge;
  n = fixFinish(n, ch?.ds.color ?? defaultColor(ch));
  // a wall type picked on the panel, or a new shape over a wall type: the company's kit for it (wallValue), so the engine
  // counts what the panel shows (review #372 №6)
  const shapeChanged = patch.shape !== undefined && patch.shape !== a.shape;
  if (ch && n.wall !== undefined && (WALLS as readonly string[]).includes(n.wall) && (patch.wall !== undefined || shapeChanged)) n.wall = wallValue(shape, n.wall as Wall, ch);
  // no wall stored is wood: a new shape takes the company's wood kit when it is not the module's
  else if (ch && shapeChanged && n.wall === undefined && wallValue(shape, "wood", ch) !== "wood") n.wall = wallValue(shape, "wood", ch);
  // a company kit of the old shape standing for a wall: the same wall, this shape's company kit
  else if (ch && shapeChanged && n.wall !== undefined && !(WALLS as readonly string[]).includes(n.wall) && !WALLS.some((w) => wallKitsFor(shape, w).includes(n.wall!))) {
    n.wall = wallValue(shape, wallOf(a.shape, a.wall).wall, ch);
  }
  // elbows of the other shape (A on a round one) become this shape's first style, the count stays
  if (n.elbows?.some((e) => !ELBOW_STYLES[shape].includes(e.style))) {
    const qty = n.elbows.reduce((s, e) => s + e.qty, 0);
    n.elbows = [{ style: ELBOW_STYLES[shape][0]!, qty }];
  }
  // a reducer goes to a smaller size of the same shape: another shape's size, its own or a larger one — gone
  if (n.reducers?.some((r) => !smallerSizes(shape, n.size).includes(r.to))) delete n.reducers;
  // a wall kit of the other shape: the same wall, this shape's default kit
  if (n.wall && !(WALLS as readonly string[]).includes(n.wall) && !WALLS.some((w) => wallKitsFor(shape, w).includes(n.wall!))) {
    const was = wallOf(a.shape, a.wall).wall;
    n.wall = ch ? wallValue(shape, was, ch) : was;
  }
  return same(a, n) ? a : n;
}

/** elbows as the panel shows them: one style and a count (the engine's default 3 × A / 3 × 45° when unset) */
export function elbowsOf(a: Pick<DsAttrs, "shape" | "elbows">): { style: string; qty: number } {
  const shape = a.shape === "round" ? "round" : "rect";
  const e = a.elbows?.[0];
  return e ? { style: e.style, qty: a.elbows!.reduce((s, x) => s + x.qty, 0) } : { style: ELBOW_STYLES[shape][0]!, qty: DEFAULT_ELBOWS };
}

/** elbows by style (founder 08.11: «A 2 шт, B 1 шт»): every style of the shape, 0 where none; unset — the engine's default */
export function elbowCounts(a: Pick<DsAttrs, "shape" | "elbows">): Record<string, number> {
  const shape = a.shape === "round" ? "round" : "rect";
  const out: Record<string, number> = Object.fromEntries(ELBOW_STYLES[shape].map((s) => [s, 0]));
  if (!a.elbows) out[ELBOW_STYLES[shape][0]!] = DEFAULT_ELBOWS;
  else for (const e of a.elbows) if (e.style in out) out[e.style] = (out[e.style] ?? 0) + e.qty;
  return out;
}

/** one style's count changed: the list the engine reads (styles with 0 left out; all 0 — one style at 0, not the default) */
export function withElbowQty(a: Pick<DsAttrs, "shape" | "elbows">, style: string, qty: number): NonNullable<DsAttrs["elbows"]> {
  const n = { ...elbowCounts(a), [style]: Math.max(0, Math.round(qty)) };
  const list = Object.entries(n).filter(([, q]) => q > 0).map(([s, q]) => ({ style: s, qty: q }));
  return list.length ? list : [{ style, qty: 0 }];
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).split("").map((d) => SUP[Number(d)] ?? d).join("");

/**
 * The fittings of a downspout in one short word over its mark (founder 08.11): rect elbows by letter, one per piece
 * (A 2 + B 1 → «AAB»); round ones by angle with the count small on top («45°²»); an offset — «O» and its inches small
 * on top («O⁴»), one per piece. Nothing — "".
 */
export function dsCode(a: Pick<DsAttrs, "shape" | "elbows" | "offsets">): string {
  const counts = elbowCounts(a);
  const round = a.shape === "round";
  let s = "";
  for (const [style, q] of Object.entries(counts)) {
    if (q <= 0) continue;
    s += round ? `${style}°${q > 1 ? sup(q) : ""}` : style.repeat(q);
  }
  for (const o of a.offsets ?? []) if (o.qty > 0) s += `O${sup(o.lengthIn)}`.repeat(o.qty);
  return s;
}

const same = (a: object, b: object) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const sorted = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)));

/** feet, inches (a decimal one: 5.0625) and eighths typed on the tape → inches (to 1/16″); nothing sensible (empty, 0, negative, too long) → null */
export const MAX_RUN_IN = 12 * 500;
export function tapeIn(ft: string, inch: string, eighths = 0): number | null {
  const f = ft.trim() === "" ? 0 : Number(ft);
  const i = inch.trim() === "" ? 0 : Number(inch);
  if (!Number.isFinite(f) || !Number.isFinite(i) || f < 0 || i < 0 || i >= 12 || !Number.isInteger(f)) return null;
  // 1/16″ (founder 11.11; 08.11: re-measured 8′ 9¼″)
  const n = Math.round((f * 12 + i + Math.max(0, Math.min(7, Math.round(eighths))) / 8) * DENOM) / DENOM;
  return n > 0 && n <= MAX_RUN_IN ? n : null;
}

/**
 * one number typed in inches, metres, centimetres or millimetres → inches to 1/16″; nothing sensible → null (the same
 * limits as the tape). «,» is a decimal point too.
 */
export function oneIn(v: string, unit: LenUnit): number | null {
  const x = Number(v.replace(",", "."));
  if (!Number.isFinite(x) || x <= 0) return null;
  const r = Math.round((unit === "in" || unit === "ftin" ? x : (x * MM_OF[unit]) / MM_PER_IN) * DENOM) / DENOM;
  return r > 0 && r <= MAX_RUN_IN ? r : null;
}

/**
 * A length in inches written into the fields of `unit` (#922): feet + inches + eighths for ftin, the inches alone, or
 * a metric number (millimetres whole, as the label shows it). Switching the unit shows the SAME length in the new one.
 */
export function unitFields(inches: number, unit: LenUnit): { ft: string; inc: string; e8: number; one: string } {
  // feet, inches and eighths; the odd sixteenth rides on the inches as a decimal (5.0625) — tapeIn reads it back exactly
  const e = Math.round(inches * DENOM);
  const ftin = { ft: String(Math.floor(e / 192)), inc: String(Math.floor((e % 192) / 16) + (e % 2) / DENOM), e8: Math.floor((e % 16) / 2) };
  if (unit === "ftin") return { ...ftin, one: String(inches) };
  if (unit === "in") return { ...ftin, one: String(inches) };
  return { ...ftin, one: String(Math.round(inches * MM_PER_IN) / MM_OF[unit]) };
}

/** the sizes a downspout can reduce to: the smaller ones of its shape (DS_SIZES lists go small to large) */
export function smallerSizes(shape: string, size: string): string[] {
  const list = DS_SIZES[shape === "round" ? "round" : "rect"];
  const i = list.indexOf(size);
  return i > 0 ? list.slice(0, i) : [];
}

/** offsets the panel offers (founder 09.11: 1″ to 5″); what the engine does not stock (rule stdOffsetsIn) it marks custom */
export const OFFSETS_IN = [1, 2, 3, 4, 5] as const;
export const DS_HEADS = ["none", "funnel", "conductor"] as const;
/** the panel's «Своя высота», feet: 0 = by the storey */
export const MAX_DS_HEIGHT_FT = 60;
