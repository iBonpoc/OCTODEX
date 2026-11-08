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
  /** waste for the purchase: "0.05" = 5% (0..1) */
  wastePct: DecLike;
  /** extra gutter a field-cut corner uses, inches (a prefab corner uses none) */
  cutCornerAllowanceIn: number;
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
  /** hangers per run = ceil(length / spacing) + this (1 = a hanger at both ends) */
  hangerExtraPerRun: number;
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
  defaultElbows: { style: string; qty: number }[];
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
  wastePct: "0.05",
  cutCornerAllowanceIn: 6,
  dsStickIn: 120,
  dsShareOffcuts: true,
  dsExtensionIn: 0,
  seamless: true,
  sectionLengthIn: 120,
  coilBlankIn: { "k.5": "11.875", "k.6": "15" },
  hangerKits: DEFAULT_HANGER_KITS,
  hangerSpacingIn: {},
  hangerExtraPerRun: 0,
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
  };
  r.woodScrew = { ...r.woodScrew, washer: r.woodScrew.washer === true };
  if (typeof r.sealantByColor !== "boolean") r.sealantByColor = d.sealantByColor;
  if (typeof r.woodScrew.screw !== "string" || !r.woodScrew.screw.trim()) r.woodScrew = { ...r.woodScrew, screw: d.woodScrew.screw };
  if (typeof r.anchor !== "string" || !r.anchor.trim()) r.anchor = d.anchor;
  for (const k of POSITIVE) if (!okPos(r[k])) (r as unknown as Record<string, unknown>)[k] = d[k];
  if (!Number.isInteger(r.hangerExtraPerRun) || r.hangerExtraPerRun < 0) r.hangerExtraPerRun = 0;
  if (!Number.isInteger(r.dsExtensionIn) || r.dsExtensionIn < 0) r.dsExtensionIn = 0;
  if (!Number.isInteger(r.cutCornerAllowanceIn) || r.cutCornerAllowanceIn < 0) r.cutCornerAllowanceIn = d.cutCornerAllowanceIn;
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

class Acc {
  private m = new Map<string, PartQty & { _q: Dec }>();
  add(p: Omit<PartQty, "qty">, q: DecLike) {
    const cur = this.m.get(p.key);
    if (cur) cur._q = cur._q.add(dec(q));
    else this.m.set(p.key, { ...p, qty: "", _q: dec(q) });
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
  const waste = dec(1).add(dec(rules.wastePct));

  /* joints: rivets by metal and color, sealant or solder points, touch-up colors */
  const sealantPts = new Map<string, number>();
  let solderPts = 0;
  const paintColors = new Set<string>();
  const joint = (kind: JointKind, s: { material: string; finish?: string; color?: string }, n = 1) => {
    if (n <= 0) return;
    const j = rules.joints[kind];
    const finish = painted(s) ? "painted" : "mill";
    const metal = metalOf(s.material);
    const color = finish === "painted" && s.color ? s.color : "-";
    if (kind === "ds" && rules.dsJoin === "screw") {
      acc.add({ key: "screw.8x05", section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "screw", screw: "8x0.5" } }, j.rivets * n);
    } else if (j.rivets > 0) {
      acc.add({ key: `rivet.42.${metal}.${finish}.${color}`, section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "rivet", rivet: "42", material: metal, finish, ...(color !== "-" ? { color } : {}) } }, j.rivets * n);
    }
    if (rules.solderedMaterials.includes(s.material)) solderPts += j.sealant * n;
    else if (j.sealant > 0) {
      const sc = rules.sealantByColor ? color : "-";
      sealantPts.set(sc, (sealantPts.get(sc) ?? 0) + j.sealant * n);
    }
    if (j.paint && finish === "painted" && s.color) paintColors.add(s.color);
  };

  const kitParts = (parts: KitPart[], section: GutterSection, n: DecLike, ctx: KitCtx, strips?: Map<string, { attrs: Record<string, string>; inches: Dec }>, dsId?: string) => {
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
        if (cur) cur.inches = cur.inches.add(inches);
        else strips.set(key, { attrs, inches });
        continue;
      }
      acc.add({ key, section: CONSUMABLE_PARTS.has(p.part) ? "consumables" : section, unit: "ea", use: p.use ?? "purchase", kind: "material", attrs }, dec(n).mul(p.per));
    }
  };

  /* gutter by stock: the client sees the installed length; the supplier gets length + corners + waste */
  const purchaseIn = new Map<string, { stock: GutterStock; inches: Dec }>();
  const addPurchase = (s: GutterStock, inches: DecLike) => {
    const k = stockKey(s);
    const cur = purchaseIn.get(k);
    if (cur) cur.inches = cur.inches.add(dec(inches));
    else purchaseIn.set(k, { stock: s, inches: dec(inches) });
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
    addPurchase(r, len);
    if (!rules.seamless) {
      const joins = Math.max(Math.ceil(r.lengthIn / rules.sectionLengthIn) - 1, 0);
      if (joins > 0) {
        acc.add({ key: `slipjoint.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "slip_joint" } }, joins);
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
        acc.add({ key: `endcap.${side}.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "end_cap", side } }, 1);
      } else {
        acc.add({ key: `endcap.-.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "end_cap" } }, 1);
      }
      joint("endcap", r);
    });

    // hangers: the kit's parts × ceil(length / spacing) (+ one per run if the company wants hangers at both ends)
    const kit = rules.hangerKits[r.hanger];
    const spacing = [r.hangerSpacingIn, rules.hangerSpacingIn[r.hanger], kit?.spacingIn].find(okPos) ?? 24;
    const hangers = len.div(spacing).ceil().add(rules.hangerExtraPerRun);
    if (kit) kitParts(kit.parts, "fasteners", hangers, { gutter: r, kitId: r.hanger });
    else {
      advice.push({ code: "hanger_kit_unknown", runId: r.id, hanger: r.hanger });
      acc.add({ key: `hanger.${seg(r.hanger)}.${r.profile}.${r.size}`, section: "fasteners", unit: "ea", use: "both", kind: "material", attrs: { part: "hanger", hanger: r.hanger, profile: r.profile, size: r.size } }, hangers);
    }
    if (r.wedges) acc.add({ key: `wedge.${r.profile}.${r.size}`, section: "fasteners", unit: "ea", use: "purchase", kind: "material", attrs: { part: "wedge", profile: r.profile, size: r.size } }, hangers);

    if (r.guardsIn && r.guardsIn > 0) {
      const g = Math.min(r.guardsIn, r.lengthIn);
      const type = r.guardType ?? rules.defaultGuard;
      acc.add({ key: `guard.${type}.${r.profile}.${r.size}`, section: "guards", unit: "ft", use: "estimate", kind: "material", attrs: { guard: type, profile: r.profile, size: r.size } }, ft(dec(g)));
      const gk = rules.guardKits[type];
      if (gk && okPos(gk.pieceIn)) {
        const pieces = Math.ceil(g / gk.pieceIn);
        acc.add({ key: `guardpiece.${type}.${r.profile}.${r.size}`, section: "guards", unit: "ea", use: "purchase", kind: "material", attrs: { part: "guard", guard: type, profile: r.profile, size: r.size, lengthIn: String(gk.pieceIn) } }, pieces);
        kitParts(gk.parts, "guards", pieces, { gutter: r });
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
      if (rules.expansionJointPart) acc.add({ key: `expjoint.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), part: "expansion_joint" } }, n);
    }
  }

  for (const c of input.corners) {
    if (c.method === "prefab") {
      acc.add({ key: `corner.${c.kind}.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(c), part: "miter", corner: c.kind } }, 1);
      joint("corner_prefab", c);
    } else {
      if (c.method === "strip") acc.add({ key: `stripmiter.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "purchase", kind: "material", attrs: { ...stockAttrs(c), part: "strip_miter" } }, 1);
      acc.add({ key: "labor.corner_cut", section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "corner_cut" } }, 1);
      addPurchase(c, rules.cutCornerAllowanceIn);
      joint(c.method === "strip" ? "corner_strip" : "corner_cut", c);
    }
    if (c.splashGuard) acc.add({ key: `splashguard.${c.profile}.${c.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_guard", profile: c.profile, size: c.size } }, 1);
  }

  const dsPerRun = new Map<string, number>();
  const sticksByKind = new Map<string, { attrs: Record<string, string>; lengths: number[] }>();
  const strips = new Map<string, { attrs: Record<string, string>; inches: Dec }>();
  for (const ds of input.downspouts) {
    const run = runs.get(ds.runId);
    if (!run) { advice.push({ code: "downspout_without_run", downspoutId: ds.id }); continue; }
    dsPerRun.set(run.id, (dsPerRun.get(run.id) ?? 0) + 1);
    if (ds.bottom.kind === "lower_roof" && run.story <= 1 && ds.heightIn === undefined) advice.push({ code: "lower_roof_from_first_story", downspoutId: ds.id });
    const lenIn = downspoutLengthIn(ds, run.story, rules);
    const len = dec(lenIn);
    const sz = [ds.shape, ds.size, ...(ds.dsStyle ? [ds.dsStyle] : [])].join(".");
    const color = ds.color ?? "-";
    const dsAttrs = { shape: ds.shape, size: ds.size, ...(ds.dsStyle ? { dsStyle: ds.dsStyle } : {}), material: ds.material, ...(ds.gauge ? { gauge: ds.gauge } : {}), ...(ds.finish ? { finish: ds.finish } : {}), ...(ds.color ? { color: ds.color } : {}) };
    const dsKey = [sz, ds.material, ...(ds.gauge ? [seg(ds.gauge)] : []), color].join(".");
    acc.add({ key: `ds.${dsKey}`, section: "downspouts", unit: "ft", use: "estimate", kind: "material", attrs: dsAttrs }, ft(len));
    const kind = sticksByKind.get(dsKey);
    if (kind) kind.lengths.push(lenIn);
    else sticksByKind.set(dsKey, { attrs: { ...dsAttrs, stickIn: String(rules.dsStickIn) }, lengths: [lenIn] });

    // wall fasteners: the kit for this shape and wall, 2 per 10 ft
    const wall = ds.wall ?? rules.defaultWall;
    const wallKitId = rules.wallKitByWall[ds.shape]?.[wall] ?? wall;
    const wk = rules.wallKits[wallKitId];
    const fasteners = Math.max(1, Math.ceil(lenIn / rules.dsFastenerSpacingIn));
    if (wk) kitParts(wk.parts, "fasteners", fasteners, { ds }, strips, ds.id);
    else advice.push({ code: "wall_kit_unknown", downspoutId: ds.id, wall });

    if (ds.endOutlet && endOutlets.get(`${run.id}:${ds.endOutlet === "start" ? 0 : 1}`) === ds.id) {
      acc.add({ key: `endoutlet.${stockKey(run)}.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(run), part: "end_outlet", gutterSize: run.size, shape: ds.shape, size: ds.size } }, 1);
    } else {
      acc.add({ key: `outlet.${stockKey(run)}.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(run), part: "outlet", gutterSize: run.size, shape: ds.shape, size: ds.size } }, 1);
    }
    joint("outlet", run);

    // downspout joints: every stick, elbow, offset, reducer and the bottom piece joins the one above
    let pieces = Math.ceil(lenIn / rules.dsStickIn);
    for (const e of ds.elbows ?? rules.defaultElbows) {
      if (e.qty <= 0) continue;
      pieces += e.qty;
      acc.add({ key: `elbow.${e.style}.${dsKey}`, section: "downspouts", unit: "ea", use: "both", kind: "material", attrs: { ...dsAttrs, part: "elbow", style: e.style } }, e.qty);
    }
    for (const o of ds.offsets ?? []) {
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
      if (b.kind === "drain") acc.add({ key: `bottom.drain_adapter.${ds.shape}.${ds.size}${b.pipe ? `.${b.pipe}` : ""}`, section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "drain_adapter", shape: ds.shape, size: ds.size, ...(b.pipe ? { pipe: b.pipe } : {}) } }, 1);
    } else if (b.kind === "lower_roof") {
      acc.add({ key: "bottom.splash_pan", section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_pan" } }, 1);
    }
    joint("ds", ds, pieces);
    acc.add({ key: `labor.downspout.story${storyKey(run.story)}`, section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "downspout", story: storyKey(run.story) } }, 1);
  }

  for (const { attrs, lengths } of sticksByKind.values()) {
    const key = `dsstick.${[attrs.shape, attrs.size, ...(attrs.dsStyle ? [attrs.dsStyle] : []), attrs.material, ...(attrs.gauge ? [seg(attrs.gauge)] : []), attrs.color ?? "-"].join(".")}`;
    acc.add({ key, section: "downspouts", unit: "ea", use: "purchase", kind: "material", attrs }, downspoutSticks(lengths, rules.dsStickIn, rules.dsShareOffcuts));
  }
  for (const [key, { attrs, inches }] of strips) {
    acc.add({ key, section: "fasteners", unit: "ft", use: "purchase", kind: "material", attrs }, ft(inches).ceil());
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
    acc.add({ key: `rainchain_adapter.${run.profile}.${run.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "rain_chain_adapter", profile: run.profile, size: run.size } }, 1);
  }

  for (const r of input.runs) {
    const n = dsPerRun.get(r.id) ?? 0;
    if (n === 0 && !r.ends.some((e) => e.kind !== "cap")) advice.push({ code: "run_without_downspout", runId: r.id });
    if (n > 0 && r.lengthIn > n * rules.maxRunPerDownspoutIn) advice.push({ code: "run_long_for_downspouts", runId: r.id, lengthIn: r.lengthIn, downspouts: n });
  }

  // purchase: gutter stock with corner allowance and waste, whole feet (seamless coil) or sections
  for (const { stock, inches } of purchaseIn.values()) {
    const attrs = stockAttrs(stock);
    if (rules.seamless) {
      const blank = rules.coilBlankIn[`${stock.profile}.${stock.size}`];
      acc.add({ key: `coil.${stockKey(stock)}`, section: "gutter", unit: "ft", use: "purchase", kind: "material", attrs: { ...attrs, buy: "coil", ...(blank ? { blankIn: blank } : {}) } }, ft(inches.mul(waste)).ceil());
    } else {
      acc.add({ key: `section.${stockKey(stock)}`, section: "gutter", unit: "ea", use: "purchase", kind: "material", attrs: { ...attrs, buy: "section", lengthIn: String(rules.sectionLengthIn) } }, inches.mul(waste).div(rules.sectionLengthIn).ceil());
    }
  }

  // consumables
  // a tube is one color: tubes by color (mill / unpainted joints: plain sealant, the key of older versions)
  for (const [c, pts] of [...sealantPts].sort(([a], [b]) => a.localeCompare(b)))
    if (pts > 0)
      acc.add({ key: c === "-" ? "sealant" : `sealant.${seg(c)}`, section: "consumables", unit: "ea", use: "both", kind: "material", attrs: { part: "sealant", ...(c !== "-" ? { color: c } : {}) } }, Math.ceil(pts / rules.jointsPerSealantTube));
  if (solderPts > 0) {
    acc.add({ key: "solder", section: "consumables", unit: "lb", use: "purchase", kind: "material", attrs: { part: "solder" } }, Math.ceil(solderPts / rules.solderPointsPerLb));
    acc.add({ key: "flux", section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "flux" } }, 1);
  }
  if (rules.touchUpPaint) for (const c of paintColors) acc.add({ key: `paint.${c}`, section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "touch_up_paint", color: c } }, 1);

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
