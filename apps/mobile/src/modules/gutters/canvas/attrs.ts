/**
 * What a run and a downspout are made of: the choices of the attribute panel and the rules that keep them valid
 * (docs/specs/33-gutters-screens.md П21.8 M5c; engine input — docs/specs/33-gutters-parts.md П18.4, kits П18.6–П18.7).
 * Pure. The lists are the module's defaults until the company's settings exist (M7: sizes, gauges, the palette).
 * Changing a choice another one depends on (profile → size and hanger kit, material → gauge and finish, shape →
 * size and elbows, mount → the default kit, wall → the default wall kit) fixes the dependent fields in the same step.
 */
import { DEFAULT_HANGER_KITS, DEFAULT_WALL_KIT_BY_WALL, DEFAULT_WALL_KITS, defaultHangerKit, GUTTER_MOUNTS, type DsBottomKind, type GutterMount, type GutterProfile } from "@octo/estimating-engine";
import type { DrawnDownspout, DrawnRun } from "../geometry";

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
/** colour names, said as a word — never a swatch (rule 2). A placeholder until the company's palette (M7). */
export const COLORS = ["white", "almond", "linen", "clay", "brown", "musket", "bronze", "black", "gray"] as const;
export const MOUNTS: readonly GutterMount[] = GUTTER_MOUNTS;

/** the half-round kits (shanks, Rival, Regal, face clip) hang half round and euro; the rest K, fascia and box */
const roundFamily = (p: string) => p === "half_round" || p === "euro";
export const hangerKitsFor = (profile: string): string[] =>
  Object.keys(DEFAULT_HANGER_KITS).filter((id) => id.startsWith("hr_") === roundFamily(profile));

export const DS_SHAPES = ["rect", "round"] as const;
export const DS_SIZES: Record<(typeof DS_SHAPES)[number], readonly string[]> = { rect: ["2x3", "3x4", "4x5"], round: ["3", "4"] };
export const DS_STYLES = ["plain", "corrugated"] as const;
/** elbow styles by shape; rect A/B, round by angle */
export const ELBOW_STYLES: Record<(typeof DS_SHAPES)[number], readonly string[]> = { rect: ["A", "B"], round: ["45", "60", "75", "90"] };
/** without `elbows` the engine counts 3 × A (П18.10) */
export const DEFAULT_ELBOWS = 3;
export const DS_BOTTOMS: readonly DsBottomKind[] = ["extension", "splash_block", "flex", "drain", "lower_roof", "none"];
export const WALLS = ["wood", "stucco", "brick"] as const;
export type Wall = (typeof WALLS)[number];

/** wall kits a downspout of this shape can use on this wall (П18.7): the default first, then the others that fit */
const WALL_KITS: Record<string, Record<Wall, readonly string[]>> = {
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
export const wallKitsFor = (shape: string, wall: Wall): string[] =>
  (WALL_KITS[shape]?.[wall] ?? []).filter((id) => id in DEFAULT_WALL_KITS);

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

const pick = <K extends string>(list: readonly K[], v: unknown): K | undefined => (list as readonly unknown[]).includes(v) ? (v as K) : list[0];

/** paint follows the material: copper and zinc are bare (no color); painted metal keeps a color */
function fixFinish<T extends { material: string; finish?: "mill" | "painted"; color?: string }>(a: T): T {
  const out = { ...a };
  if (MILL_ONLY.has(a.material)) {
    out.finish = "mill";
    delete out.color;
  } else if (out.finish === "mill") delete out.color;
  // painted (or unset: a colour means painted — the engine) keeps a colour
  else if (!out.color) out.color = COLORS[0];
  return out;
}

/**
 * A run's attributes after one change: the change itself, then whatever depends on it made valid again.
 * The same object back when nothing changes (no empty «назад» step).
 */
export function changeRun(a: RunAttrs, patch: Partial<RunAttrs>): RunAttrs {
  let n: RunAttrs = { ...a, ...patch };
  const profile = pick(PROFILES, n.profile)!;
  n.profile = profile;
  if (!SIZES_BY_PROFILE[profile].includes(n.size)) n.size = SIZES_BY_PROFILE[profile][0]!;
  const gauges = GAUGES_BY_MATERIAL[n.material];
  if (gauges) {
    if (!gauges.length) delete n.gauge;
    else if (!n.gauge || !gauges.includes(n.gauge)) n.gauge = gauges[0];
  }
  n = fixFinish(n);
  // a new roof edge (or a profile whose kits are another family) puts the company's default kit back
  const kits = hangerKitsFor(profile);
  if ((patch.mount !== undefined && patch.mount !== a.mount) || !kits.includes(n.hanger)) n.hanger = defaultHangerKit(profile, (n.mount ?? "fascia") as GutterMount);
  return same(a, n) ? a : n;
}

/** a downspout's attributes after one change (see changeRun) */
export function changeDs(a: DsAttrs, patch: Partial<DsAttrs>): DsAttrs {
  let n: DsAttrs = { ...a, ...patch };
  const shape = pick(DS_SHAPES, n.shape)!;
  n.shape = shape;
  if (!DS_SIZES[shape].includes(n.size)) n.size = DS_SIZES[shape][0]!;
  const gauges = GAUGES_BY_MATERIAL[n.material];
  if (gauges && n.gauge && !gauges.includes(n.gauge)) n.gauge = gauges[0];
  if (gauges && !gauges.length) delete n.gauge;
  n = fixFinish(n);
  // elbows of the other shape (A on a round one) become this shape's first style, the count stays
  if (n.elbows?.some((e) => !ELBOW_STYLES[shape].includes(e.style))) {
    const qty = n.elbows.reduce((s, e) => s + e.qty, 0);
    n.elbows = [{ style: ELBOW_STYLES[shape][0]!, qty }];
  }
  // a wall kit of the other shape: the same wall, this shape's default kit
  if (n.wall && !(WALLS as readonly string[]).includes(n.wall) && !WALLS.some((w) => wallKitsFor(shape, w).includes(n.wall!))) {
    const was = wallOf(a.shape, a.wall).wall;
    n.wall = was;
  }
  return same(a, n) ? a : n;
}

/** elbows as the panel shows them: one style and a count (the engine's default 3 × A / 3 × 45° when unset) */
export function elbowsOf(a: Pick<DsAttrs, "shape" | "elbows">): { style: string; qty: number } {
  const shape = a.shape === "round" ? "round" : "rect";
  const e = a.elbows?.[0];
  return e ? { style: e.style, qty: a.elbows!.reduce((s, x) => s + x.qty, 0) } : { style: ELBOW_STYLES[shape][0]!, qty: DEFAULT_ELBOWS };
}

const same = (a: object, b: object) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const sorted = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)));

/** feet and inches typed on the tape → whole inches; nothing sensible (empty, 0, negative, too long) → null */
export const MAX_RUN_IN = 12 * 500;
export function tapeIn(ft: string, inch: string): number | null {
  const f = ft.trim() === "" ? 0 : Number(ft);
  const i = inch.trim() === "" ? 0 : Number(inch);
  if (!Number.isFinite(f) || !Number.isFinite(i) || f < 0 || i < 0 || i >= 12 || !Number.isInteger(f)) return null;
  const n = Math.round(f * 12 + i);
  return n > 0 && n <= MAX_RUN_IN ? n : null;
}
