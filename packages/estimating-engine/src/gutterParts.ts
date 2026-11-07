import { D, dec, type Dec, type DecLike } from "./decimal.js";

/**
 * Gutters module: parts and labor from a measurement (docs/specs/33-gutters-module.md §3, П4).
 * Input is the module's normalized measurement (no geometry: lengths are already in inches).
 * Output is quantities only, each with a stable `key` (the estimate line's sourceKey, spec §1 S5g),
 * the estimate section and what it is for: the client estimate, the supplier order, or both.
 * Prices come later from the company price list (core K1/K2); nothing here knows a price.
 * Lengths are integer inches in, decimal feet out (engine rule: no JS float math for lengths).
 */

export type GutterProfile = "k" | "half_round" | "euro" | "fascia" | "box";
export type DsShape = "rect" | "round" | "square";
export type HangerKind = "hidden" | "spike" | "strap" | "bracket";
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

/** What a gutter is made of: these four keys pick the price list item. Copper, zinc and galvanized have no color. */
export interface GutterStock {
  profile: GutterProfile;
  /** nominal size, inches: "5", "6", "7" */
  size: string;
  /** e.g. "alu_027", "alu_032", "galv", "steel_painted", "copper", "zinc" */
  material: string;
  color?: string;
}

export type RunEnd = { kind: "cap" } | { kind: "corner"; cornerId: string } | { kind: "join" };

export interface MeasuredRun extends GutterStock {
  id: string;
  /** 1, 2, 3, 4 (4 = 4 and up) */
  story: number;
  lengthIn: number;
  hanger: HangerKind;
  /** inches of the run covered by guards (0 = none; the founder: guards may cover only a part) */
  guardsIn?: number;
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
  /** cut from the gutter on site, or a ready-made corner */
  method: "cut" | "prefab";
  /** splash guard on an inside corner */
  splashGuard?: boolean;
  story: number;
}

export interface MeasuredDownspout {
  id: string;
  runId: string;
  shape: DsShape;
  /** "2x3", "3x4" for rect; "3", "4" for round and square */
  size: string;
  material: string;
  color?: string;
  /** own height in inches; default = story × story height (the founder: 10 ft per story) */
  heightIn?: number;
  /** elbows: rect A/B and their angles; round by angle "45".."90"; qty may be 0 */
  elbows?: { style: string; qty: number }[];
  /** offsets, inches: usually 1, 2, 4; anything else is a custom part */
  offsets?: { lengthIn: number; qty: number }[];
  bottom: { kind: DsBottomKind; lengthIn?: number };
  funnel?: boolean;
  outletScreen?: boolean;
}

export interface MeasuredChain {
  id: string;
  runId: string;
  story: number;
  /** chain length; default = story height */
  lengthIn?: number;
}

export interface MeasurementInput {
  runs: MeasuredRun[];
  corners: MeasuredCorner[];
  downspouts: MeasuredDownspout[];
  chains?: MeasuredChain[];
}

/** Company rules (spec П4). Every value is a company setting with this default. */
export interface GutterRules {
  storyHeightIn: number;
  /** waste for the purchase: "0.05" = 5% (0..1) */
  wastePct: DecLike;
  /** extra gutter a field-cut corner uses, inches (a prefab corner uses none) */
  cutCornerAllowanceIn: number;
  /** downspouts are bought in sticks */
  dsStickIn: number;
  /** seamless from a coil (one piece per run) or sectional */
  seamless: boolean;
  sectionLengthIn: number;
  hangerSpacingIn: Record<HangerKind, number>;
  dsStrapsPerStick: number;
  /** joints = end caps + corners + outlets (+ section joints); one tube per N joints */
  jointsPerSealantTube: number;
  rivetsPerJoint: number;
  defaultElbows: { style: string; qty: number }[];
  /** advice: max gutter length one downspout drains */
  maxRunPerDownspoutIn: number;
  /** advice: aluminum expansion joint spacing */
  expansionJointIn: number;
}

export const DEFAULT_GUTTER_RULES: GutterRules = {
  storyHeightIn: 120,
  wastePct: "0.05",
  cutCornerAllowanceIn: 6,
  dsStickIn: 120,
  seamless: true,
  sectionLengthIn: 120,
  hangerSpacingIn: { hidden: 24, spike: 24, strap: 24, bracket: 24 },
  dsStrapsPerStick: 2,
  jointsPerSealantTube: 8,
  rivetsPerJoint: 6,
  defaultElbows: [{ style: "A", qty: 3 }],
  maxRunPerDownspoutIn: 480,
  expansionJointIn: 600,
};

export type PartUse = "estimate" | "purchase" | "both";

export interface PartQty {
  /** stable key: the same part on the next recalculation has the same key */
  key: string;
  section: GutterSection;
  /** decimal string */
  qty: string;
  unit: "ft" | "ea";
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
  | { code: "run_without_downspout"; runId: string };

export interface GutterPartsResult {
  parts: PartQty[];
  advice: GutterAdvice[];
}

const stockKey = (s: GutterStock) => [s.profile, s.size, s.material, s.color ?? "-"].join(".");
const stockAttrs = (s: GutterStock): Record<string, string> => ({
  profile: s.profile,
  size: s.size,
  material: s.material,
  ...(s.color ? { color: s.color } : {}),
});
const ft = (inches: Dec): Dec => inches.div(12);
const storyKey = (story: number) => String(Math.min(Math.max(story, 1), 4));

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

/** Downspout length (inches) by the rules; null = cannot be known (warns). */
export function downspoutLengthIn(ds: MeasuredDownspout, story: number, rules: GutterRules): number {
  if (ds.heightIn !== undefined) return ds.heightIn;
  // onto the lower roof: from this eave down to the roof one story below
  const stories = ds.bottom.kind === "lower_roof" ? Math.max(story - 1, 0) : story;
  return stories * rules.storyHeightIn;
}

export function computeGutterParts(input: MeasurementInput, over?: Partial<GutterRules>): GutterPartsResult {
  const rules: GutterRules = { ...DEFAULT_GUTTER_RULES, ...(over ?? {}), hangerSpacingIn: { ...DEFAULT_GUTTER_RULES.hangerSpacingIn, ...(over?.hangerSpacingIn ?? {}) } };
  const acc = new Acc();
  const advice: GutterAdvice[] = [];
  const runs = new Map(input.runs.map((r) => [r.id, r]));
  const corners = new Map(input.corners.map((c) => [c.id, c]));
  const waste = dec(1).add(dec(rules.wastePct));
  let joints = 0;

  /* gutter by stock: the client sees the installed length; the supplier gets length + corners + waste */
  const purchaseIn = new Map<string, { stock: GutterStock; inches: Dec }>();
  const addPurchase = (s: GutterStock, inches: DecLike) => {
    const k = stockKey(s);
    const cur = purchaseIn.get(k);
    if (cur) cur.inches = cur.inches.add(dec(inches));
    else purchaseIn.set(k, { stock: s, inches: dec(inches) });
  };

  for (const r of input.runs) {
    const len = dec(r.lengthIn);
    acc.add({ key: `gutter.${stockKey(r)}`, section: "gutter", unit: "ft", use: "estimate", kind: "material", attrs: stockAttrs(r) }, ft(len));
    addPurchase(r, len);
    if (!rules.seamless) {
      const sections = len.div(rules.sectionLengthIn).ceil();
      joints += Math.max(sections.toNumber() - 1, 0);
    }

    // end caps, left or right by where the house is
    r.ends.forEach((e, i) => {
      if (e.kind === "corner" && !corners.has(e.cornerId)) advice.push({ code: "corner_missing", runId: r.id, cornerId: e.cornerId });
      if (e.kind !== "cap") return;
      // standing outside and facing the house: with the house on the right of the drawing direction,
      // the start of the run is on your right (right cap) and the end on your left; mirrored for the house on the left
      const side = (i === 0) === (r.houseSide === "R") ? "R" : "L";
      acc.add({ key: `endcap.${side}.${stockKey(r)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(r), side } }, 1);
      joints += 1;
    });

    // hangers by kind and spacing
    const spacing = rules.hangerSpacingIn[r.hanger];
    acc.add({ key: `hanger.${r.hanger}.${r.profile}.${r.size}`, section: "fasteners", unit: "ea", use: "both", kind: "material", attrs: { hanger: r.hanger, profile: r.profile, size: r.size } }, len.div(spacing).ceil());

    if (r.guardsIn && r.guardsIn > 0) {
      const g = Math.min(r.guardsIn, r.lengthIn);
      const type = r.guardType ?? "default";
      acc.add({ key: `guard.${type}.${r.profile}.${r.size}`, section: "guards", unit: "ft", use: "both", kind: "material", attrs: { guard: type, profile: r.profile, size: r.size } }, ft(dec(g)));
    }

    // labor: install by story; tear-off
    acc.add({ key: `labor.install.story${storyKey(r.story)}`, section: "labor", unit: "ft", use: "estimate", kind: "labor", attrs: { work: "install", story: storyKey(r.story) } }, ft(len));
    if (r.tearOff) acc.add({ key: "labor.tearoff", section: "labor", unit: "ft", use: "estimate", kind: "labor", attrs: { work: "tearoff" } }, ft(len));

    // advice: expansion joints on long aluminum runs
    if (r.material.startsWith("alu") && r.lengthIn > rules.expansionJointIn) {
      advice.push({ code: "expansion_joint", runId: r.id, joints: Math.ceil(r.lengthIn / rules.expansionJointIn) - 1 });
    }
  }

  for (const c of input.corners) {
    joints += 1;
    if (c.method === "prefab") {
      acc.add({ key: `corner.${c.kind}.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "both", kind: "material", attrs: { ...stockAttrs(c), corner: c.kind } }, 1);
    } else {
      acc.add({ key: `stripmiter.${stockKey(c)}`, section: "corners_caps", unit: "ea", use: "purchase", kind: "material", attrs: { ...stockAttrs(c), part: "strip_miter" } }, 1);
      acc.add({ key: "labor.corner_cut", section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "corner_cut" } }, 1);
      addPurchase(c, rules.cutCornerAllowanceIn);
    }
    if (c.splashGuard) acc.add({ key: `splashguard.${c.profile}.${c.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_guard", profile: c.profile, size: c.size } }, 1);
  }

  const dsPerRun = new Map<string, number>();
  for (const ds of input.downspouts) {
    const run = runs.get(ds.runId);
    if (!run) { advice.push({ code: "downspout_without_run", downspoutId: ds.id }); continue; }
    dsPerRun.set(run.id, (dsPerRun.get(run.id) ?? 0) + 1);
    if (ds.bottom.kind === "lower_roof" && run.story <= 1 && ds.heightIn === undefined) advice.push({ code: "lower_roof_from_first_story", downspoutId: ds.id });
    const len = dec(downspoutLengthIn(ds, run.story, rules));
    const dsAttrs = { shape: ds.shape, size: ds.size, material: ds.material, ...(ds.color ? { color: ds.color } : {}) };
    const dsKey = [ds.shape, ds.size, ds.material, ds.color ?? "-"].join(".");
    acc.add({ key: `ds.${dsKey}`, section: "downspouts", unit: "ft", use: "estimate", kind: "material", attrs: dsAttrs }, ft(len));
    const sticks = len.div(rules.dsStickIn).ceil();
    acc.add({ key: `dsstick.${dsKey}`, section: "downspouts", unit: "ea", use: "purchase", kind: "material", attrs: { ...dsAttrs, stickIn: String(rules.dsStickIn) } }, sticks);
    acc.add({ key: `dsstrap.${ds.shape}.${ds.size}`, section: "fasteners", unit: "ea", use: "purchase", kind: "material", attrs: { part: "ds_strap", shape: ds.shape, size: ds.size } }, sticks.mul(rules.dsStrapsPerStick));
    acc.add({ key: `outlet.${run.profile}.${run.size}.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "outlet", profile: run.profile, gutterSize: run.size, shape: ds.shape, size: ds.size } }, 1);
    joints += 1;
    for (const e of ds.elbows ?? rules.defaultElbows) {
      if (e.qty > 0) acc.add({ key: `elbow.${e.style}.${ds.shape}.${ds.size}.${ds.color ?? "-"}`, section: "downspouts", unit: "ea", use: "both", kind: "material", attrs: { part: "elbow", style: e.style, shape: ds.shape, size: ds.size, ...(ds.color ? { color: ds.color } : {}) } }, e.qty);
    }
    for (const o of ds.offsets ?? []) {
      const std = [1, 2, 4].includes(o.lengthIn);
      if (o.qty > 0) acc.add({ key: `offset.${o.lengthIn}.${ds.shape}.${ds.size}`, section: "downspouts", unit: "ea", use: "both", kind: "material", attrs: { part: "offset", lengthIn: String(o.lengthIn), shape: ds.shape, size: ds.size, ...(std ? {} : { custom: "1" }) } }, o.qty);
    }
    if (ds.funnel) acc.add({ key: `funnel.${ds.shape}.${ds.size}`, section: "adapters", unit: "ea", use: "both", kind: "material", attrs: { part: "funnel", shape: ds.shape, size: ds.size } }, 1);
    if (ds.outletScreen) acc.add({ key: `outletscreen.${ds.shape}.${ds.size}`, section: "guards", unit: "ea", use: "both", kind: "material", attrs: { part: "outlet_screen", shape: ds.shape, size: ds.size } }, 1);
    const b = ds.bottom;
    if (b.kind === "extension" || b.kind === "splash_block") {
      acc.add({ key: `bottom.${b.kind}.${ds.shape}.${ds.size}`, section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: b.kind, shape: ds.shape, size: ds.size } }, 1);
    } else if (b.kind === "flex" || b.kind === "drain") {
      acc.add({ key: `bottom.${b.kind}.${ds.shape}.${ds.size}`, section: "ds_bottom", unit: "ft", use: "both", kind: "material", attrs: { part: b.kind, shape: ds.shape, size: ds.size } }, ft(dec(b.lengthIn ?? 0)));
      if (b.kind === "drain") acc.add({ key: `bottom.drain_adapter.${ds.shape}.${ds.size}`, section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "drain_adapter", shape: ds.shape, size: ds.size } }, 1);
    } else if (b.kind === "lower_roof") {
      acc.add({ key: "bottom.splash_pan", section: "ds_bottom", unit: "ea", use: "both", kind: "material", attrs: { part: "splash_pan" } }, 1);
    }
    acc.add({ key: `labor.downspout.story${storyKey(run.story)}`, section: "labor", unit: "ea", use: "estimate", kind: "labor", attrs: { work: "downspout", story: storyKey(run.story) } }, 1);
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
      acc.add({ key: `coil.${stockKey(stock)}`, section: "gutter", unit: "ft", use: "purchase", kind: "material", attrs: { ...attrs, buy: "coil" } }, ft(inches.mul(waste)).ceil());
    } else {
      acc.add({ key: `section.${stockKey(stock)}`, section: "gutter", unit: "ea", use: "purchase", kind: "material", attrs: { ...attrs, buy: "section", lengthIn: String(rules.sectionLengthIn) } }, inches.mul(waste).div(rules.sectionLengthIn).ceil());
    }
  }

  if (joints > 0) {
    acc.add({ key: "sealant", section: "consumables", unit: "ea", use: "both", kind: "material", attrs: { part: "sealant" } }, Math.ceil(joints / rules.jointsPerSealantTube));
    acc.add({ key: "rivets", section: "consumables", unit: "ea", use: "purchase", kind: "material", attrs: { part: "rivets" } }, joints * rules.rivetsPerJoint);
  }

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
