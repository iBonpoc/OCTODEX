/**
 * The company's Gutters settings (docs/specs/33-gutters-settings.md П22, M7b): what the company installs, its colour
 * palette and the defaults of a new run and downspout. Stored in company_modules.settings (≤ 32 KB, owner / admin, only
 * while the module is active — module_save_settings). Pure.
 *
 * The stored object holds only what the company touched: a field it never changed is absent and follows the module's
 * default. «What we install» is stored as what the company does NOT install (`off`), so a size the module adds later
 * shows up by itself. Reading never trusts it (any admin, any old app version wrote it): a field of the wrong type or an
 * unknown value is ignored and the default is used. Writing changes one field over the stored object as it is — every
 * other key and value, also the ones this version does not know (a newer version's sizes, kits, sections), and `v`
 * stay untouched (review #372 №2–3): an older phone never deletes a newer phone's settings.
 */
import {
  DEFAULT_GUARD_KITS, DEFAULT_GUTTER_RULES, DEFAULT_HANGER_BY_MOUNT, DEFAULT_HANGER_KITS, DEFAULT_JOINTS, DEFAULT_WALL_KITS, GUTTER_MOUNTS, type DsBottomKind, type GutterMount, type GutterProfile,
  type GutterRulesOverride, type JointKind,
  ANCHORS,
  DEFAULT_SPIKE_LENGTH_IN,
  SPIKE_LENGTHS,
  WOOD_SCREW,
  WOOD_SCREWS,
} from "@octo/estimating-engine";
import { isLenFormat, type LenFormat } from "./canvas/format";
import { COLORS, DS_BOTTOMS, DS_SHAPES, DS_SIZES, DS_STYLES, GAUGES_BY_MATERIAL, MATERIALS, MILL_ONLY, PROFILES, SIZES_BY_PROFILE, WALL_KITS_BY_WALL, wallValue, WALLS, type Wall } from "./canvas/attrs";

export type DsShape = (typeof DS_SHAPES)[number];

/** what the company installs: the attribute panel offers only these (an element's own value always stays, П22.2 №7) */
export interface Offer {
  profiles: GutterProfile[];
  sizes: Record<GutterProfile, string[]>;
  materials: string[];
  gauges: Record<string, string[]>;
  hangers: string[];
  dsSizes: Record<DsShape, string[]>;
  dsStyles: (typeof DS_STYLES)[number][];
  bottoms: DsBottomKind[];
  wallKits: string[];
}

export interface RunDefaults {
  profile: GutterProfile;
  size: string;
  material: string;
  gauge?: string;
  finish: "mill" | "painted";
  color?: string;
  mount: GutterMount;
}
export interface DsDefaults {
  shape: DsShape;
  size: string;
  dsStyle: (typeof DS_STYLES)[number];
  material: string;
  gauge?: string;
  finish: "mill" | "painted";
  color?: string;
  bottom: DsBottomKind;
  wall: Wall;
}

/** everything the canvas needs from the settings, resolved and valid */
export interface Choices {
  offer: Offer;
  /** colour names: words, never swatches (rule 2) */
  palette: string[];
  /** hanger kit by profile and roof edge (spec П18.6) */
  hangerByMount: Record<GutterProfile, Record<GutterMount, string>>;
  /** wall kit by downspout shape and wall (spec П18.7) */
  wallKitByWall: Record<DsShape, Record<Wall, string>>;
  run: RunDefaults;
  ds: DsDefaults;
  /** how every length is shown (#1092): feet-inches by default */
  lenFormat: LenFormat;
  /** how far the roof stands out past the wall, ft (#932): for the roof / 3D view; kept and shown, the gutter's cut does not use it yet */
  roofOverhangFt: number;
  /** the company chose a downspout size itself (the key is stored): it stays on a 6″ gutter too (#767) */
  dsSizeSet: boolean;
}

/** the supplier palettes from the founder's reference (docs/prototypes/gutters-ref/README.md): names, no prices */
export const PALETTES = {
  berger: ["Natural Clay", "Musket Brown A", "Royal Brown", "AMP Dark Bronze", "Black", "Grecian Green", "Dark Bronze", "80 White"],
  servicePartners: [
    "High Gloss White", "Satin", "Linen", "Low Gloss White", "Almond", "Crème", "Sandcastle", "Ivory", "Wicker", "Clay", "Wood Beige", "Buckskin Brown",
    "Colonial Grey", "Dark Grey", "Terratone", "Tuxedo Grey", "Royal Brown", "Musket Brown", "Harvest Brown", "Bronze", "Black", "Blue", "Green", "Red",
  ],
} as const;
export const MAX_PALETTE = 60;
export const MAX_COLOR_LEN = 40;
/** what module_save_settings takes (bytes of the JSON; Postgres counts its own jsonb a little differently — a margin) */
export const MAX_SETTINGS_BYTES = 30 * 1024;

const ALL_HANGERS = Object.keys(DEFAULT_HANGER_KITS);
const ALL_WALL_KITS = Object.keys(DEFAULT_WALL_KITS);
const roundFamily = (p: string) => p === "half_round" || p === "euro";
/** hanger kits of a profile's family: the half-round kits (hr_…) hang half round and euro, the rest K, fascia and box */
export const familyKits = (profile: string, kits: readonly string[] = ALL_HANGERS) => kits.filter((id) => id.startsWith("hr_") === roundFamily(profile));

export const MODULE_OFFER: Offer = {
  profiles: [...PROFILES],
  sizes: Object.fromEntries(PROFILES.map((p) => [p, [...SIZES_BY_PROFILE[p]]])) as Record<GutterProfile, string[]>,
  materials: [...MATERIALS],
  gauges: Object.fromEntries(Object.entries(GAUGES_BY_MATERIAL).map(([m, g]) => [m, [...g]])),
  hangers: ALL_HANGERS,
  dsSizes: { rect: [...DS_SIZES.rect], round: [...DS_SIZES.round] },
  dsStyles: [...DS_STYLES],
  bottoms: [...DS_BOTTOMS],
  wallKits: ALL_WALL_KITS,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** what is offered: the module's values minus what the company switched off; all off (a broken store) → all */
function subset<K extends string>(off: unknown, known: readonly K[]): K[] {
  if (!Array.isArray(off)) return [...known];
  const got = known.filter((k) => !off.includes(k));
  return got.length ? got : [...known];
}
const one = <K extends string>(v: unknown, list: readonly K[], fallback: K): K => ((list as readonly unknown[]).includes(v) ? (v as K) : list.includes(fallback) ? fallback : list[0] ?? fallback);
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f]/;

/** a colour name as the company typed it: trimmed, 1..40 characters, no control characters; else null */
export function colorName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (CTRL.test(v)) return null;
  const s = v.trim().replace(/ +/g, " ");
  return s && s.length <= MAX_COLOR_LEN ? s : null;
}
/** the palette: names, no repeats (case ignored), at most 60; none → the module's words */
export function readPalette(v: unknown): string[] {
  if (!Array.isArray(v)) return [...COLORS];
  const out: string[] = [];
  for (const x of v) {
    const n = colorName(x);
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
    if (out.length >= MAX_PALETTE) break;
  }
  return out.length ? out : [...COLORS];
}

function readOffer(raw: Record<string, unknown>): Offer {
  const o = obj(raw.off);
  const sz = obj(o.sizes);
  const ga = obj(o.gauges);
  const ds = obj(o.dsSizes);
  return {
    profiles: subset(o.profiles, PROFILES),
    sizes: Object.fromEntries(PROFILES.map((p) => [p, subset(sz[p], SIZES_BY_PROFILE[p])])) as Record<GutterProfile, string[]>,
    materials: subset(o.materials, MATERIALS),
    // a material without thicknesses (zinc) stays empty: there is nothing to choose
    gauges: Object.fromEntries(Object.entries(GAUGES_BY_MATERIAL).map(([m, g]) => [m, g.length ? subset(ga[m], g) : []])),
    hangers: subset(o.hangers, ALL_HANGERS),
    dsSizes: { rect: subset(ds.rect, DS_SIZES.rect), round: subset(ds.round, DS_SIZES.round) },
    dsStyles: subset(o.dsStyles, DS_STYLES),
    bottoms: subset(o.bottoms, DS_BOTTOMS),
    wallKits: subset(o.wallKits, ALL_WALL_KITS),
  };
}

/** stock defaults kept valid: material → gauge → paint → colour from the palette (copper and zinc are bare) */
function stock(d: Record<string, unknown>, offer: Offer, palette: string[], fallback: { material: string; color: string }) {
  const material = one(d.material, offer.materials, fallback.material);
  const gauges = offer.gauges[material] ?? [];
  const gauge = gauges.length ? one(d.gauge, gauges, gauges[0]!) : undefined;
  const bare = MILL_ONLY.has(material);
  const finish: "mill" | "painted" = bare ? "mill" : d.finish === "mill" ? "mill" : "painted";
  const color = finish === "painted" ? one(d.color, palette, palette.includes(fallback.color) ? fallback.color : palette[0]!) : undefined;
  return { material, ...(gauge ? { gauge } : {}), finish, ...(color ? { color } : {}) };
}

/** the roof's overhang past the wall, feet (#932): half-foot steps up to 3, then whole feet to 6; 2 ft until the company says otherwise */
export const OVERHANG_FT = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6] as const;
export const DEFAULT_OVERHANG_FT = 2;
export const readOverhangFt = (v: unknown): number => (typeof v === "number" && (OVERHANG_FT as readonly number[]).includes(v) ? v : DEFAULT_OVERHANG_FT);

/** the company's format of lengths (#1092): a stored unknown value is feet-inches */
export const readLenFormat = (v: unknown): LenFormat => (isLenFormat(v) ? v : "ftin");

/** the settings as the canvas uses them: always complete and valid, whatever was stored */
export function choicesFor(raw: unknown): Choices {
  const r = obj(raw);
  const offer = readOffer(r);
  const palette = readPalette(r.palette);
  const byMount = obj(r.hangerByMount);
  const hangerByMount = Object.fromEntries(
    PROFILES.map((p) => {
      const kits = familyKits(p, offer.hangers);
      const all = familyKits(p);
      const mine = obj(byMount[p]);
      return [
        p,
        Object.fromEntries(
          GUTTER_MOUNTS.map((m) => {
            const def = DEFAULT_HANGER_BY_MOUNT[p]?.[m] ?? all[0]!;
            // the company's kit, else the module's if the company installs it, else its first kit of this family
            return [m, one(mine[m], kits.length ? kits : all, kits.includes(def) || !kits.length ? def : kits[0]!)];
          }),
        ),
      ];
    }),
  ) as Choices["hangerByMount"];
  const byWall = obj(r.wallKitByWall);
  const wallKitByWall = Object.fromEntries(
    DS_SHAPES.map((sh) => {
      const mine = obj(byWall[sh]);
      return [
        sh,
        Object.fromEntries(
          WALLS.map((w) => {
            const all = WALL_KITS_BY_WALL[sh][w];
            const kits = all.filter((id) => offer.wallKits.includes(id));
            return [w, one(mine[w], kits.length ? kits : all, kits[0] ?? all[0]!)];
          }),
        ),
      ];
    }),
  ) as Choices["wallKitByWall"];

  const ru = obj(r.run);
  const profile = one(ru.profile, offer.profiles, "k");
  const run: RunDefaults = {
    profile,
    size: one(ru.size, offer.sizes[profile], offer.sizes[profile][0]!),
    ...stock(ru, offer, palette, { material: "aluminum", color: "white" }),
    mount: one(ru.mount, GUTTER_MOUNTS, "fascia"),
  };
  const dr = obj(r.ds);
  const shape = one(dr.shape, DS_SHAPES, "rect");
  const ds: DsDefaults = {
    shape,
    size: one(dr.size, offer.dsSizes[shape], offer.dsSizes[shape][0]!),
    dsStyle: one(dr.dsStyle, offer.dsStyles, "plain"),
    ...stock(dr, offer, palette, { material: "aluminum", color: "white" }),
    bottom: one(dr.bottom, offer.bottoms, "extension"),
    wall: one(dr.wall, WALLS, "wood"),
  };
  return { offer, palette, hangerByMount, wallKitByWall, run, ds, lenFormat: readLenFormat(r.lenFormat), roofOverhangFt: readOverhangFt(r.roofOverhangFt), dsSizeSet: dr.size !== undefined && offer.dsSizes[shape].includes(dr.size as never) };
}

/** the module's choices: what the canvas offered before the company's settings (M5c) */
export const MODULE_CHOICES: Choices = choicesFor({});

/** a new run's attributes from the company's defaults (the storey is the canvas's) */
export function newRunAttrs(ch: Choices, story = 1) {
  const { mount, ...rest } = ch.run;
  return { ...rest, story, mount, hanger: ch.hangerByMount[rest.profile][mount] };
}
/** a new downspout's attributes from the company's defaults; the wall is its default kit (П18.7) */
export function newDsAttrs(ch: Choices) {
  const { bottom, wall, ...rest } = ch.ds;
  const w = wallValue(rest.shape, wall, ch);
  // wood with its default kit is what the engine assumes without a wall (the M5c downspout had none)
  return { ...rest, bottom: { kind: bottom }, ...(w !== "wood" ? { wall: w } : {}) };
}

/**
 * One change of the stored settings: the value at `path` (undefined — the key is removed, the default again). Every other
 * stored key and value is kept as it was, `v` too (only a store without it gets 1). Never changes the settings in place.
 */
export function setPath(raw: unknown, path: readonly string[], value: unknown): Record<string, unknown> {
  const root: Record<string, unknown> = { ...obj(raw) };
  if (root.v === undefined) root.v = 1;
  let at = root;
  path.forEach((key, i) => {
    if (i === path.length - 1) {
      if (value === undefined) delete at[key];
      else at[key] = value;
      return;
    }
    const next = { ...obj(at[key]) };
    at[key] = next;
    at = next;
  });
  return root;
}

/** the groups of «what we install» and the module's values of each (by sub-group: a profile, a material, a shape) */
export const OFFER_GROUPS = {
  profiles: () => PROFILES,
  sizes: (p: string) => SIZES_BY_PROFILE[p as GutterProfile] ?? [],
  materials: () => MATERIALS,
  gauges: (m: string) => GAUGES_BY_MATERIAL[m] ?? [],
  hangers: () => ALL_HANGERS,
  dsSizes: (sh: string) => DS_SIZES[sh as DsShape] ?? [],
  dsStyles: () => DS_STYLES,
  bottoms: () => DS_BOTTOMS,
  wallKits: () => ALL_WALL_KITS,
} as const satisfies Record<string, (sub: string) => readonly string[]>;
export type OfferGroup = keyof typeof OFFER_GROUPS;

/**
 * Switch one value of «what we install» on or off: only that value moves in the stored `off` list (other values, also
 * unknown ones, stay). Off for the last offered value of its list → null: the company installs at least one.
 * `known` — the values this switch is about (the hanger switches are per profile family: at least one kit a family).
 */
export function toggleOffer(raw: unknown, group: OfferGroup, sub: string | null, value: string, known: readonly string[] = OFFER_GROUPS[group](sub ?? "")): Record<string, unknown> | null {
  const path = sub === null ? ["off", group] : ["off", group, sub];
  const g = obj(obj(raw).off)[group];
  const cur = sub === null ? g : obj(g)[sub];
  const off = Array.isArray(cur) ? (cur as unknown[]) : [];
  const turnOff = !off.includes(value);
  const next = turnOff ? [...off, value] : off.filter((x) => x !== value);
  if (turnOff && !known.some((k) => !next.includes(k))) return null;
  return setPath(raw, path, next.length ? next : undefined);
}

/** the settings fit what the server takes (≤ 32 KB) — checked before saving, so the owner sees why */
export const settingsFit = (raw: unknown) => new TextEncoder().encode(JSON.stringify(raw ?? {})).length <= MAX_SETTINGS_BYTES;

/* ---------- M7c: rules (spec П4) and use («проверить», П18.8) ---------- */

export type CornerMethod = "cut" | "strip" | "prefab";
export const CORNER_METHODS: readonly CornerMethod[] = ["cut", "strip", "prefab"];
export type RainBasis = "smacna" | "code";
export const STICK_FT = [10, 15, 20] as const;

/** a number rule: whole, its range and default (spec П4 ranges); the screen shows it in `unit` */
interface NumRule { min: number; max: number; def: number; step: number }
/** the company's rules as the screen keeps them: feet and percents where the owner thinks in them */
export const RULE_NUMS = {
  storyFt: { min: 8, max: 20, def: 10, step: 1 },
  hangerSpacingIn: { min: 12, max: 36, def: 24, step: 2 },
  /** 0 = «без запаса» (#1355, founder 13.11: «10 % запас должен настраиваться и убираться»); a whole percent otherwise */
  wastePct: { min: 0, max: 100, def: 10, step: 1 },
  /** a fixed waste, feet, once for the whole measurement (#1355, founder 13.11: «обычно я беру 10 фит запас на любой объём»); 0 — «без запаса» */
  wasteFt: { min: 0, max: 100, def: 10, step: 1 },
  /** an INSIDE (and a bay) field-cut corner takes this much gutter, inches. Stays 0–12 until rule 16 step 2: a phone with the old app reads a value above 12 as «out of range» and takes 6 — two devices of one company would buy differently (review of #1381) */
  cutCornerIn: { min: 0, max: 12, def: 6, step: 1 },
  /** an OUTSIDE field-cut corner (#1355, founder 13.11: «для наружного 14 инчей. Для внутреннего 6 инчей»): 14 does not fit 0–12, hence 0–24 here, in a new field the old app does not read */
  cutCornerOutIn: { min: 0, max: 24, def: 14, step: 1 },
  runPerDsFt: { min: 30, max: 50, def: 40, step: 1 },
  expansionFt: { min: 40, max: 50, def: 50, step: 1 },
  dsExtensionIn: { min: 0, max: 60, def: 0, step: 6 },
  /** an automatic downspout stands this far from the end of its chain, inches (#1246) */
  dsEdgeIn: { min: 6, max: 36, def: 12, step: 6 },
} as const satisfies Record<string, NumRule>;
export const USE_NUMS = {
  rivets: { min: 0, max: 16, def: 0, step: 1 },
  sealant: { min: 0, max: 6, def: 0, step: 1 },
  pointsPerTube: { min: 4, max: 20, def: 8, step: 1 },
  solderPointsPerLb: { min: 4, max: 20, def: 10, step: 1 },
  guardPieceFt: { min: 3, max: 10, def: 4, step: 1 },
} as const satisfies Record<string, NumRule>;

export interface Rules {
  storyFt: number;
  hangerSpacingIn: number;
  hangerExtra: boolean;
  /** how the waste is counted: a fixed length or a percent. A company that saved a percent before the fixed length existed keeps it (rule 16) */
  wasteMode: "ft" | "pct";
  wasteFt: number;
  wastePct: number;
  cutCornerIn: number;
  cutCornerOutIn: number;
  runPerDsFt: number;
  expansionFt: number;
  expansionPart: boolean;
  rainBasis: RainBasis;
  dsStickFt: (typeof STICK_FT)[number];
  dsShareOffcuts: boolean;
  dsExtensionIn: number;
  /** the program puts a downspout on every chain by itself (#1246); one per `runPerDsFt` of chain, `dsEdgeIn` from the end */
  dsAuto: boolean;
  dsEdgeIn: number;
  seamless: boolean;
  corner: CornerMethod;
}
export interface Use {
  joints: Record<JointKind, { rivets: number; sealant: number }>;
  pointsPerTube: number;
  solderPointsPerLb: number;
  touchUpPaint: boolean;
  dsJoin: "rivet" | "screw";
  guardPieceFt: Record<string, number>;
  /** spike lengths by gutter size are on (off by default: a priced spike keeps its price) */
  spikeBySize: boolean;
  /** spike length by gutter size, inches as text (spec П18.15, «проверить») */
  spikeLenIn: Record<string, (typeof SPIKE_LENGTHS)[number]>;
  woodScrew: (typeof WOOD_SCREWS)[number];
  washer: boolean;
  anchor: (typeof ANCHORS)[number];
  /** a sealant tube per joint color (or one plain sealant) */
  sealantByColor: boolean;
}
/** gutter sizes a spike hangs (K, fascia, box) */
export const SPIKE_SIZES = Object.keys(DEFAULT_SPIKE_LENGTH_IN);

const num = (v: unknown, r: NumRule, def = r.def) => (typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max ? v : def);
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

export function readRules(raw: unknown): Rules {
  const r = obj(obj(raw).rules);
  const d = DEFAULT_GUTTER_RULES;
  return {
    storyFt: num(r.storyFt, RULE_NUMS.storyFt),
    hangerSpacingIn: num(r.hangerSpacingIn, RULE_NUMS.hangerSpacingIn),
    hangerExtra: bool(r.hangerExtra, d.hangerAtEnds),
    wasteMode: r.wasteMode === "ft" || r.wasteMode === "pct" ? r.wasteMode : typeof r.wastePct === "number" ? "pct" : "ft",
    wasteFt: num(r.wasteFt, RULE_NUMS.wasteFt),
    wastePct: num(r.wastePct, RULE_NUMS.wastePct),
    cutCornerIn: num(r.cutCornerIn, RULE_NUMS.cutCornerIn),
    cutCornerOutIn: num(r.cutCornerOutIn, RULE_NUMS.cutCornerOutIn),
    runPerDsFt: num(r.runPerDsFt, RULE_NUMS.runPerDsFt),
    expansionFt: num(r.expansionFt, RULE_NUMS.expansionFt),
    expansionPart: bool(r.expansionPart, d.expansionJointPart),
    rainBasis: r.rainBasis === "code" ? "code" : "smacna",
    dsStickFt: (STICK_FT as readonly unknown[]).includes(r.dsStickFt) ? (r.dsStickFt as Rules["dsStickFt"]) : 10,
    dsShareOffcuts: bool(r.dsShareOffcuts, d.dsShareOffcuts),
    dsExtensionIn: num(r.dsExtensionIn, RULE_NUMS.dsExtensionIn),
    dsAuto: bool(r.dsAuto, true),
    dsEdgeIn: num(r.dsEdgeIn, RULE_NUMS.dsEdgeIn),
    seamless: bool(r.seamless, d.seamless),
    corner: one(r.corner, CORNER_METHODS, "cut"),
  };
}

export const JOINT_KINDS = Object.keys(DEFAULT_JOINTS) as JointKind[];
export const GUARD_KINDS = Object.keys(DEFAULT_GUARD_KITS);

export function readUse(raw: unknown): Use {
  const u = obj(obj(raw).use);
  const j = obj(u.joints);
  const g = obj(u.guardPieceFt);
  return {
    joints: Object.fromEntries(
      JOINT_KINDS.map((kind) => {
        const x = obj(j[kind]);
        return [kind, { rivets: num(x.rivets, USE_NUMS.rivets, DEFAULT_JOINTS[kind].rivets), sealant: num(x.sealant, USE_NUMS.sealant, DEFAULT_JOINTS[kind].sealant) }];
      }),
    ) as Use["joints"],
    pointsPerTube: num(u.pointsPerTube, USE_NUMS.pointsPerTube, DEFAULT_GUTTER_RULES.jointsPerSealantTube),
    solderPointsPerLb: num(u.solderPointsPerLb, USE_NUMS.solderPointsPerLb, DEFAULT_GUTTER_RULES.solderPointsPerLb),
    touchUpPaint: bool(u.touchUpPaint, DEFAULT_GUTTER_RULES.touchUpPaint),
    dsJoin: u.dsJoin === "screw" ? "screw" : "rivet",
    guardPieceFt: Object.fromEntries(GUARD_KINDS.map((id) => [id, num(g[id], USE_NUMS.guardPieceFt, Math.round(DEFAULT_GUARD_KITS[id]!.pieceIn / 12))])),
    spikeBySize: bool(u.spikeBySize, false),
    spikeLenIn: Object.fromEntries(SPIKE_SIZES.map((sz) => [sz, one(obj(u.spikeLenIn)[sz], SPIKE_LENGTHS, DEFAULT_SPIKE_LENGTH_IN[sz] as (typeof SPIKE_LENGTHS)[number])])),
    woodScrew: one(u.woodScrew, WOOD_SCREWS, WOOD_SCREW as (typeof WOOD_SCREWS)[number]),
    washer: bool(u.washer, false),
    anchor: one(u.anchor, ANCHORS, "masonry"),
    sealantByColor: bool(u.sealantByColor, DEFAULT_GUTTER_RULES.sealantByColor),
  };
}

/**
 * The engine's company rules from the settings (spec П22.1): only the whitelisted fields, in the engine's units
 * (inches, a decimal waste). The company's wall table does NOT go: a downspout stores the company's kit itself when it
 * differs (wallValue), so a wall type means the module's kit on the panel and in the engine alike, and a change of the
 * table never changes old drawings (review M7c №1, spec П22.6).
 */
export function toRulesOverride(raw: unknown): GutterRulesOverride {
  const r = readRules(raw);
  const u = readUse(raw);
  return {
    storyHeightIn: r.storyFt * 12,
    hangerSpacingIn: Object.fromEntries(Object.keys(DEFAULT_HANGER_KITS).map((id) => [id, r.hangerSpacingIn])),
    hangerAtEnds: r.hangerExtra,
    wasteMode: r.wasteMode,
    wasteFt: r.wasteFt,
    wastePct: (r.wastePct / 100).toFixed(2),
    cutCornerAllowanceIn: r.cutCornerIn,
    cutCornerOutAllowanceIn: r.cutCornerOutIn,
    maxRunPerDownspoutIn: r.runPerDsFt * 12,
    expansionJointIn: r.expansionFt * 12,
    expansionJointPart: r.expansionPart,
    dsStickIn: r.dsStickFt * 12,
    dsShareOffcuts: r.dsShareOffcuts,
    dsExtensionIn: r.dsExtensionIn,
    seamless: r.seamless,
    joints: Object.fromEntries(JOINT_KINDS.map((k) => [k, u.joints[k]])),
    jointsPerSealantTube: u.pointsPerTube,
    solderPointsPerLb: u.solderPointsPerLb,
    touchUpPaint: u.touchUpPaint,
    dsJoin: u.dsJoin,
    guardKits: Object.fromEntries(GUARD_KINDS.map((id) => [id, { ...DEFAULT_GUARD_KITS[id]!, pieceIn: u.guardPieceFt[id]! * 12 }])),
    kitLengthIn: { spike: u.spikeBySize ? { ...u.spikeLenIn } : {} },
    woodScrew: { screw: u.woodScrew, washer: u.washer },
    anchor: u.anchor,
    sealantByColor: u.sealantByColor,
  };
}

/**
 * Why the store saved nothing (saveModuleSettings → null): the module is off or its trial ended while the page was open,
 * or — the module active — its settings are being read again after someone else's change (core #374). Said under the
 * field (debt №7, spec П22.10 №6; review M7d №3).
 */
export const notSavedKey = (access: string | undefined): "notActive" | "rereading" => (access === "trial" || access === "paid" ? "rereading" : "notActive");
