import { D, dec, type Dec, type DecLike } from "./decimal.js";
import {
  DEFAULT_GUARD_KITS,
  DEFAULT_HANGER_BY_MOUNT,
  DEFAULT_HANGER_KITS,
  DEFAULT_JOINTS,
  DEFAULT_WALL_KITS,
  DEFAULT_WALL_KIT_BY_WALL,
  WOOD_SCREW,
  type GuardKit,
  type GutterMount,
  type HangerKit,
  type JointKind,
  type JointRule,
  type KitPart,
  type PartUse,
  type WallKit,
} from "./gutterKits.js";

/**
 * Gutters module: parts and labor from a measurement (docs/specs/33-gutters-module.md §3, П4;
 * parts, hangers and consumables — docs/specs/33-gutters-parts.md П18).
 * Input is the module's normalized measurement (no geometry: lengths are already in inches).
 * Output is quantities only, each with a stable `key` (the estimate line's sourceKey, spec §1 S5g),
 * the estimate section and what it is for: the client estimate, the supplier order, or both.
 * Prices come later from the company price list (core K1/K2); nothing here knows a price.
 * Lengths are integer inches in, decimal feet out (engine rule: no JS float math for lengths).
 */

export type GutterProfile = "k" | "half_round" | "euro" | "fascia" | "box";
/** "square" downspouts at suppliers are rectangular (2x2…5x6): rect with that size (spec П18.3 №6) */
export type DsShape = "rect" | "round";
/** id of a hanger kit (DEFAULT_HANGER_KITS or the company's own) */
export type HangerKind = string;
export type DsBottomKind = "none" | "extension" | "splash_block" | "flex" | "drain" | "lower_roof";

/** Estimate sections in the founder's order (spec §6, ТЗ «Смета»). */
export const GUTTER_SECTIONS = [
  "gutter",
  "corners_caps",
  "fasteners",
  "downspouts",
  "adapters",
  "guards",
  "ds_bottom",
  "consumables",
  "labor",
] as const;
export type GutterSection = (typeof GUTTER_SECTIONS)[number];

/** What a gutter is made of: these keys pick the price list item. Copper, zinc and galvanized have no color. */
export interface GutterStock {
  profile: GutterProfile;
  /** nominal size, inches: "5", "6", "7" */
  size: string;
  /** e.g. "aluminum", "steel", "galvalume", "copper", "zinc" (older drawings: "alu_032") */
  material: string;
  /** metal thickness: ".027", ".032", "26ga", "16oz" (company default by material and size) */
  gauge?: string;
  /** "painted" or "mill"; without it a color means painted */
  finish?: "mill" | "painted";
  color?: string;
}

export type RunEnd = { kind: "cap" } | { kind: "corner"; cornerId: string } | { kind: "join" };

export interface MeasuredRun extends GutterStock {
  id: string;
  /** 1, 2, 3, 4 (4 = 4 and up) */
  story: number;
  lengthIn: number;
  /** hanger kit id */
  hanger: HangerKind;
  /** roof edge the gutter hangs on: the module picks the default kit by it (defaultHangerKit) */
  mount?: GutterMount;
  /** own spacing on this run (snow, wind): wins over the kit */
  hangerSpacingIn?: number;
  /** a wedge under every hanger (pitched fascia) */
  wedges?: boolean;
  /** inches of the run covered by guards (0 = none; the founder: guards may cover only a part) */
  guardsIn?: number;
  /** guard kit id */
  guardType?: string;
  tearOff?: boolean;
  /** start and end of the run as drawn */
  ends: [RunEnd, RunEnd];
  /** which side of the run the house is, looking from start to end: decides left/right end caps */
  houseSide: "L" | "R";
}

export interface MeasuredCorner extends GutterStock {
  id: string;
  kind: "out" | "in" | "bay";
  /** cut: field-cut and folded; strip: field-cut with a strip miter; prefab: a ready box or bay miter */
  method: "cut" | "strip" | "prefab";
  /** splash guard on an inside corner */
  splashGuard?: boolean;
  story: number;
}

export interface MeasuredDownspout {
  id: string;
  runId: string;
  shape: DsShape;
  /** "2x3", "3x4" for rect; "3", "4" for round */
  size: string;
  /** plain or corrugated */
  dsStyle?: "plain" | "corrugated";
  material: string;
  gauge?: string;
  finish?: "mill" | "painted";
  color?: string;
  /** own height in inches; default = story × story height (the founder: 10 ft per story) */
  heightIn?: number;
  /** elbows: rect A/B and their angles; round by angle "45".."90"; qty may be 0 */
  elbows?: { style: string; qty: number }[];
  /** offsets, inches: standard ones by the rules (1, 2, 4); anything else is a custom part */
  offsets?: { lengthIn: number; qty: number }[];
  /**
   * The elbows are bent on site (`field`) or ready-made (`ready`) — one for the whole downspout (spec 33-gutters-consumption §2.1).
   * Unset: `bendOf` decides (a plain rectangular one with no elbows of its own is bent on site). Old phones do not know it.
   */
  elbowBend?: ElbowBend;
  /** size changes on the way down, e.g. 3x4 → 2x3 */
  reducers?: { to: string; qty: number }[];
  bottom: { kind: DsBottomKind; lengthIn?: number; color?: string; /** drain pipe size, inches */ pipe?: string };
  /** the wall the downspout is fastened to: picks the wall kit (or a wall kit id) */
  wall?: string;
  /** what sits on top: a funnel or a leader (conductor) head */
  head?: "funnel" | "conductor";
  /** older drawings: = head "funnel" */
  funnel?: boolean;
  outletScreen?: boolean;
  /** cutoff with a diverter (rain barrel) */
  diverter?: boolean;
  eaveBox?: "open" | "closed" | "sloped";
  /** half round: an end section with an outlet at this end of the run replaces the end cap and the outlet */
  endOutlet?: "start" | "end";
}

export type ElbowBend = "field" | "ready";

export interface MeasuredChain {
  id: string;
  runId: string;
  story: number;
  /** chain length; default = story height */
  lengthIn?: number;
}

/** A Y: two downspouts join into one (the second continues). */
export interface MeasuredWye {
  id: string;
  dsIds: [string, string];
}

export interface MeasurementInput {
  runs: MeasuredRun[];
  corners: MeasuredCorner[];
  downspouts: MeasuredDownspout[];
  chains?: MeasuredChain[];
  wyes?: MeasuredWye[];
}

/** Company rules (spec П4, П18.10). Every value is a company setting with this default. */
export interface GutterRules {
  storyHeightIn: number;
  /** a fixed waste, feet, for EVERY gutter stock (each coil or section line is bought with it); 0 — no waste (#1355, founder 14.11: «10 фит запас на каждый вид желоба»; a percent is not counted any more) */
  wasteFt: number;
  /** extra gutter an INSIDE (and, until the founder says otherwise, a bay) field-cut corner uses, inches (a prefab corner uses none) */
  cutCornerAllowanceIn: number;
  /** extra gutter an OUTSIDE field-cut corner uses, inches (#1355, founder 13.11: «для наружного 14 инчей, для внутреннего 6»); a saved company without it gets the default */
  cutCornerOutAllowanceIn: number;
  /** downspouts are bought in sticks */
  dsStickIn: number;
  /** offcuts of one downspout go into another of the same kind (first fit decreasing) */
  dsShareOffcuts: boolean;
  /** added to every downspout's length (PRD 06 ds_extension_ft) */
  dsExtensionIn: number;
  /** seamless from a coil (one piece per run) or sectional */
  seamless: boolean;
  sectionLengthIn: number;
  /** coil blank width by "profile.size" (5 in K → 11 7/8, 6 in K → 15): an attribute of the coil line */
  coilBlankIn: Record<string, string>;
  hangerKits: Record<string, HangerKit>;
  /** company spacing by kit id; a run's own spacing wins */
  hangerSpacingIn: Record<string, number>;
  /** a hanger at both ends of every run: floor(length / spacing) + 1 (40 ft at 2 ft → 21); off: ceil(length / spacing) */
  hangerAtEnds: boolean;
  wallKits: Record<string, WallKit>;
  /** wall kit by downspout shape and wall */
  wallKitByWall: Record<string, Record<string, string>>;
  defaultWall: string;
  /** inches of downspout per wall fastener (2 per 10 ft) */
  dsFastenerSpacingIn: number;
  guardKits: Record<string, GuardKit>;
  /** guard kit for a run with guards but no type */
  defaultGuard: string;
  joints: Record<JointKind, JointRule>;
  /** downspout joints: pop rivets or #8 x 1/2 screws */
  dsJoin: "rivet" | "screw";
  /** sealant points per tube (PRD 06: 8 joints a tube) */
  jointsPerSealantTube: number;
  /** sealant in the joint's color (painted stock: one line per color; mill: plain sealant) — spec П18.15. Off by default:
   *  an item priced as plain «sealant» keeps its price until the company turns this on */
  sealantByColor: boolean;
  /** a length attribute of a kit part by gutter size, inches: { spike: { "5": "7" } } (spec П18.15). Empty by default:
   *  an item priced without a length keeps its price until the company turns lengths on (DEFAULT_SPIKE_LENGTH_IN) */
  kitLengthIn: Record<string, Record<string, string>>;
  /** the wood screw of the kits: its size and a washer (spec П18.15) */
  woodScrew: { screw: string; washer: boolean };
  /** the masonry anchor of the kits: "masonry" (any) or a size */
  anchor: string;
  /** soldered metals take solder instead of sealant */
  solderedMaterials: string[];
  solderPointsPerLb: number;
  /** one touch-up can per painted color with field cuts */
  touchUpPaint: boolean;
  /** end caps of these profiles come left and right */
  sidedCapProfiles: string[];
  /** elbows of a corrugated rectangular downspout without its own (A, B): founder 16.11 «у ребристого 3 штуки A» (#1776) */
  defaultElbows: { style: string; qty: number }[];
  /** …of a plain (smooth) rectangular one: founder 16.11 «у прямого водостока стандартно колен 0» — it is bent on site (#1776) */
  defaultElbowsPlain: { style: string; qty: number }[];
  /** …of a round one (30°…90°; «A» is not a round elbow, #871): founder 16.11 «колено только одно», 75° or 45° (§2.15 №2) */
  defaultElbowsRound: { style: string; qty: number }[];
  /** offsets of a round one without its own: founder 16.11 «и офсет тоже один», 2″ (§2.15 №2) */
  defaultOffsetsRound: { lengthIn: number; qty: number }[];
  /** bends of a downspout bent on site when it has no elbows of its own (spec §2.1, Н2) */
  fieldBends: number;
  /** downspout one bend on site takes, inches, by its size «2x3» (founder 16.11 «зависит от размера водостока», §2.15 №3, Н7) */
  bendInBySize: Record<string, number>;
  /** …of a size not in the table */
  bendInDefault: number;
  /** a downspout's estimate line is rounded up to this many feet, each downspout on its own; the sticks are not (Д1, Н8; 1 — whole
   *  feet, 0 — as drawn) */
  dsRoundUpFt: number;
  /** offsets sold ready-made; others are marked custom */
  stdOffsetsIn: number[];
  /** advice: max gutter length one downspout drains */
  maxRunPerDownspoutIn: number;
  /** advice: aluminum expansion joint spacing */
  expansionJointIn: number;
  /** add the expansion joints as parts, not only as advice */
  expansionJointPart: boolean;
}

export const DEFAULT_GUTTER_RULES: GutterRules = {
  storyHeightIn: 120,
  wasteFt: 10,
  cutCornerAllowanceIn: 6,
  cutCornerOutAllowanceIn: 14,
  dsStickIn: 120,
  dsShareOffcuts: true,
  dsExtensionIn: 0,
  seamless: true,
  sectionLengthIn: 120,
  coilBlankIn: { "k.5": "11.875", "k.6": "15" },
  hangerKits: DEFAULT_HANGER_KITS,
  hangerSpacingIn: {},
  hangerAtEnds: true,
  wallKits: DEFAULT_WALL_KITS,
  wallKitByWall: DEFAULT_WALL_KIT_BY_WALL,
  defaultWall: "wood",
  dsFastenerSpacingIn: 60,
  guardKits: DEFAULT_GUARD_KITS,
  defaultGuard: "micromesh",
  joints: DEFAULT_JOINTS,
  dsJoin: "rivet",
  jointsPerSealantTube: 8,
  sealantByColor: false,
  kitLengthIn: {},
  woodScrew: { screw: WOOD_SCREW, washer: false },
  anchor: "masonry",
  solderedMaterials: ["copper"],
  solderPointsPerLb: 10,
  touchUpPaint: true,
  sidedCapProfiles: ["k", "fascia"],
  defaultElbows: [{ style: "A", qty: 3 }],
  defaultElbowsPlain: [],
  defaultElbowsRound: [{ style: "75", qty: 1 }],
  defaultOffsetsRound: [{ lengthIn: 2, qty: 1 }],
  fieldBends: 3,
  bendInBySize: { "2x3": 6, "3x4": 6, "4x5": 6 },
  bendInDefault: 6,
  dsRoundUpFt: 10,
  stdOffsetsIn: [1, 2, 4],
  maxRunPerDownspoutIn: 480,
  expansionJointIn: 600,
  expansionJointPart: false,
};

/** Company rule overrides: kit maps merge with the defaults by id, the wall table by shape and wall, joints by field. */
export type GutterRulesOverride = Partial<Omit<GutterRules, "joints">> & {
  joints?: Partial<Record<JointKind, Partial<JointRule>>>;
};

/** rules that divide: must be whole inches / counts > 0, else the default (a blank field on a screen is 0) */
const POSITIVE: (keyof GutterRules)[] = ["storyHeightIn", "dsStickIn", "sectionLengthIn", "dsFastenerSpacingIn", "jointsPerSealantTube", "solderPointsPerLb", "maxRunPerDownspoutIn", "expansionJointIn"];
const okPos = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export function resolveGutterRules(over?: GutterRulesOverride): GutterRules {
  const d = DEFAULT_GUTTER_RULES;
  // a settings screen may send { wastePct: undefined }: undefined never replaces a default
  const o = Object.fromEntries(Object.entries(over ?? {}).filter(([, v]) => v !== undefined)) as GutterRulesOverride;
  const joints = { ...d.joints };
  for (const [k, j] of Object.entries(o.joints ?? {}) as [JointKind, Partial<JointRule>][]) joints[k] = { ...d.joints[k], ...j };
  const wallKitByWall: Record<string, Record<string, string>> = { ...d.wallKitByWall };
  for (const [shape, walls] of Object.entries(o.wallKitByWall ?? {})) wallKitByWall[shape] = { ...d.wallKitByWall[shape], ...walls };
  const r: GutterRules = {
    ...d,
    ...(o as Partial<GutterRules>),
    hangerKits: { ...d.hangerKits, ...o.hangerKits },
    hangerSpacingIn: { ...d.hangerSpacingIn, ...o.hangerSpacingIn },
    wallKits: { ...d.wallKits, ...o.wallKits },
    wallKitByWall,
    guardKits: { ...d.guardKits, ...o.guardKits },
    joints,
    coilBlankIn: { ...d.coilBlankIn, ...o.coilBlankIn },
    // only text lengths (a number would break the key); a copy, never the caller's object (review V1 №4, №7)
    kitLengthIn: Object.fromEntries(
      Object.entries({ ...d.kitLengthIn, ...o.kitLengthIn }).map(([part, t]) => [part, Object.fromEntries(Object.entries(t ?? {}).filter(([, v]) => typeof v === "string" && v.trim() !== ""))]),
    ),
    woodScrew: { ...d.woodScrew, ...o.woodScrew },
    bendInBySize: { ...d.bendInBySize, ...o.bendInBySize },
  };
  r.woodScrew = { ...r.woodScrew, washer: r.woodScrew.washer === true };
  if (typeof r.sealantByColor !== "boolean") r.sealantByColor = d.sealantByColor;
  if (typeof r.woodScrew.screw !== "string" || !r.woodScrew.screw.trim()) r.woodScrew = { ...r.woodScrew, screw: d.woodScrew.screw };
  if (typeof r.anchor !== "string" || !r.anchor.trim()) r.anchor = d.anchor;
  for (const k of POSITIVE) if (!okPos(r[k])) (r as unknown as Record<string, unknown>)[k] = d[k];
  if (typeof r.hangerAtEnds !== "boolean") r.hangerAtEnds = d.hangerAtEnds;
  if (!Number.isInteger(r.dsExtensionIn) || r.dsExtensionIn < 0) r.dsExtensionIn = 0;
  if (!Number.isInteger(r.wasteFt) || r.wasteFt < 0) r.wasteFt = d.wasteFt;
  if (!Number.isInteger(r.cutCornerAllowanceIn) || r.cutCornerAllowanceIn < 0) r.cutCornerAllowanceIn = d.cutCornerAllowanceIn;
  if (!Number.isInteger(r.cutCornerOutAllowanceIn) || r.cutCornerOutAllowanceIn < 0) r.cutCornerOutAllowanceIn = d.cutCornerOutAllowanceIn;
  // whole and ≥ 0, else the default (a blank field is 0 — for these 0 is a real choice: no bends, nothing eaten, no rounding)
  const wholeOr = (v: unknown, def: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : def);
  r.fieldBends = wholeOr(r.fieldBends, d.fieldBends);
  r.bendInDefault = wholeOr(r.bendInDefault, d.bendInDefault);
  r.dsRoundUpFt = wholeOr(r.dsRoundUpFt, d.dsRoundUpFt);
  r.bendInBySize = Object.fromEntries(Object.entries(r.bendInBySize).map(([k, v]) => [k, wholeOr(v, d.bendInBySize[k] ?? r.bendInDefault)]));
  const list = <T extends { qty: number }>(v: unknown, def: T[]): T[] => (Array.isArray(v) && v.every((x) => x && typeof x === "object" && Number.isInteger((x as T).qty) && (x as T).qty >= 0) ? (v as T[]) : def);
  r.defaultElbowsRound = list(r.defaultElbowsRound, d.defaultElbowsRound);
  r.defaultOffsetsRound = list(r.defaultOffsetsRound, d.defaultOffsetsRound).filter((o) => Number.isInteger(o.lengthIn) && o.lengthIn > 0);
  return r;
}

/** The default hanger kit for a profile and roof edge (company table, spec П18.6). */
export function defaultHangerKit(profile: GutterProfile, mount: GutterMount, byMount: Record<string, Record<string, string>> = DEFAULT_HANGER_BY_MOUNT): string {
  return byMount[profile]?.[mount] ?? "hidden";
}

export interface PartQty {
  /** stable key: the same part on the next recalculation has the same key */
  key: string;
  section: GutterSection;
  /** decimal string */
  qty: string;
  unit: "ft" | "ea" | "lb";
  use: PartUse;
  kind: "material" | "labor";
  /** what to look up in the price list (profile, size, material, color, …) */
  attrs: Record<string, string>;
  /**
   * Why the engine added it (spec 33-gutters-consumption §2.13, «ничего молча», founder 16.11): the rule, its numbers and the company
   * setting where the number changes. Every part the engine derived itself has it; a part of the drawing (a gutter, a downspout, an
   * elbow, …) has none. Never in `attrs` — those pick the price item. The screen writes the words (i18n `mod.gutters.why.<rule>`).
   */
  why?: PartWhy;
  /** the gutter stock line (coil or sections): its inches by where they come from — drawn, corner allowances, reserve (§2.12) */
  coilBreakdown?: CoilBreakdown;
}

/** the closed list of reasons (spec 33-gutters-consumption §2.13: a new rule is a row there first) */
export const WHY_RULES = [
  "sealant_points", "solder_points", "flux_per_solder", "gas_per_points", "abrasive_per_points", "soda_per_job",
  "rivets_per_joints", "ds_joint_screws", "joint_screws", "kit_screws", "kit_anchors", "hangers_spacing", "kit_per_hanger",
  "ds_straps_per_ds", "flat_coil_straps", "touch_up_per_color", "corner_allowance", "coil_reserve", "bend_in_place",
  "ds_round_up", "ds_sticks", "slip_joints", "outlet_per_ds", "endcap_free_end", "splash_guard_inside", "expansion_joint",
  "guard_pieces", "adapter_per_bottom",
] as const;
export type WhyRule = (typeof WHY_RULES)[number];
export interface PartWhy {
  rule: WhyRule;
  /** the numbers of the text: lengths in inches (`…In`) or feet (`…Ft`) as the name says, counts whole */
  params: Record<string, string | number>;
  /** the company setting's field where the number changes */
  setting?: string;
  /** one line, more rules (a #8 screw of the downspout joints and of the straps): each with its own numbers */
  also?: PartWhy[];
}
export interface CoilBreakdown {
  /** the runs of this stock as drawn */
  drawnIn: number;
  /** the corner allowances (cut on site) of this stock */
  cornersIn: number;
  /** the reserve */
  wasteIn: number;
}

export type GutterAdvice =
  | { code: "run_long_for_downspouts"; runId: string; lengthIn: number; downspouts: number }
  | { code: "expansion_joint"; runId: string; joints: number }
  | { code: "downspout_without_run"; downspoutId: string }
  | { code: "lower_roof_from_first_story"; downspoutId: string }
  | { code: "corner_missing"; runId: string; cornerId: string }
  | { code: "run_without_downspout"; runId: string }
  | { code: "hanger_kit_unknown"; runId: string; hanger: string }
  | { code: "wall_kit_unknown"; downspoutId: string; wall: string }
  | { code: "guard_kit_unknown"; runId: string; guard: string }
  | { code: "end_outlet_not_cap"; downspoutId: string }
  | { code: "wye_downspout_missing"; wyeId: string }
  | { code: "wye_sizes_differ"; wyeId: string }
  | { code: "wye_same_downspout"; wyeId: string }
  | { code: "end_outlet_taken"; downspoutId: string }
  | { code: "strip_size_unknown"; downspoutId: string; size: string }
  /** a length or spacing that was not a whole number of inches ≥ 0 (or > 0 for spacing) was fixed */
  | { code: "input_fixed"; id: string; field: string };

export interface GutterPartsResult {
  parts: PartQty[];
  advice: GutterAdvice[];
}

/** a key segment: dots inside values (".032") would read as separators */
const seg = (v: string) => v.replace(/\./g, "");
const stockKey = (s: GutterStock) => [s.profile, s.size, s.material, ...(s.gauge ? [seg(s.gauge)] : []), s.color ?? "-"].join(".");
const stockAttrs = (s: GutterStock): Record<string, string> => ({
  profile: s.profile,
  size: s.size,
  material: s.material,
  ...(s.gauge ? { gauge: s.gauge } : {}),
  ...(s.finish ? { finish: s.finish } : {}),
  ...(s.color ? { color: s.color } : {}),
});
const ft = (inches: Dec): Dec => inches.div(12);
const storyKey = (story: number) => String(Math.min(Math.max(story, 1), 4));
const painted = (s: { finish?: string; color?: string }) => (s.finish ? s.finish === "painted" : !!s.color);
/** the metal of fittings and fasteners: a copper gutter takes copper hangers and rivets, a steel one steel */
export function metalOf(material: string): string {
  if (material.startsWith("copper")) return "copper";
  if (material.startsWith("zinc")) return "zinc";
  if (/^(steel|galv|bond)/.test(material)) return "steel";
  return "aluminum";
}
/** fasteners every kit and joint share (screws, anchors): one section whatever brought them first */
const CONSUMABLE_PARTS = new Set(["screw", "anchor"]);

interface KitCtx { gutter?: GutterStock; ds?: { shape: string; size: string; material: string }; kitId?: string }

/** a kit part's attributes and key: part + attribute values in key-name order */
/** the company's fastener choices (spec П18.15): the kits' wood screw and anchor, a part's length by gutter size */
function companyAttrs(p: KitPart, ctx: KitCtx, rules: Pick<GutterRules, "woodScrew" | "anchor" | "kitLengthIn">): Record<string, string> {
  if (p.part === "screw" && p.attrs?.screw === WOOD_SCREW)
    return { ...p.attrs, screw: rules.woodScrew.screw, ...(rules.woodScrew.washer ? { washer: "washer" } : {}) };
  if (p.part === "anchor" && p.attrs?.anchor === "masonry") return { ...p.attrs, anchor: rules.anchor };
  const len = ctx.gutter ? rules.kitLengthIn[p.part]?.[ctx.gutter.size] : undefined;
  return len ? { ...(p.attrs ?? {}), lengthIn: len } : { ...(p.attrs ?? {}) };
}

function kitPart(p: KitPart, ctx: KitCtx, rules: Pick<GutterRules, "woodScrew" | "anchor" | "kitLengthIn">) {
  const attrs: Record<string, string> = {
    ...companyAttrs(p, ctx, rules),
    ...(p.byKit && ctx.kitId ? { [p.part]: ctx.kitId } : {}),
    ...(p.bySize && ctx.gutter ? { profile: ctx.gutter.profile, size: ctx.gutter.size, metal: metalOf(ctx.gutter.material) } : {}),
    ...(p.byDs && ctx.ds ? { shape: ctx.ds.shape, size: ctx.ds.size, metal: metalOf(ctx.ds.material) } : {}),
  };
  const key = [p.part, ...Object.keys(attrs).sort().map((k) => seg(attrs[k]!))].join(".");
  return { key, attrs: { part: p.part, ...attrs } };
}

/** a rate, not a count: the same on every addition (a «per…», a spacing, a length of a piece) — never summed */
const RATE = /^(per|per[A-Z]\w*|spacingIn|stickIn|stepFt|everyIn|pieceIn|reserveFt|sectionIn|atEnds|outIn|inIn)$/;
/** the same rule on the same line: counts add up; rates and words must be equal, else it is another group of the rule */
function mergeWhy(into: PartWhy | undefined, w: PartWhy | undefined): PartWhy | undefined {
  if (!w) return into;
  const copy = (x: PartWhy): PartWhy => ({ ...x, params: { ...x.params } });
  if (!into) return copy(w);
  const fits = (x: PartWhy) =>
    x.rule === w.rule && x.setting === w.setting &&
    Object.entries(w.params).every(([k, v]) => !(k in x.params) || ((typeof v === "number" && typeof x.params[k] === "number" && !RATE.test(k)) || x.params[k] === v));
  const t = [into, ...(into.also ?? [])].find(fits);
  if (!t) {
    (into.also ??= []).push(copy(w));
    return into;
  }
  for (const [k, v] of Object.entries(w.params)) {
    const c = t.params[k];
    t.params[k] = typeof v === "number" && typeof c === "number" && !RATE.test(k) ? c + v : (c ?? v);
  }
  return into;
}

/** the totals of a rule added once at the end (tubes, pounds) and its setting */
const withParams = (w: PartWhy | undefined, more: Record<string, number>, setting?: string): PartWhy | undefined =>
  w ? { ...w, params: { ...w.params, ...more }, ...(setting ? { setting } : {}) } : undefined;

class Acc {
  private m = new Map<string, PartQty & { _q: Dec }>();
  add(p: Omit<PartQty, "qty" | "why">, q: DecLike, why?: PartWhy) {
    const cur = this.m.get(p.key);
    if (cur) {
      cur._q = cur._q.add(dec(q));
      const w = mergeWhy(cur.why, why);
      if (w) cur.why = w;
    } else this.m.set(p.key, { ...p, qty: "", _q: dec(q), ...(why ? { why: mergeWhy(undefined, why)! } : {}) });
  }
  list(): PartQty[] {
    const order = (s: GutterSection) => GUTTER_SECTIONS.indexOf(s);
    return [...this.m.values()]
      .filter((p) => !p._q.isZero())
      .map(({ _q, ...p }) => ({ ...p, qty: _q.toString() }))
      .sort((a, b) => order(a.section) - order(b.section) || a.key.localeCompare(b.key));
  }
}

/** Downspout length (inches) by the rules. */
export function downspoutLengthIn(ds: MeasuredDownspout, story: number, rules: GutterRules): number {
  if (ds.heightIn !== undefined) return ds.heightIn + rules.dsExtensionIn;
  // onto the lower roof: from this eave down to the roof one story below
  const stories = ds.bottom.kind === "lower_roof" ? Math.max(story - 1, 0) : story;
  return stories * rules.storyHeightIn + rules.dsExtensionIn;
}

/**
 * Sticks to buy for downspouts of one kind: every downspout takes its full sticks, the remainders share
 * sticks first fit decreasing (an offcut serves only a shorter piece; pieces are never joined from offcuts).
 */
export function downspoutSticks(lengthsIn: number[], stickIn: number, shareOffcuts = true): number {
  if (!okPos(stickIn)) throw new Error("stick length must be whole inches > 0");
  lengthsIn = lengthsIn.map((l) => Math.max(0, Math.round(l)));
  if (!shareOffcuts) return lengthsIn.reduce((n, l) => n + Math.ceil(l / stickIn), 0);
  let sticks = 0;
  const rest: number[] = [];
  for (const l of lengthsIn) {
    sticks += Math.floor(l / stickIn);
    const r = l % stickIn;
    if (r > 0) rest.push(r);
  }
  const free: number[] = [];
  for (const r of rest.sort((a, b) => b - a)) {
    const i = free.findIndex((f) => f >= r);
    if (i >= 0) free[i] = free[i]! - r;
    else { sticks += 1; free.push(stickIn - r); }
  }
  return sticks;
}

/** Purchase units: ceil(qty ÷ pack size), pack size = units of the line in one purchase unit (core C3, spec П16.6). */
export function purchaseQty(qty: DecLike, packSize: DecLike): Dec {
  const p = dec(packSize);
  if (!p.gt(0)) throw new Error("pack size must be > 0");
  const q = dec(qty);
  if (q.isNegative()) throw new Error("quantity must be ≥ 0");
  return q.div(p).ceil();
}

/**
 * The version of the gutter parts rule (#1165): raise it when `computeGutterParts` changes WHAT it counts for the same drawing
 * (a part, its quantity, an elbow rule — as #871 did). Not for a change in the core's money (a line, a discount): that is
 * `ENGINE_VERSION`, and it must not mark every estimate as «расчёт изменился». Estimates remember it in their lines.
 */
export const GUTTER_PARTS_VERSION = "5"; // 5: «Расход v2» PR-1б — a plain rectangular downspout bent on site (3 bends, +6″ each, «гиб по месту»), a round one 1 × 75° and a 2″ offset, the estimate's downspout rounded up to 10 ft each (spec 33-gutters-consumption §2.1, §2.15 №1–6); 4: a plain rectangular downspout has no elbows by default, a corrugated one 3 × A, #1776; 3: the waste is a fixed 10 ft for every gutter stock by default, #1355; 2: waste 10% by default and a separate allowance for an outside corner (14″), #1355

/**
 * How a downspout's elbows are made (spec 33-gutters-consumption §2.1 п.2, founder 16.11 «гнут по месту только гладкий
 * прямоугольный»): its own `elbowBend`; else bent on site when it is rectangular, explicitly plain and has no elbows of its own;
 * else ready-made — an old drawing without `dsStyle` and elbows set by hand keep their parts (rule 16).
 */
export function bendOf(ds: Pick<MeasuredDownspout, "shape" | "dsStyle" | "elbows" | "elbowBend">): ElbowBend {
  if (ds.elbowBend === "field" || ds.elbowBend === "ready") return ds.elbowBend;
  return ds.shape === "rect" && ds.dsStyle === "plain" && ds.elbows === undefined ? "field" : "ready";
}

/**
 * The elbows a downspout gets when it has none of its own (#1776, founder 16.11; §2.1, §2.15 №2): one bent on site — the
 * company's bends (3) as «A», a style the drawing shows; a corrugated rectangular one — 3 × A ready; a plain rectangular one
 * made ready or without a kind — none; a round one — 1 × 75°. The app reads its default from here: one rule, not two copies.
 */
export function defaultElbowsFor(ds: Pick<MeasuredDownspout, "shape" | "dsStyle" | "elbowBend">, rules: Pick<GutterRules, "defaultElbows" | "defaultElbowsPlain" | "defaultElbowsRound" | "fieldBends"> = DEFAULT_GUTTER_RULES): { style: string; qty: number }[] {
  if (ds.shape === "round") return rules.defaultElbowsRound;
  if (bendOf({ ...ds, elbows: undefined }) === "field") return rules.fieldBends > 0 ? [{ style: "A", qty: rules.fieldBends }] : [];
  return ds.dsStyle === "corrugated" ? rules.defaultElbows : rules.defaultElbowsPlain;
}

/** The offsets a downspout gets when it has none of its own: a round one — 1 × 2″ (§2.15 №2), others none. */
export function defaultOffsetsFor(ds: Pick<MeasuredDownspout, "shape">, rules: Pick<GutterRules, "defaultOffsetsRound"> = DEFAULT_GUTTER_RULES): { lengthIn: number; qty: number }[] {
  return ds.shape === "round" ? rules.defaultOffsetsRound : [];
}

/**
 * What bending on site does to a downspout (§2.1 п.3, §2.2, Д6, Д7, Р4): each elbow is one bend, each offset two bends and its
 * own length; each bend takes the company's inches for the size. Ready-made elbows — nothing (they are parts).
 */
export function fieldBendOf(ds: Pick<MeasuredDownspout, "shape" | "size" | "dsStyle" | "elbows" | "offsets" | "elbowBend">, rules: Pick<GutterRules, "defaultElbows" | "defaultElbowsPlain" | "defaultElbowsRound" | "defaultOffsetsRound" | "fieldBends" | "bendInBySize" | "bendInDefault"> = DEFAULT_GUTTER_RULES): { bends: number; perBendIn: number; offsetIn: number; addedIn: number } {
  const perBendIn = rules.bendInBySize[ds.size] ?? rules.bendInDefault;
  if (bendOf(ds) !== "field") return { bends: 0, perBendIn, offsetIn: 0, addedIn: 0 };
  let bends = 0;
  let offsetIn = 0;
  for (const e of ds.elbows ?? defaultElbowsFor(ds, rules)) bends += Math.max(0, e.qty);
  for (const o of ds.offsets ?? defaultOffsetsFor(ds, rules)) {
    if (o.qty <= 0) continue;
    bends += 2 * o.qty;
    offsetIn += Math.max(0, o.lengthIn) * o.qty;
  }
  return { bends, perBendIn, offsetIn, addedIn: bends * perBendIn + offsetIn };
}

/** a downspout's estimate length: rounded up to the step, inches (Д1); 0 or less — as it is */
export function dsRoundedIn(lengthIn: number, stepFt: number): number {
  const step = stepFt * 12;
  return step > 0 ? Math.ceil(lengthIn / step) * step : lengthIn;
}

export function computeGutterParts(input: MeasurementInput, over?: GutterRulesOverride): GutterPartsResult {
  const rules = resolveGutterRules(over);
  const acc = new Acc();
  const advice: GutterAdvice[] = [];

  // lengths are whole inches ≥ 0 and spacings whole inches > 0 (geometry rounds; a typed 0 or −24 must not
  // give Infinity or negative parts): anything else is fixed and reported
  const whole = (id: string, field: string, v: number | undefined): number | undefined => {
    if (v === undefined) return v;
    const w = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    if (w !== v) advice.push({ code: "input_fixed", id, field });
    return w;
  };
  const spacingOrNone = (id: string, v: number | undefined): number | undefined => {
    if (v === undefined || okPos(v)) return v;
    advice.push({ code: "input_fixed", id, field: "hangerSpacingIn" });
    return undefined;
  };
  input = {
    ...input,
    runs: input.runs.map((r) => ({ ...r, lengthIn: whole(r.id, "lengthIn", r.lengthIn)!, guardsIn: whole(r.id, "guardsIn", r.guardsIn), hangerSpacingIn: spacingOrNone(r.id, r.hangerSpacingIn) })),
    downspouts: input.downspouts.map((d) => ({ ...d, heightIn: whole(d.id, "heightIn", d.heightIn), bottom: { ...d.bottom, lengthIn: whole(d.id, "bottom.lengthIn", d.bottom.lengthIn) } })),
    chains: input.chains?.map((c) => ({ ...c, lengthIn: whole(c.id, "lengthIn", c.lengthIn) })),
  };
  const runs = new Map(input.runs.map((r) => [r.id, r]));
  const corners = new Map(input.corners.map((c) => [c.id, c]));

  /* joints: rivets by metal and color, sealant or solder points, touch-up colors */
  const sealantPts = new Map<string, number>();
  let solderPts = 0;
  // where the points of each tube colour (and of the solder) come from, for its «why» (§2.13): joints by kind
  const sealantWhy = new Map<string, PartWhy>();
  let solderWhy: PartWhy | undefined;
  const JW: Record<JointKind, [string, string]> = {
    section: ["sections", "perSection"], endcap: ["endcaps", "perEndcap"], outlet: ["outlets", "perOutlet"], ds: ["dsJoints", "perDsJoint"],
    corner_prefab: ["prefabCorners", "perPrefabCorner"], corner_cut: ["cutCorners", "perCutCorner"], corner_strip: ["stripCorners", "perStripCorner"],
  } as Record<JointKind, [string, string]>;
  const paintColors = new Set<string>();
  const joint = (kind: JointKind, s: { material: string; finish?: string; color?: string }, n = 1) => {
    if (n <= 0) return;
    const j = rules.joints[kind];
    const finish = painted(s) ? "painted" : "mill";
    const metal = metalOf(s.material);
    const color = finish === "painted" && s.color ? s.color : "-";
    const [cnt, per] = JW[kind] ?? [`${kind}s`, `per_${kind}`];
    if (kind === "ds" && rules.dsJoin === "screw") {
      acc.add({ key: "screw.8x05", section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "screw", screw: "8x0.5" } }, j.rivets * n,
        { rule: "ds_joint_screws", params: { joints: n, perJoint: j.rivets, screws: j.rivets * n }, setting: "dsJoin" });
    } else if (j.rivets > 0) {
      acc.add({ key: `rivet.42.${metal}.${finish}.${color}`, section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "rivet", rivet: "42", material: metal, finish, ...(color !== "-" ? { color } : {}) } }, j.rivets * n,
        { rule: "rivets_per_joints", params: { [cnt]: n, [per]: j.rivets, rivets: j.rivets * n }, setting: "joints" });
    }
    if (rules.solderedMaterials.includes(s.material)) {
      solderPts += j.sealant * n;
      if (j.sealant > 0) solderWhy = mergeWhy(solderWhy, { rule: "solder_points", params: { [cnt]: n, [per]: j.sealant, points: j.sealant * n } });
    } else if (j.sealant > 0) {
      const sc = rules.sealantByColor ? color : "-";
      sealantPts.set(sc, (sealantPts.get(sc) ?? 0) + j.sealant * n);
      sealantWhy.set(sc, mergeWhy(sealantWhy.get(sc), { rule: "sealant_points", params: { [cnt]: n, [per]: j.sealant, points: j.sealant * n } })!);
    }
    if (j.paint && finish === "painted" && s.color) paintColors.add(s.color);
  };

  /** the reason of a kit's part: its main piece by the kit's own rule, a screw / an anchor by the pieces it fastens, the rest one per piece */
  type KitHost = { main: (n: number) => PartWhy; host: string; wall?: string };
  const kitWhy = (p: KitPart, n: number, h: KitHost): PartWhy => {
    if (p.use === "both" || p.part === "hanger") return h.main(n * p.per);
    // only the wood screw is the company's choice (woodScrew); a #8 is not
    if (p.part === "screw") return { rule: "kit_screws", params: { part: h.host, screw: p.attrs?.screw ?? "-", units: n, perUnit: p.per, screws: n * p.per }, ...(p.attrs?.screw === WOOD_SCREW ? { setting: "woodScrew" } : {}) };
    if (p.part === "anchor") return { rule: "kit_anchors", params: { wall: h.wall ?? "-", units: n, perUnit: p.per, anchors: n * p.per }, setting: "anchor" };
    return { rule: "kit_per_hanger", params: { part: p.part, hangers: n, per: p.per } };
  };
  const kitParts = (parts: KitPart[], section: GutterSection, n: DecLike, ctx: KitCtx, strips?: Map<string, { attrs: Record<string, string>; inches: Dec; straps: number; perStrapIn: number }>, dsId?: string, host?: KitHost) => {
    for (const p of parts) {
      const { key, attrs } = kitPart(p, ctx, rules);
      if (p.stripInBySize) {
        const per = ctx.ds ? p.stripInBySize[ctx.ds.size] : undefined;
        if (per === undefined || !strips) {
          if (ctx.ds && dsId) advice.push({ code: "strip_size_unknown", downspoutId: dsId, size: ctx.ds.size });
          continue;
        }
        const cur = strips.get(key);
        const inches = dec(per).mul(p.per).mul(dec(n));
        const straps = dec(n).mul(p.per).toNumber();
        if (cur) { cur.inches = cur.inches.add(inches); cur.straps += straps; }
        else strips.set(key, { attrs, inches, straps, perStrapIn: per });
        continue;
      }
      acc.add({ key, section: CONSUMABLE_PARTS.has(p.part) ? "consumables" : section, unit: "ea", use: p.use ?? "purchase", kind: "material", attrs }, dec(n).mul(p.per), host ? kitWhy(p, dec(n).toNumber(), host) : undefined);
    }
  };

  /* gutter by stock: the client sees the installed length; the supplier gets length + corners + waste */
  // by stock: the drawn length, the corner allowances (how many outside / inside, of how much) and the runs — the line's breakdown (§2.12)
  type Buy = { stock: GutterStock; inches: Dec; drawnIn: number; cornersIn: number; runs: number; outN: number; inN: number };
  const purchaseIn = new Map<string, Buy>();
  const addPurchase = (s: GutterStock, inches: DecLike, from: "run" | "out" | "in") => {
    const k = stockKey(s);
    const cur = purchaseIn.get(k) ?? { stock: s, inches: dec(0), drawnIn: 0, cornersIn: 0, runs: 0, outN: 0, inN: 0 };
    purchaseIn.set(k, cur);
    cur.inches = cur.inches.add(dec(inches));
    const n = dec(inches).toNumber();
    if (from === "run") { cur.drawnIn += n; cur.runs += 1; }
    else { cur.cornersIn += n; if (from === "out") cur.outN += 1; else cur.inN += 1; }
  };

  // ends replaced by an end section with an outlet (half round "D")
  // run:end → the downspout that has it; a second downspout on the same end gets an ordinary outlet
  const endOutlets = new Map<string, string>();
  for (const ds of input.downspouts) {
    if (!ds.endOutlet) continue;
    const run = runs.get(ds.runId);
    const i = ds.endOutlet === "start" ? 0 : 1;
    const k = `${ds.runId}:${i}`;
    if (!run) continue;
    if (run.ends[i].kind !== "cap") advice.push({ code: "end_outlet_not_cap", downspoutId: ds.id });
    else if (endOutlets.has(k)) advice.push({ code: "end_outlet_taken", downspoutId: ds.id });
    else endOutlets.set(k, ds.id);
  }

  for (const r of input.runs) {
    const len = dec(r.lengthIn);
    acc.add({ key: `gutter.${stockKey(r)}`, section: "gutter", unit: "ft", use: "estimate", kind: "material", attrs: stockAttrs(r) }, ft(len));
    addPurchase(r, len, "run");
    if (!rules.seamless) {
      const joins = Math.max(Math.ceil(r.lengthIn / rules.sectionLengthIn) - 1, 0);
      if (joins > 0) {
        acc.add({ key: `slipjoint.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "slip_joint" } }, joins, { rule: "slip_joints", params: { sections: joins + 1, sectionIn: rules.sectionLengthIn, joints: joins }, setting: "sectionLengthIn" });
        joint("section", r, joins);
      }
    }

    // end caps: K and fascia come left and right by where the house is; round and box caps fit either end
    r.ends.forEach((e, i) => {
      if (e.kind === "corner" && !corners.has(e.cornerId)) advice.push({ code: "corner_missing", runId: r.id, cornerId: e.cornerId });
      if (e.kind !== "cap" || endOutlets.has(`${r.id}:${i}`)) return;
      if (rules.sidedCapProfiles.includes(r.profile)) {
        // standing outside and facing the house: with the house on the right of the drawing direction,
        // the start of the run is on your right (right cap) and the end on your left; mirrored for the house on the left
        const side = (i === 0) === (r.houseSide === "R") ? "R" : "L";
        acc.add({ key: `endcap.${side}.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "end_cap", side } }, 1, { rule: "endcap_free_end", params: { side, ends: 1 } });
      } else {
        acc.add({ key: `endcap.-.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "end_cap" } }, 1, { rule: "endcap_free_end", params: { side: "-", ends: 1 } });
      }
      joint("endcap", r);
    });

    // hangers: the kit's parts × (a hanger every `spacing` and one at each end: floor(length / spacing) + 1; company can switch to ceil)
    const kit = rules.hangerKits[r.hanger];
    const spacing = [r.hangerSpacingIn, rules.hangerSpacingIn[r.hanger], kit?.spacingIn].find(okPos) ?? 24;
    const hangers = len.gt(0) ? (rules.hangerAtEnds ? len.div(spacing).floor().add(1) : len.div(spacing).ceil()) : dec(0);
    // rounded on every run: the line is the sum of the runs' own counts — `runs` says how many, `hangers` is the line (never recount it)
    const hangerWhy = (h: number): PartWhy => ({ rule: "hangers_spacing", params: { runs: 1, lengthIn: r.lengthIn, spacingIn: spacing, atEnds: rules.hangerAtEnds ? 1 : 0, hangers: h }, setting: "hangerSpacingIn" });
    const hn = hangers.toNumber();
    if (kit) kitParts(kit.parts, "fasteners", hangers, { gutter: r, kitId: r.hanger }, undefined, undefined, { main: hangerWhy, host: "hanger" });
    else {
      advice.push({ code: "hanger_kit_unknown", runId: r.id, hanger: r.hanger });
      acc.add({ key: `hanger.${seg(r.hanger)}.${r.profile}.${r.size}`, section: "fasteners", unit: "ea", use: "both", kind: "material", attrs: { part: "hanger", hanger: r.hanger, profile: r.profile, size: r.size } }, hangers, hangerWhy(hn));
    }
    if (r.wedges) acc.add({ key: `wedge.${r.profile}.${r.size}`, section: "fasteners", unit: "ea", use: "purchase", kind: "material", attrs: { part: "wedge", profile: r.profile, size: r.size } }, hangers, { rule: "kit_per_hanger", params: { part: "wedge", hangers: hn, per: 1 } });

    if (r.guardsIn && r.guardsIn > 0) {
      const g = Math.min(r.guardsIn, r.lengthIn);
      const type = r.guardType ?? rules.defaultGuard;
      acc.add({ key: `guard.${type}.${r.profile}.${r.size}`, section: "guards", unit: "ft", use: "estimate", kind: "material", attrs: { guard: type, profile: r.profile, size: r.size } }, ft(dec(g)));
      const gk = rules.guardKits[type];
      if (gk && okPos(gk.pieceIn)) {
        const pieces = Math.ceil(g / gk.pieceIn);
        const guardWhy = (n: number): PartWhy => ({ rule: "guard_pieces", params: { runs: 1, coveredIn: g, pieceIn: gk.pieceIn, pieces: n } });
        acc.add({ key: `guardpiece.${type}.${r.profile}.${r.size}`, section: "guards", unit: "ea", use: "purchase", kind: "material", attrs: { part: "guard", guard: type, profile: r.profile, size: r.size, lengthIn: String(gk.pieceIn) } }, pieces, guardWhy(pieces));
        kitParts(gk.parts, "guards", pieces, { gutter: r }, undefined, undefined, { main: guardWhy, host: "guard" });
      } else advice.push({ code: "guard_kit_unknown", runId: r.id, guard: type });
    }

    // labor: install by story; tear-off; the kit's own labor (tile)
    acc.add({ key: `labor.install.story${storyKey(r.story)}`, section: "labor", unit: "ft", use: "estimate", kind: "labor", attrs: { work: "install", story: storyKey(r.story) } }, ft(len));
    if (r.tearOff) acc.add({ key: "labor.tearoff", section: "labor", unit: "ft", use: "estimate", kind: "labor", attrs: { work: "tearoff" } }, ft(len));
    if (kit?.laborWork) acc.add({ key: `labor.${kit.laborWork}`, section: "labor", unit: "ft", use: "estimate", kind: "labor", attrs: { work: kit.laborWork } }, ft(len));

    // expansion joints on long aluminum runs: advice, and a part if the company adds them
    if (r.material.startsWith("alu") && r.lengthIn > rules.expansionJointIn) {
      const n = Math.ceil(r.lengthIn / rules.expansionJointIn) - 1;
      advice.push({ code: "expansion_joint", runId: r.id, joints: n });
      if (rules.expansionJointPart) acc.add({ key: `expjoint.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "expansion_joint" } }, n, { rule: "expansion_joint", params: { runs: 1, lengthIn: r.lengthIn, everyIn: rules.expansionJointIn, joints: n }, setting: "expansionJointIn" });
    }
  }

  for (const c of input.corners) {
    if (c.method === "prefab") {
      acc.add({ key: `corner.${c.kind}.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(c), part: "miter", corner: c.kind } }, 1);
      joint("corner_prefab", c);
    } else {
      if (c.method === "strip") acc.add({ key: `stripmiter.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "purchase", kind: "material", attrs: { ...stockAttrs(c), part: "strip_miter" } }, 1);
      acc.add({ key: "labor.corner_cut", section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "corner_cut" } }, 1);
      addPurchase(c, c.kind === "out" ? rules.cutCornerOutAllowanceIn : rules.cutCornerAllowanceIn, c.kind === "out" ? "out" : "in"); // an outside corner takes more than an inside one or a bay (#1355)
      joint(c.method === "strip" ? "corner_strip" : "corner_cut", c);
    }
    if (c.splashGuard) acc.add({ key: `splashguard.${c.profile}.${c.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_guard", profile: c.profile, size: c.size } }, 1, { rule: "splash_guard_inside", params: { corners: 1 } });
  }

  const dsPerRun = new Map<string, number>();
  const sticksByKind = new Map<string, { attrs: Record<string, string>; lengths: number[] }>();
  const strips = new Map<string, { attrs: Record<string, string>; inches: Dec; straps: number; perStrapIn: number }>();
  for (const ds of input.downspouts) {
    const run = runs.get(ds.runId);
    if (!run) { advice.push({ code: "downspout_without_run", downspoutId: ds.id }); continue; }
    dsPerRun.set(run.id, (dsPerRun.get(run.id) ?? 0) + 1);
    if (ds.bottom.kind === "lower_roof" && run.story <= 1 && ds.heightIn === undefined) advice.push({ code: "lower_roof_from_first_story", downspoutId: ds.id });
    // the wall's length (fasteners) and the downspout's: bending on site eats downspout (§2.2), the estimate rounds it up (Д1)
    const lenIn = downspoutLengthIn(ds, run.story, rules);
    const fb = fieldBendOf(ds, rules);
    const pipeIn = lenIn + fb.addedIn;
    const billIn = dsRoundedIn(pipeIn, rules.dsRoundUpFt);
    const sz = [ds.shape, ds.size, ...(ds.dsStyle ? [ds.dsStyle] : [])].join(".");
    const color = ds.color ?? "-";
    const dsAttrs = { shape: ds.shape, size: ds.size, ...(ds.dsStyle ? { dsStyle: ds.dsStyle } : {}), material: ds.material, ...(ds.gauge ? { gauge: ds.gauge } : {}), ...(ds.finish ? { finish: ds.finish } : {}), ...(ds.color ? { color: ds.color } : {}) };
    const dsKey = [sz, ds.material, ...(ds.gauge ? [seg(ds.gauge)] : []), color].join(".");
    acc.add({ key: `ds.${dsKey}`, section: "downspouts", unit: "ft", use: "estimate", kind: "material", attrs: dsAttrs }, ft(dec(billIn)),
      billIn !== pipeIn ? { rule: "ds_round_up", params: { downspouts: 1, lengthIn: pipeIn, stepFt: rules.dsRoundUpFt, ft: billIn / 12 }, setting: "dsRoundUpFt" } : undefined);
    const kind = sticksByKind.get(dsKey);
    if (kind) kind.lengths.push(pipeIn);
    else sticksByKind.set(dsKey, { attrs: { ...dsAttrs, stickIn: String(rules.dsStickIn) }, lengths: [pipeIn] });
    if (fb.bends > 0)
      acc.add({ key: "labor.bend", section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "bend" } }, fb.bends,
        { rule: "bend_in_place", params: { downspouts: 1, bends: fb.bends, perBendIn: fb.perBendIn, addedIn: fb.addedIn }, setting: "bendInBySize" });

    // wall fasteners: the kit for this shape and wall, 2 per 10 ft
    const wall = ds.wall ?? rules.defaultWall;
    const wallKitId = rules.wallKitByWall[ds.shape]?.[wall] ?? wall;
    const wk = rules.wallKits[wallKitId];
    const fasteners = Math.max(1, Math.ceil(lenIn / rules.dsFastenerSpacingIn));
    if (wk) kitParts(wk.parts, "fasteners", fasteners, { ds }, strips, ds.id, { main: (n) => ({ rule: "ds_straps_per_ds", params: { downspouts: 1, lengthIn: lenIn, everyIn: rules.dsFastenerSpacingIn, straps: n }, setting: "dsFastenerSpacingIn" }), host: wk.parts.find((x) => x.use === "both")?.part ?? (wk.parts.some((x) => x.stripInBySize) ? "flat_coil" : "ds_strap"), wall });
    else advice.push({ code: "wall_kit_unknown", downspoutId: ds.id, wall });

    if (ds.endOutlet && endOutlets.get(`${run.id}:${ds.endOutlet === "start" ? 0 : 1}`) === ds.id) {
      acc.add({ key: `endoutlet.${stockKey(run)}.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(run), part: "end_outlet", gutterSize: run.size, shape: ds.shape, size: ds.size } }, 1, { rule: "outlet_per_ds", params: { downspouts: 1 } });
    } else {
      acc.add({ key: `outlet.${stockKey(run)}.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(run), part: "outlet", gutterSize: run.size, shape: ds.shape, size: ds.size } }, 1, { rule: "outlet_per_ds", params: { downspouts: 1 } });
    }
    joint("outlet", run);

    // downspout joints: every stick, elbow, offset, reducer and the bottom piece joins the one above; a bend on site is no piece
    // and no part (§2.1 п.3, п.5)
    let pieces = Math.ceil(pipeIn / rules.dsStickIn);
    const ready = bendOf(ds) === "ready";
    for (const e of ready ? ds.elbows ?? defaultElbowsFor(ds, rules) : []) {
      if (e.qty <= 0) continue;
      pieces += e.qty;
      acc.add({ key: `elbow.${e.style}.${dsKey}`, section: "downspouts", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "elbow", style: e.style } }, e.qty);
    }
    for (const o of ready ? ds.offsets ?? defaultOffsetsFor(ds, rules) : []) {
      if (o.qty <= 0) continue;
      pieces += o.qty;
      const std = rules.stdOffsetsIn.includes(o.lengthIn);
      acc.add({ key: `offset.${o.lengthIn}.${dsKey}`, section: "downspouts", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "offset", lengthIn: String(o.lengthIn), ...(std ? {} : { custom: "1" }) } }, o.qty);
    }
    for (const rd of ds.reducers ?? []) {
      if (rd.qty <= 0) continue;
      pieces += rd.qty;
      acc.add({ key: `reducer.${rd.to}.${dsKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "reducer", to: rd.to } }, rd.qty);
    }
    const head = ds.head ?? (ds.funnel ? "funnel" : undefined);
    if (head === "funnel") acc.add({ key: `funnel.${dsKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "funnel" } }, 1);
    if (head === "conductor") acc.add({ key: `conductorhead.${dsKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "conductor_head" } }, 1);
    if (ds.diverter) acc.add({ key: `diverter.${dsKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "diverter" } }, 1);
    if (ds.eaveBox) acc.add({ key: `eavebox.${ds.eaveBox}.${dsKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "eave_box", eaveBox: ds.eaveBox } }, 1);
    if (ds.outletScreen) acc.add({ key: `outletscreen.${ds.shape}.${ds.size}`, section: "guards", unit: "ea", use: "both", kind: "material", attrs: { part: "outlet_screen", shape: ds.shape, size: ds.size } }, 1);

    const b = ds.bottom;
    const bc = b.color ? `.${b.color}` : "";
    const bAttrs = { shape: ds.shape, size: ds.size, ...(b.color ? { color: b.color } : {}) };
    if (b.kind === "extension" || b.kind === "splash_block") {
      acc.add({ key: `bottom.${b.kind}.${ds.shape}.${ds.size}${bc}`, section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: b.kind, ...bAttrs } }, 1);
      if (b.kind === "extension") pieces += 1;
    } else if (b.kind === "flex" || b.kind === "drain") {
      acc.add({ key: `bottom.${b.kind}.${ds.shape}.${ds.size}${bc}`, section: "ds_bottom", unit: "ft", use: "both", kind: "material", attrs: { part: b.kind, ...bAttrs } }, ft(dec(b.lengthIn ?? 0)));
      pieces += 1;
      if (b.kind === "drain") acc.add({ key: `bottom.drain_adapter.${ds.shape}.${ds.size}${b.pipe ? `.${b.pipe}` : ""}`, section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "drain_adapter", shape: ds.shape, size: ds.size, ...(b.pipe ? { pipe: b.pipe } : {}) } }, 1, { rule: "adapter_per_bottom", params: { part: "drain_adapter", bottoms: 1 } });
    } else if (b.kind === "lower_roof") {
      acc.add({ key: "bottom.splash_pan", section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_pan" } }, 1);
    }
    joint("ds", ds, pieces);
    acc.add({ key: `labor.downspout.story${storyKey(run.story)}`, section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "downspout", story: storyKey(run.story) } }, 1);
  }

  for (const { attrs, lengths } of sticksByKind.values()) {
    const key = `dsstick.${[attrs.shape, attrs.size, ...(attrs.dsStyle ? [attrs.dsStyle] : []), attrs.material, ...(attrs.gauge ? [seg(attrs.gauge)] : []), attrs.color ?? "-"].join(".")}`;
    const sticks = downspoutSticks(lengths, rules.dsStickIn, rules.dsShareOffcuts);
    acc.add({ key, section: "downspouts", unit: "ea", use: "purchase", kind: "material", attrs }, sticks, { rule: "ds_sticks", params: { downspouts: lengths.length, lengthIn: lengths.reduce((a, b) => a + b, 0), stickIn: rules.dsStickIn, shared: rules.dsShareOffcuts ? 1 : 0, sticks }, setting: "dsStickIn" });
  }
  for (const [key, { attrs, inches, straps, perStrapIn }] of strips) {
    const f = ft(inches).ceil();
    acc.add({ key, section: "fasteners", unit: "ft", use: "purchase", kind: "material", attrs }, f, { rule: "flat_coil_straps", params: { straps, perStrapIn, ft: f.toNumber() } });
  }

  const dsById = new Map(input.downspouts.map((d) => [d.id, d]));
  for (const w of input.wyes ?? []) {
    const [a, b] = w.dsIds.map((id) => dsById.get(id));
    if (!a || !b) { advice.push({ code: "wye_downspout_missing", wyeId: w.id }); continue; }
    if (a === b) { advice.push({ code: "wye_same_downspout", wyeId: w.id }); continue; }
    if (a.shape !== b.shape || a.size !== b.size) advice.push({ code: "wye_sizes_differ", wyeId: w.id });
    const wKey = [b.shape, b.size, ...(b.dsStyle ? [b.dsStyle] : []), b.material, ...(b.gauge ? [seg(b.gauge)] : []), b.color ?? "-"].join(".");
    acc.add({ key: `wye.${wKey}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "wye", shape: b.shape, size: b.size, material: b.material, ...(b.color ? { color: b.color } : {}) } }, 1);
  }

  for (const ch of input.chains ?? []) {
    const run = runs.get(ch.runId);
    if (!run) continue;
    dsPerRun.set(run.id, (dsPerRun.get(run.id) ?? 0) + 1);
    const len = dec(ch.lengthIn ?? ch.story * rules.storyHeightIn);
    acc.add({ key: "rainchain", section: "downspouts", unit: "ft", use: "both", kind: "material", attrs: { part: "rain_chain" } }, ft(len));
    acc.add({ key: `rainchain_adapter.${run.profile}.${run.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "rain_chain_adapter", profile: run.profile, size: run.size } }, 1, { rule: "adapter_per_bottom", params: { part: "rain_chain_adapter", bottoms: 1 } });
  }

  for (const r of input.runs) {
    const n = dsPerRun.get(r.id) ?? 0;
    if (n === 0 && !r.ends.some((e) => e.kind !== "cap")) advice.push({ code: "run_without_downspout", runId: r.id });
    if (n > 0 && r.lengthIn > n * rules.maxRunPerDownspoutIn) advice.push({ code: "run_long_for_downspouts", runId: r.id, lengthIn: r.lengthIn, downspouts: n });
  }

  // purchase: gutter stock with corner allowance and waste, whole feet (seamless coil) or sections.
  // Waste (#1355, founder 14.11: «на каждый вид желоба берём 10 фит запас»): a FIXED length for every stock (profile, size, material, gauge, colour — each coil or
  // section line); 0 — none.
  for (const b of purchaseIn.values()) {
    const { stock, inches: base } = b;
    const wasteIn = dec(rules.wasteFt).mul(12);
    const inches = base.add(wasteIn);
    const attrs = stockAttrs(stock);
    // the line's inches by where they come from (§2.12: drawn + corners + reserve = the line before rounding up), and why — the reserve,
    // and the corner allowances when there are any
    const breakdown: CoilBreakdown = { drawnIn: b.drawnIn, cornersIn: b.cornersIn, wasteIn: wasteIn.toNumber() };
    const corners: PartWhy[] = b.outN + b.inN > 0 ? [{ rule: "corner_allowance", params: { outCount: b.outN, outIn: rules.cutCornerOutAllowanceIn, inCount: b.inN, inIn: rules.cutCornerAllowanceIn } }] : [];
    const why: PartWhy = { rule: "coil_reserve", params: { runs: b.runs, reserveFt: Number(rules.wasteFt) }, setting: "wasteFt", ...(corners.length ? { also: corners } : {}) };
    if (rules.seamless) {
      const blank = rules.coilBlankIn[`${stock.profile}.${stock.size}`];
      acc.add({ key: `coil.${stockKey(stock)}`, section: "gutter", unit: "ft", use: "purchase", kind: "material", attrs: { ...attrs, buy: "coil", ...(blank ? { blankIn: blank } : {}) }, coilBreakdown: breakdown }, ft(inches).ceil(), why);
    } else {
      acc.add({ key: `section.${stockKey(stock)}`, section: "gutter", unit: "ea", use: "purchase", kind: "material", attrs: { ...attrs, buy: "section", lengthIn: String(rules.sectionLengthIn) }, coilBreakdown: breakdown }, inches.div(rules.sectionLengthIn).ceil(), why);
    }
  }

  // consumables
  // a tube is one color: tubes by color (mill / unpainted joints: plain sealant, the key of older versions)
  for (const [c, pts] of [...sealantPts].sort(([a], [b]) => a.localeCompare(b)))
    if (pts > 0)
      acc.add({ key: c === "-" ? "sealant" : `sealant.${seg(c)}`, section: "consumables", unit: "ea", use: "both", kind: "material", attrs: { part: "sealant", ...(c !== "-" ? { color: c } : {}) } }, Math.ceil(pts / rules.jointsPerSealantTube),
        withParams(sealantWhy.get(c), { points: pts, perTube: rules.jointsPerSealantTube, tubes: Math.ceil(pts / rules.jointsPerSealantTube) }, "jointsPerSealantTube"));
  if (solderPts > 0) {
    const lb = Math.ceil(solderPts / rules.solderPointsPerLb);
    acc.add({ key: "solder", section: "consumables", unit: "lb", use: "purchase", kind: "material", attrs: { part: "solder" } }, lb, withParams(solderWhy, { points: solderPts, perLb: rules.solderPointsPerLb, lb }, "solderPointsPerLb"));
    acc.add({ key: "flux", section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "flux" } }, 1, { rule: "flux_per_solder", params: { lb, perJob: 1, cans: 1 } });
  }
  if (rules.touchUpPaint) for (const c of paintColors) acc.add({ key: `paint.${c}`, section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "touch_up_paint", color: c } }, 1, { rule: "touch_up_per_color", params: { color: c }, setting: "touchUpPaint" });

  return { parts: acc.list(), advice };
}

/* ---------------- Sizing advice (spec П4; SMACNA / IPC) ---------------- */

/** Pitch factor for the plan (horizontal) roof area: rise per 12. */
export function pitchFactor(risePer12: DecLike): Dec {
  const r = dec(risePer12);
  if (r.lte(3)) return dec("1.00");
  if (r.lte(5)) return dec("1.05");
  if (r.lte(8)) return dec("1.10");
  if (r.lte(11)) return dec("1.20");
  return dec("1.30");
}

export interface SizingRules {
  /** capacity in sq ft of roof at 1 in/hr rain, by gutter size key (e.g. "k5", "k6") */
  gutterCapacity: Record<string, DecLike>;
  /** rule of thumb: sq ft of (pitch-adjusted) roof one downspout drains, by size key — not scaled by rain; «проверить» */
  downspoutCapacity: Record<string, DecLike>;
}

/** Defaults from the research (This Old House / SMACNA rule of thumb); companies override. Marked «проверить» in the spec. */
export const DEFAULT_SIZING: SizingRules = {
  gutterCapacity: { k5: 5520, k6: 7960 },
  downspoutCapacity: { "2x3": 600, "3x4": 1200 },
};

export interface SizingAdvice {
  /** plan area × pitch factor × rain, sq ft·in/hr */
  load: Dec;
  /** smallest gutter that carries the load, or null if none does */
  gutter: string | null;
  /** downspouts needed per downspout size: max(by adjusted area, by run length, 1) */
  downspouts: Record<string, number>;
}

/**
 * One gutter run: the plan area that drains into it, the roof pitch, the design rain (in/hr) and the run length.
 * Per-company basis: SMACNA 5-min/10-yr (cautious) or code 60-min/100-yr.
 */
export function sizeGutterRun(a: { planAreaSqFt: DecLike; risePer12: DecLike; rainInHr: DecLike; runLengthIn: number }, rules: GutterRules = DEFAULT_GUTTER_RULES, sizing: SizingRules = DEFAULT_SIZING): SizingAdvice {
  const area = dec(a.planAreaSqFt).mul(pitchFactor(a.risePer12));
  const load = area.mul(dec(a.rainInHr));
  const fits = Object.entries(sizing.gutterCapacity)
    .map(([k, v]) => [k, dec(v)] as const)
    .sort((x, y) => x[1].comparedTo(y[1]))
    .find(([, cap]) => cap.gte(load));
  const byLength = Math.ceil(a.runLengthIn / rules.maxRunPerDownspoutIn);
  const downspouts: Record<string, number> = {};
  for (const [k, v] of Object.entries(sizing.downspoutCapacity)) {
    downspouts[k] = Math.max(area.div(dec(v)).ceil().toNumber(), byLength, 1);
  }
  return { load: load.toDecimalPlaces(2, D.ROUND_HALF_UP), gutter: fits ? fits[0] : null, downspouts };
}
