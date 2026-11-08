/**
 * Gutters module: kits — what one hanger, one downspout wall fastener, one guard piece and one joint take
 * (docs/specs/33-gutters-parts.md П18.6–П18.8). Data, not code: a company turns kits off, renames them,
 * changes what they use or adds its own (module settings, M7). No prices here (rule 9).
 * Every quantity marked «проверить» in the spec is a company default, not a manufacturer figure.
 */

export type PartUse = "estimate" | "purchase" | "both";

/** One part of a kit, `per` pieces per kit unit (one hanger, one wall fastener, one guard piece). */
export interface KitPart {
  part: string;
  per: number;
  attrs?: Record<string, string>;
  /** add the gutter's profile and size (hangers, shanks, circles, ferrules, spikes) */
  bySize?: boolean;
  /** add the kit id under the part's name (hanger: "hidden"): every kit is its own price item */
  byKit?: boolean;
  /** add the downspout's shape and size (straps, hooks, bands) */
  byDs?: boolean;
  /** a strip cut from flat coil: inches per kit unit by downspout size; summed, then whole feet */
  stripInBySize?: Record<string, number>;
  /** default "purchase"; the visible part of a kit is "both" */
  use?: PartUse;
}

export interface HangerKit {
  /** inches between hangers */
  spacingIn: number;
  parts: KitPart[];
  /** extra labor line per foot of gutter on this kit (tile roofs: PRD 06 fee.tile) */
  laborWork?: string;
}

export interface WallKit {
  parts: KitPart[];
}

export interface GuardKit {
  /** guards are sold in pieces of this length */
  pieceIn: number;
  /** parts per piece (screws) */
  parts: KitPart[];
}

export type JointKind = "endcap" | "outlet" | "corner_cut" | "corner_strip" | "corner_prefab" | "section" | "ds";

export interface JointRule {
  /** #42 pop rivets per joint */
  rivets: number;
  /** sealant points per joint (a tube = jointsPerSealantTube points); soldered metals take solder instead */
  sealant: number;
  /** a field cut on painted stock: one touch-up can per color */
  paint?: boolean;
}

/** screws, anchors and per-kit counts are company defaults («проверить», spec П18.6–П18.8), not manufacturer figures */
const SCREW_WOOD = { part: "screw", per: 2, attrs: { screw: "10x1.5" } } as const;
const main = (): KitPart => ({ part: "hanger", per: 1, byKit: true, bySize: true, use: "both" });
const shank = (n: string): HangerKit => ({
  spacingIn: 24,
  parts: [
    { part: "shank", per: 1, attrs: { shank: n }, bySize: true, use: "both" },
    { part: "circle", per: 1, bySize: true },
    { part: "bolt", per: 1, attrs: { bolt: "10-24x0.75" } },
    { ...SCREW_WOOD },
  ],
});

/** Gutter hangers (spec П18.6). The hanger part carries `hanger: <id>` so each kit is its own price item. */
export const DEFAULT_HANGER_KITS: Record<string, HangerKit> = {
  hidden: { spacingIn: 24, parts: [main()] },
  hidden_noscrew: { spacingIn: 24, parts: [main(), { part: "screw", per: 1, attrs: { screw: "10x1.5" } }] },
  hidden_clip: { spacingIn: 24, parts: [main()] },
  hidden_boss: { spacingIn: 24, parts: [main()] },
  hidden_hd: { spacingIn: 24, parts: [main()] },
  hangfast: { spacingIn: 24, parts: [main()] },
  spike: { spacingIn: 24, parts: [{ part: "spike", per: 1, bySize: true, use: "both" }, { part: "ferrule", per: 1, bySize: true }] },
  fascia_strap: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  fascia_crossbar: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  rafter: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  roof_bar: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  wrap_around: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  tbar_strap: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }], laborWork: "tile" },
  hr_shank_fascia: shank("10"),
  hr_shank_rafter: shank("11"),
  hr_shank_sheathing: shank("12"),
  hr_shank_crown: shank("6"),
  hr_shank_angled: shank("30"),
  hr_rival_strap: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  hr_regal_bar: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
  hr_face_clip: { spacingIn: 24, parts: [main(), { ...SCREW_WOOD }] },
};

/** Where the gutter hangs (roof edge, spec П18.4); "tile" = a tile roof over the deck. */
export const GUTTER_MOUNTS = ["fascia", "rafter", "roof", "crown", "angled", "tile"] as const;
export type GutterMount = (typeof GUTTER_MOUNTS)[number];

/** The default hanger kit by profile and roof edge (company setting). */
export const DEFAULT_HANGER_BY_MOUNT: Record<string, Record<GutterMount, string>> = {
  k: { fascia: "hidden", rafter: "rafter", roof: "roof_bar", crown: "wrap_around", angled: "wrap_around", tile: "tbar_strap" },
  fascia: { fascia: "hidden", rafter: "rafter", roof: "roof_bar", crown: "wrap_around", angled: "wrap_around", tile: "tbar_strap" },
  box: { fascia: "hidden", rafter: "rafter", roof: "roof_bar", crown: "wrap_around", angled: "wrap_around", tile: "tbar_strap" },
  half_round: { fascia: "hr_shank_fascia", rafter: "hr_shank_rafter", roof: "hr_shank_sheathing", crown: "hr_shank_crown", angled: "hr_shank_angled", tile: "hr_shank_sheathing" },
  euro: { fascia: "hr_shank_fascia", rafter: "hr_shank_rafter", roof: "hr_shank_sheathing", crown: "hr_shank_crown", angled: "hr_shank_angled", tile: "hr_shank_sheathing" },
};

const DS_SCREW = { part: "screw", per: 2, attrs: { screw: "8x0.5" } } as const;
const ANCHOR = { part: "anchor", per: 2, attrs: { anchor: "masonry" } } as const;
const fastener = (part: string, ...rest: KitPart[]): WallKit => ({ parts: [{ part, per: 1, byDs: true, use: "both" }, ...rest] });

/** Downspout wall fasteners (spec П18.7), one kit per fastener. */
export const DEFAULT_WALL_KITS: Record<string, WallKit> = {
  ds_strap: fastener("ds_strap", { ...SCREW_WOOD }, { ...DS_SCREW }),
  ds_strap_masonry: fastener("ds_strap", { ...ANCHOR }, { ...SCREW_WOOD }, { ...DS_SCREW }),
  coil_strap: { parts: [{ part: "flat_coil", per: 1, stripInBySize: { "2x3": 12, "3x4": 16, "3": 12, "4": 15 } }, { ...SCREW_WOOD }, { ...DS_SCREW }] },
  sickle_hook: fastener("sickle_hook"),
  u_bracket: fastener("u_bracket", { ...SCREW_WOOD }),
  u_bracket_masonry: fastener("u_bracket", { ...ANCHOR }, { ...SCREW_WOOD }),
  conductor_bracket: fastener("conductor_bracket", { ...SCREW_WOOD }),
  brick_hook: fastener("brick_hook"),
  brick_hook_hd: fastener("brick_hook_hd"),
  conductor_band: fastener("conductor_band", { ...SCREW_WOOD }),
  conductor_band_masonry: fastener("conductor_band", { ...ANCHOR }, { ...SCREW_WOOD }),
  hinged_hook: fastener("hinged_hook", { ...SCREW_WOOD }),
  pipe_cleat: fastener("pipe_cleat", { ...SCREW_WOOD }),
  pipe_cleat_masonry: fastener("pipe_cleat", { ...ANCHOR }, { ...SCREW_WOOD }),
};

/** The default wall kit by downspout shape and wall (company setting). */
export const DEFAULT_WALL_KIT_BY_WALL: Record<string, Record<string, string>> = {
  rect: { wood: "ds_strap", stucco: "ds_strap_masonry", brick: "brick_hook" },
  round: { wood: "hinged_hook", stucco: "pipe_cleat_masonry", brick: "conductor_band_masonry" },
};

/** Guards (spec П18.8): piece length and screws per piece («проверить»). */
export const DEFAULT_GUARD_KITS: Record<string, GuardKit> = {
  micromesh: { pieceIn: 48, parts: [{ part: "screw", per: 3, attrs: { screw: "8x0.5" } }] },
  screen: { pieceIn: 72, parts: [{ part: "screw", per: 2, attrs: { screw: "8x0.5" } }] },
};

/** Rivets, sealant points and touch-up paint per joint (spec П18.8, «проверить»). */
export const DEFAULT_JOINTS: Record<JointKind, JointRule> = {
  endcap: { rivets: 2, sealant: 1 },
  outlet: { rivets: 4, sealant: 1 },
  corner_cut: { rivets: 6, sealant: 2, paint: true },
  corner_strip: { rivets: 8, sealant: 2, paint: true },
  corner_prefab: { rivets: 8, sealant: 2 },
  section: { rivets: 4, sealant: 2 },
  ds: { rivets: 2, sealant: 0 },
};
