/**
 * The company's Gutters settings (docs/specs/33-gutters-settings.md П22, M7b): what the company installs, its colour
 * palette and the defaults of a new run and downspout. Stored in company_modules.settings (≤ 32 KB, owner / admin, only
 * while the module is active — module_save_settings). Pure.
 *
 * The stored object is partial: a field the company never changed is absent and follows the module's default, so a
 * size the module adds later shows up. Reading never trusts it (any admin, any old app version wrote it): a field of the
 * wrong type, an unknown value or an empty list is dropped and the default is used. Writing keeps every key it does not
 * know (rules and use of M7c, a newer version's fields) — an older phone never deletes a newer phone's settings.
 */
import { DEFAULT_HANGER_BY_MOUNT, DEFAULT_HANGER_KITS, DEFAULT_WALL_KITS, GUTTER_MOUNTS, type DsBottomKind, type GutterMount, type GutterProfile } from "@octo/estimating-engine";
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
/** the stored list kept to the known values, in the module's order; nothing usable → the default list */
function subset<K extends string>(v: unknown, known: readonly K[]): K[] {
  if (!Array.isArray(v)) return [...known];
  const got = known.filter((k) => v.includes(k));
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
  const o = obj(raw.offer);
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
  return { offer, palette, hangerByMount, wallKitByWall, run, ds };
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
 * One change of the stored settings: `section.key = value` (or `section = value` without a key), every other stored
 * key kept as it was — also the ones this version does not know. The settings themselves are never changed in place.
 */
export function setSetting(raw: unknown, section: string, key: string | null, value: unknown): Record<string, unknown> {
  const r: Record<string, unknown> = { ...obj(raw), v: 1 };
  if (key === null) r[section] = value;
  else r[section] = { ...obj(r[section]), [key]: value };
  return r;
}

/** the settings fit what the server takes (≤ 32 KB) — checked before saving, so the owner sees why */
export const settingsFit = (raw: unknown) => new TextEncoder().encode(JSON.stringify(raw ?? {})).length <= MAX_SETTINGS_BYTES;

/** a list without its last item is not saved: the company installs at least one profile, size, material… */
export const keepsOne = (list: readonly unknown[]) => list.length > 0;
