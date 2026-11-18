/**
 * The company's prices of the Gutters module (docs/specs/33-gutters-settings.md П22.10, M7d). Pure.
 *
 * A price lives in the company's price list (catalog_items), never in the module's settings: one truth for the estimate
 * (M8), the $ under the drawing and the core's catalog. A part finds its item by the item's properties (catalogMatch,
 * C3): the properties that matter for the kind of part (`matchAttrs`) and the same unit. Labor is an item too
 * (kind = labor, properties work / story — founder О4: labor on its own lines).
 *
 * «Создать позиции сразу» makes the missing items with TEST prices only (rule 9: `placeholder`, the core shows
 * «тестовая цена»). Each made item's id is fixed by the company and the part (`stableItemId`) and goes to the server as
 * «insert, or nothing if it is there» (catalog.save onlyNew): a second press, a second phone, the queue sending twice —
 * one item, and a price someone already set is never overwritten by the test one.
 */
import { bendOf, computeGutterParts, DEFAULT_GUTTER_RULES, gutterPreview, type MeasurementInput, type PartQty, type PreviewRates } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { catalogMatch } from "@/features/catalogMatch";
import type { DictKey } from "@/i18n";
import { catalogUnitPrice } from "@/features/estimateDoc";
import { fmtLen, type LenFormat } from "./canvas/format";
import { TEST_RATES } from "./canvas/testRates";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "./settings";
import { uuidV5 } from "./uuid5";
import { priceGroupKey } from "./prices/groups";

/** what a part is, for the parts the engine leaves without `part` (their key's first word says it) */
const PART_BY_KEY: Record<string, string> = { gutter: "gutter", ds: "downspout", guard: "guard_run", coil: "gutter", section: "gutter", dsstick: "downspout" };
/** properties that never change the price: an end cap left or right is one item (the founder's lists: one SKU) */
const NOT_PRICED = new Set(["side"]);

/**
 * The properties a part's item must have (spec П22.10 №2). Labor: work and storey. A part: what it is plus what the
 * engine says about it (profile, size, metal, colour…) — a hanger carries no colour, a gutter does (the engine decides
 * what it writes); `side` is dropped. Never empty.
 */
export function matchAttrs(p: Pick<PartQty, "key" | "kind" | "attrs">): Record<string, string> {
  if (p.kind === "labor") return { ...p.attrs };
  const out: Record<string, string> = { part: p.attrs.part ?? PART_BY_KEY[p.key.split(".")[0]!] ?? p.key.split(".")[0]! };
  for (const [k, v] of Object.entries(p.attrs)) if (k !== "part" && !NOT_PRICED.has(k)) out[k] = v;
  return out;
}
/** one line per item: the same properties and unit are one item (end caps L and R) */
export const matchKey = (p: Pick<PartQty, "key" | "kind" | "attrs" | "unit">) => {
  const a = matchAttrs(p);
  return [p.unit, ...Object.keys(a).sort().map((k) => `${k}=${a[k]}`)].join("|");
};

const live = (it: CatalogItem) => it.kind !== "kit";
/** the company's item for a part: its properties and its unit; the closest first (catalogMatch), else undefined */
export function findItem(catalog: readonly CatalogItem[], p: Pick<PartQty, "key" | "kind" | "attrs" | "unit">): CatalogItem | undefined {
  const unit = p.unit.trim().toLowerCase();
  const pool = catalog.filter((it) => live(it) && it.unit.trim().toLowerCase() === unit);
  const want = matchAttrs(p);
  const own = catalogMatch(pool, want)[0];
  if (own) return own;
  // #871: before the fix the engine counted «A» for a round downspout's elbows by default, and a company priced that row
  // («колено A round»). The 45° elbow takes that price until the company prices its own — nothing to move, no $0 line
  for (const alt of ROUND_ELBOW_FALLBACK(want)) {
    const it = catalogMatch(pool, alt)[0];
    if (it) return it;
  }
  return undefined;
}

/**
 * The round elbow of the engine's DEFAULT degree (75°, «Расход v2») the company has not priced takes its round elbow of the same
 * size and metal at 45°, then under its old name «A»; the 45° one takes «A» (#871; spec 33-gutters-consumption §2.7: the default
 * changed under a company that priced 45°). Its own degree always wins. A degree set by hand (30°, 60°, 90°) never borrows: it shows
 * «нет цены», as before (review of PR-1б).
 */
const ROUND_DEFAULT_STYLES = new Set(DEFAULT_GUTTER_RULES.defaultElbowsRound.map((e) => e.style).filter((s) => s !== "45"));
const ROUND_ELBOW_FALLBACK = (w: Record<string, string>): Record<string, string>[] =>
  w.part !== "elbow" || w.shape !== "round" ? [] : w.style === "45" ? [{ ...w, style: "A" }] : ROUND_DEFAULT_STYLES.has(w.style ?? "") ? [{ ...w, style: "45" }, { ...w, style: "A" }] : [];
/** the line's item is another degree's (see findItem): the estimate says «проверьте цену» for it */
export function priceFromOtherDegree(catalog: readonly CatalogItem[], p: Pick<PartQty, "key" | "kind" | "attrs" | "unit">): boolean {
  const it = findItem(catalog, p);
  // the #871 «A» name of the 45° elbow is the same elbow under its old name — not another degree
  return !!it && p.attrs.part === "elbow" && p.attrs.shape === "round" && ROUND_DEFAULT_STYLES.has(p.attrs.style ?? "") && it.attributes?.style !== p.attrs.style;
}

/** parts with a word of their own; any other part (a kit's) shows its code — data, like an item's name */
export const PART_WORDS = new Set([
  "gutter", "downspout", "end_cap", "hanger", "ds_strap", "elbow", "outlet", "end_outlet", "extension", "splash_block", "flex", "drain", "drain_adapter", "splash_pan", "sealant",
  "shank", "spike", "circle", "bolt", "screw", "anchor", "ferrule", "flat_coil",
  "rivet", "touch_up_paint", "flux", "solder", "strip_miter", "wedge", "guard",
  "slip_joint", "miter", "splash_guard", "expansion_joint", "guard_run", "offset", "reducer", "funnel", "conductor_head", "diverter", "eave_box", "outlet_screen", "wye", "rain_chain", "rain_chain_adapter",
  // a downspout's wall fasteners: the kit is named by its part (#1805: they were shown as codes)
  "sickle_hook", "u_bracket", "conductor_bracket", "brick_hook", "brick_hook_hd", "conductor_band", "hinged_hook", "pipe_cleat",
]);
export const WORK_WORDS = new Set(["install", "downspout", "corner_cut", "bend", "tearoff", "tile", "cleaning", "flush", "guard_install"]);

/* ---------- the parts the company prices ---------- */

export type PriceRow = { key: string; part: PartQty };

/** the labor lines a gutter job has (spec П22.10 №1): install by storey (ft), a downspout by storey (each), the rest */
export const LABOR_STORIES = ["1", "2", "3", "4"] as const;
const labor = (key: string, unit: PartQty["unit"], attrs: Record<string, string>): PartQty => ({ key, section: "labor", qty: "1", unit, use: "estimate", kind: "labor", attrs });
export const LABOR_PARTS: readonly PartQty[] = [
  ...LABOR_STORIES.map((s) => labor(`labor.install.story${s}`, "ft", { work: "install", story: s })),
  ...LABOR_STORIES.map((s) => labor(`labor.downspout.story${s}`, "ea", { work: "downspout", story: s })),
  labor("labor.corner_cut", "ea", { work: "corner_cut" }),
  // «Гиб по месту» (Р4, «Расход v2»): a plain rectangular downspout's elbows bent on site, each
  labor("labor.bend", "ea", { work: "bend" }),
  labor("labor.tearoff", "ft", { work: "tearoff" }),
  labor("labor.tile", "ft", { work: "tile" }),
  // the starter estimates (#1323): a cleaning, a downspout flush and a guard installation are priced like the rest of the labor
  labor("labor.cleaning", "ft", { work: "cleaning" }),
  labor("labor.flush", "ea", { work: "flush" }),
  labor("labor.guard_install", "ft", { work: "guard_install" }),
];

/**
 * A sample job of the company's defaults (spec П22.10 №3): three runs of a new run's stock around an outside and an
 * inside corner (the company's corner method), two end caps, one new downspout. What the client pays for — the
 * engine's estimate and both parts; supplier-only parts (coil, sticks, rivets) are the supplier order's (C7).
 */
export function sampleJob(raw: unknown): MeasurementInput {
  const ch = choicesFor(raw);
  const method = readRules(raw).corner;
  const ra = newRunAttrs(ch);
  const stock = { profile: ra.profile, size: ra.size, material: ra.material, gauge: ra.gauge, finish: ra.finish, color: ra.color };
  const run = (id: string, lengthIn: number, ends: MeasurementInput["runs"][number]["ends"]) => ({ ...ra, id, lengthIn, ends, houseSide: "R" as const });
  // the downspout's elbow is in the price list whatever its kind: a plain rectangular one is bent on site by default («Расход v2»,
  // the bend is a labor row), so the sample makes its elbow ready — a company that puts ready elbows on a plain one finds them priced
  const ds0 = newDsAttrs(ch) as Omit<MeasurementInput["downspouts"][number], "id" | "runId">;
  const sampleDs = ds0.shape !== "round" && !ds0.elbows && bendOf(ds0) === "field" ? { ...ds0, elbows: [{ style: "A", qty: 1 }], elbowBend: "ready" as const } : ds0;
  return {
    runs: [
      // guards on the first run: the price list gets the guard row too (the starter «Только guards», #1323)
      { ...run("a", 480, [{ kind: "cap" }, { kind: "corner", cornerId: "c1" }]), guardsIn: 480 },
      run("b", 360, [{ kind: "corner", cornerId: "c1" }, { kind: "corner", cornerId: "c2" }]),
      run("c", 240, [{ kind: "corner", cornerId: "c2" }, { kind: "cap" }]),
    ],
    corners: [
      { ...stock, id: "c1", kind: "out", method, story: 1 },
      { ...stock, id: "c2", kind: "in", method, story: 1 },
    ],
    downspouts: [{ ...sampleDs, id: "d", runId: "a" }],
  };
}

/**
 * #1336: which item a starter estimate's line means for THIS company: the line's `match` ({part: "gutter"}) with the company's own default stock
 * (profile, size, metal, colour… of a new run) — the very properties a drawing's estimate line asks for, so the starter and the drawing take
 * the same item. A line with no part (labor: work, storey) or a part the sample job has no row for stays as it is.
 */
export function starterWant(settings: unknown, match: Record<string, string>): Record<string, string> {
  if (!match.part) return match;
  const row = materialRows(settings).find((r) => matchAttrs(r.part).part === match.part);
  return row ? { ...matchAttrs(row.part), ...match } : match;
}

/** the material parts of the sample job, one row per item (labor is LABOR_PARTS) */
export function materialRows(raw: unknown): PriceRow[] {
  const { parts } = computeGutterParts(sampleJob(raw), toRulesOverride(raw));
  const seen = new Map<string, PriceRow>();
  for (const p of parts) {
    if (p.kind === "labor" || p.use === "purchase") continue;
    const key = matchKey(p);
    if (!seen.has(key)) seen.set(key, { key, part: p });
  }
  return [...seen.values()];
}
export const laborRows = (): PriceRow[] => LABOR_PARTS.map((p) => ({ key: matchKey(p), part: p }));

/* ---------- making the missing items ---------- */

/**
 * A fixed id for the company's item of one part: UUID v5 in the company's id as the namespace, name «gutters:<part key>»
 * — the same company and part give the same id on every phone, another company another id. Not a secret and not a
 * guard: the server's row-level security decides who writes. A company id that is not a UUID (demo data) gets the
 * module's own namespace with the company id in the name.
 */
const MODULE_NS = "6f1d6c0e-2a8b-5c47-9d0e-4b7a1f3c9e52";
export function stableItemId(companyId: string, key: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId);
  return uuid ? uuidV5(companyId, `gutters:${key}`) : uuidV5(MODULE_NS, `${companyId}:gutters:${key}`);
}

/** the TEST price of a part (rule 9): the $ under the drawing's rate of its section and unit; none → $0 */
export const testPriceCents = (p: Pick<PartQty, "section" | "unit">, rates: PreviewRates = TEST_RATES) => rates[`${p.section}.${p.unit}`] ?? 0;

/**
 * The items to make for the rows without one (spec П22.10 №3): kind, unit and properties of the part, its name, a TEST
 * price marked `placeholder`. A row whose fixed id is already on the phone is skipped (made before, maybe renamed or
 * re-bound since); two rows of one item make it once.
 */
export function missingItems(companyId: string, rows: readonly PriceRow[], catalog: readonly CatalogItem[], name: (p: PartQty) => string): CatalogItem[] {
  const ids = new Set(catalog.map((it) => it.id));
  const out = new Map<string, CatalogItem>();
  for (const { key, part } of rows) {
    // a part priced only by another degree's item (§2.7) still gets its own: the price list shows it missing until there is one
    if (findItem(catalog, part) && !priceFromOtherDegree(catalog, part)) continue;
    const id = stableItemId(companyId, key);
    if (ids.has(id) || out.has(id)) continue;
    const made: CatalogItem = {
      id,
      kind: part.kind === "labor" ? "labor" : "material",
      name: name(part).slice(0, 200),
      unit: part.unit,
      priceCents: testPriceCents(part),
      // a material's price is cost × tax × markup in the core's editor (catalog/[id]): cost = the price, no tax, no markup
      ...(part.kind === "labor" ? {} : { costCents: testPriceCents(part), vendorTaxBps: 0, markupBps: 0 }),
      placeholder: true,
      attributes: withGroup(part.unit, matchAttrs(part)),
    };
    // a colour of a part whose group is there: the group's price, as the store and the server give a joining item (in every mode —
    // the store does it only in the cloud; review of PR3 №6)
    const g = made.attributes?.priceGroup;
    const peer = g ? catalog.find((c) => c.attributes?.priceGroup === g) : undefined;
    out.set(id, peer ? { ...made, priceCents: peer.priceCents, placeholder: peer.placeholder, costCents: peer.costCents, vendorTaxBps: peer.vendorTaxBps, markupBps: peer.markupBps } : made);
  }
  return [...out.values()];
}

/**
 * A coloured part's item the module makes is in its price group from the start (#1913 §4.3: the module writes `priceGroup` on the
 * coloured items it creates): a colour added later joins it and takes its price, no transition needed. Not coloured — as it is.
 */
function withGroup(unit: string, attrs: Record<string, string>): Record<string, string> {
  if (!attrs.color?.trim() || !PART_WORDS.has(attrs.part ?? "")) return attrs;
  return { ...attrs, priceGroup: priceGroupKey({ unit, attributes: attrs }) };
}

/** «Привязать»: an item of the list without properties gets the part's (one with properties is another part's) */
export const bindable = (catalog: readonly CatalogItem[], p: Pick<PartQty, "unit">) =>
  catalog.filter((it) => live(it) && !Object.keys(it.attributes ?? {}).length && it.unit.trim().toLowerCase() === p.unit.trim().toLowerCase());
export const bindItem = (it: CatalogItem, p: Pick<PartQty, "key" | "kind" | "attrs">): CatalogItem => ({ ...it, attributes: matchAttrs(p) });

/* ---------- the $ under the drawing ---------- */

/**
 * The $ under the drawing from the company's list (M7d): a part with an item takes its price, the rest the TEST rate.
 * `test` — some of the sum is a test price (a rate, or an item still marked «тестовая цена»): the chip stays.
 */
export function listPreview(parts: readonly PartQty[], catalog: readonly CatalogItem[], rates: PreviewRates = TEST_RATES) {
  let test = false;
  const priced = catalog.filter(live);
  const r = gutterPreview(parts, rates, (p) => {
    const it = findItem(priced, p);
    if (!it) return undefined;
    if (it.placeholder) test = true;
    // the core's price of an item (a material: cost × supplier tax × markup, as the estimate's line from the list)
    return catalogUnitPrice(it);
  });
  const client = parts.filter((p) => p.use !== "purchase").length;
  return { ...r, test: test || r.listed < client };
}

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/**
 * A downspout's elbows by style and offsets by length (#1747, founder 16.11: «должно быть указано, какое: Elbow A, Elbow B
 * или offset 1, 2, 4»; #1766: one word and one «×» on the screen): «колена A × 2, B × 1 · офсет 2″ × 1»; a round pipe's
 * elbows by their angle «колена 45° × 2». Nothing at all — "" (#814: no «колен 0»). The elbows come as the engine counts
 * them — unset is its default (measureSpec, elbowCounts).
 */
export function dsLine(t: Tr, d: { shape?: string; bent?: boolean; elbows: readonly { style: string; qty: number }[]; offsets: readonly { lengthIn: number; qty: number }[] }): string {
  const round = d.shape === "round";
  // bent on site («Расход v2» §2.1): no elbows to buy — the bends by number (an offset on site is two of them, said by its length)
  const bends = d.elbows.reduce((n, e) => n + Math.max(0, e.qty), 0);
  if (d.bent) return [...(bends > 0 ? [t("mod.gutters.view.dsBends", { n: bends })] : []), ...d.offsets.filter((o) => o.qty > 0).map((o) => t("mod.gutters.view.dsOffset", { len: `${o.lengthIn}″`, n: o.qty }))].join(" · ");
  // a rectangular elbow by its style and the trade's angle «A 75°» (#1800); a round one by its angle «45°»
  const el = d.elbows.filter((e) => e.qty > 0).map((e) => t("mod.gutters.view.dsElbow", { style: round || /^\d+$/.test(e.style) ? `${e.style}°` : `${e.style} ${ELBOW_DEFAULT_DEG}°`, n: e.qty }));
  return [
    ...(el.length ? [t("mod.gutters.view.dsElbows", { list: el.join(", ") })] : []),
    ...d.offsets.filter((o) => o.qty > 0).map((o) => t("mod.gutters.view.dsOffset", { len: `${o.lengthIn}″`, n: o.qty })),
  ].join(" · ");
}

/**
 * The order a person reads a part's properties in (DS §8.14, #1766): size and profile → material and thickness → colour
 * and finish → the rest. A key not listed goes last, in its own order.
 */
const HUMAN_ORDER = ["profile", "gutterSize", "size", "shape", "dsStyle", "hanger", "guard", "blankIn", "lengthIn", "stickIn", "material", "metal", "gauge", "color", "finish", "screw", "rivet"];
const humanRank = (k: string) => {
  const i = HUMAN_ORDER.indexOf(k);
  return i < 0 ? HUMAN_ORDER.length : i;
};

/** a part as a person reads it (#1766, DS §8.14): its name in one line and its properties in the human order */
export interface PartView {
  /** «Колено, тип A», «Заглушка, левая», «Бесшовный рулон 11⅞″», «Водосток, хлыст 10′» */
  title: string;
  /** «K 5″», «Алюминий», «0.027″», «Белый» — each a word or a number with its unit, never a code */
  props: string[];
}

/**
 * A part's name and properties (#1766). `side` — the end cap's left / right goes into the name (the view lists them as
 * two rows; the estimate and the price list have one item for both, `matchAttrs` drops it). `t` — the document's
 * translator (rule 7: the client's language for an estimate line).
 */
export function partView(t: Tr, p: Pick<PartQty, "key" | "kind" | "attrs">, fmt: LenFormat = "ftin", opts: { side?: boolean } = {}): PartView {
  const k = (s: string) => `mod.gutters.pr.${s}` as DictKey;
  if (p.kind === "labor") {
    const w = p.attrs.work ?? "";
    const word = WORK_WORDS.has(w) ? t(k(`w.${w}`)) : w;
    return { title: word, props: p.attrs.story ? [t("mod.gutters.story", { n: p.attrs.story })] : [] };
  }
  const { part, ...rest } = matchAttrs(p);
  // #1800 (founder 16.11): a part is named as the supplier names it — English trade words, the same in the Russian app
  // (`mod.gutters.pr.*` RU = EN; a guard checks it); its properties stay in the app's language
  const word = partWord(t, part, p.key);
  const used = new Set<string>(["custom", "finish"]);
  /** a property said first, before the rest (the coil: its gutter «5″ K-Style»; a hanger: its profile) */
  let lead = "";
  const say = (key: string, v: string | undefined) => (v === undefined ? "" : attrText(t, key, v, fmt, rest.shape));
  const word1 = (key: string) => {
    const w = t(k(key));
    return w === k(key) ? "" : w;
  };
  // the gutter's stock in front: «5″ K-Style» — the size and the profile (an outlet: the downspout's size only)
  const stock = rest.profile ? [say("size", rest.gutterSize ?? rest.size), word1(`prof.${rest.profile}`) || say("profile", rest.profile)].filter(Boolean).join(" ") : "";
  const dsKind = () => word1(`dsKind.${rest.shape === "round" ? "round" : "rect"}${rest.dsStyle === "corrugated" ? "Corrugated" : rest.dsStyle === "plain" ? "Plain" : ""}`);
  const dsSize = say("size", rest.size);
  // the name in the language's order: «5″ K-Style Gutter» / «Canaleta K-Style 5″»
  const named = (size: string, kind: string, w = word) => t(k("named"), { size, kind, word: w }).replace(/[ \t\n]+/g, " ").trim();
  const roundWord = rest.shape === "round" ? word1("dsKind.round") : "";
  const stockKind = rest.profile ? word1(`prof.${rest.profile}`) || say("profile", rest.profile) : "";
  const stockSize = say("size", rest.gutterSize ?? rest.size);
  let title = word;
  const take = (...keys: string[]) => keys.forEach((x) => used.add(x));
  if (rest.buy === "coil") {
    // the coil to buy: «Coil 11⅞″» — not a second «Gutter»
    title = [word1("buy.coil"), say("blankIn", rest.blankIn)].filter(Boolean).join(" ");
    take("buy", "blankIn", "gutterSize", "profile", "size");
    lead = stock;
  } else if (rest.buy === "section") {
    title = `${named(stockSize, stockKind)} · ${t(k("sectionOf"), { len: say("lengthIn", rest.lengthIn) })}`;
    take("buy", "lengthIn", "profile", "size");
  } else if (part === "gutter") {
    title = named(stockSize, stockKind);
    take("profile", "size");
  } else if (part === "downspout") {
    // «2×3 Plain Square Downspout»; the sticks to buy are this row's «2 × 10′ lengths» (partGroups)
    title = named(dsSize, dsKind());
    // a stick to buy keeps its length «10′» (the price list and the supplier order tell it from the foot)
    take("size", "shape", "dsStyle");
  } else if (part === "end_cap" || part === "miter" || part === "strip_miter" || part === "slip_joint" || part === "end_outlet" && !rest.shape) {
    // «5″ K-Style End Cap – Left», «5″ K-Style Box Miter – Outside»
    const side = opts.side && part === "end_cap" && (p.attrs.side === "L" || p.attrs.side === "R") ? word1(`side.${p.attrs.side}`) : "";
    const corner = part === "miter" && rest.corner ? word1(`corner.${rest.corner}`) : "";
    title = [named(stockSize, stockKind), side || corner].filter(Boolean).join(" – ");
    take("profile", "size", "corner");
  } else if (part === "outlet" || part === "end_outlet") {
    // an outlet is its size only (founder 16.11): «Outlet 2×3», «Outlet 3″ Round»
    title = [word, dsSize, roundWord].filter(Boolean).join(" ");
    take("profile", "size", "gutterSize", "shape", "material", "metal", "gauge", "color", "dsStyle");
  } else if (part === "elbow") {
    // «2×3 A Elbow 75°»; a round one by its angle: «3″ Round Elbow 45°»
    const round = rest.shape === "round" || /^\d+$/.test(rest.style ?? "");
    title = named(dsSize, "", round ? t(k("elbowRound"), { deg: `${rest.angle ?? rest.style ?? ""}°` }) : t(k("elbowOf"), { style: rest.style ?? "", deg: `${rest.angle ?? ELBOW_DEFAULT_DEG}°` }));
    take("size", "shape", "style", "angle");
  } else if (part === "hanger" && rest.hanger) {
    // «5″ Hidden Hanger with Screw»
    title = named(say("size", rest.size), "", word1(`k.${rest.hanger}`) || say("hanger", rest.hanger));
    take("hanger", "size", "profile");
    lead = stockKind;
  } else if (part === "screw" && rest.screw) {
    // «#10 × 1½″ Hanger Screw» (for the hangers; founder 16.11: not «Gutter Screw») / «#8 × ½″ Zip Screw» (metal to metal)
    // the metal-to-metal screw is the #8 (the downspout's and the guards'); any other is the company's screw for the hangers
    const fascia = !/^8x/i.test(rest.screw);
    title = `${say("screw", rest.screw)} ${word1(fascia ? "screw.fascia" : "screw.zip")}`;
    take("screw");
    // what it is for (founder 16.11: «саморез №10 для чего?») — in the app's language
    lead = t(fascia ? "mod.gutters.view.screwFor.fascia" : "mod.gutters.view.screwFor.zip");
  } else if (part === "rivet" && rest.rivet) {
    // no colour for a rivet (founder 16.11: «не надо цвет выбирать… всё равно их красят»)
    title = t(k("rivetOf"), { n: rest.rivet });
    take("rivet", "color");
  } else if (part === "offset" && rest.lengthIn) {
    title = `${named(dsSize, roundWord)} ${say("lengthIn", rest.lengthIn)}`;
    take("size", "lengthIn", "shape");
  } else if (rest.shape && rest.size) {
    // a downspout's part by its size: «2×3 Downspout Band», «3″ Hinged Downspout Hook»
    title = named(dsSize, roundWord);
    take("size", "shape");
  } else if (rest.profile) {
    // a gutter's part by its stock: «5″ K-Style Gutter Guard»
    title = named(stockSize, stockKind);
    take("profile", "size");
  }
  // «2×3» already says it is square; «Round» is a word only for a round one (and only where the title has not said it)
  if (rest.shape !== "round" || used.has("shape")) used.add("shape");
  // the finish is said only when it is bare metal (founder 16.11: no «окрашенный»; «mill» — no colour)
  const props = Object.keys(rest)
    .filter((x) => !used.has(x))
    .sort((x, y) => humanRank(x) - humanRank(y) || x.localeCompare(y))
    .map((key) => say(key, rest[key]))
    .filter(Boolean);
  if (rest.finish === "mill" && !used.has("material")) props.push(say("finish", "mill"));
  return { title: title.replace(/[ \t\n]+/g, " ").trim(), props: lead ? [lead, ...props] : props };
}

/** a rectangular elbow's angle when the drawing does not say: the trade's standard (Style A / B are 75°) */
const ELBOW_DEFAULT_DEG = 75;

/** a part's word: the parts' dictionary (the supplier's name, RU = EN), else its code — a guard keeps every engine part in PART_WORDS */
function partWord(t: Tr, part: string | undefined, key: string): string {
  if (part && PART_WORDS.has(part)) return t(`mod.gutters.pr.p.${part}` as DictKey);
  return part ?? key;
}

/**
 * A part's name in one line — the title and the properties — when the price list has no item for it (PricesScreen
 * «создать», the estimate's line with «нет цены»), the schedules and the PDF: `t` — the app's translator on the page, the
 * CLIENT's language for an estimate line (rule 7). Pure.
 */
export function partName(t: Tr, p: PartQty, fmt: LenFormat = "ftin"): string {
  const v = partView(t, p, fmt);
  return [v.title, ...v.props].join(" · ");
}

/** the dictionary group of an enum property's words: «k» is «K-style», «painted» is «Painted» */
const ATTR_WORDS: Record<string, string> = { profile: "p", material: "m", metal: "m", color: "c", finish: "f", shape: "sh", hanger: "k", dsStyle: "st" };
/** a property in inches (a coil's blank, a section's length): feet-inches-sixteenths, as on the drawing */
const ATTR_IN = new Set(["blankIn", "lengthIn", "stickIn"]);

/** a cross-section — one format everywhere (#1916, DS §4.5): «2×3», a round «3″» */
export { sizeText } from "./sizeText";
import { sizeText } from "./sizeText";

/**
 * A property's value for a person (#1090, #1766): a word where the dictionary has one (the company's own colour stays as
 * it is), ″ after a size, feet-inches for a length, «0.027″» for a thickness, «№42» for a rivet — never «11.875», «.027»
 * or a bare code. `t` — the document's translator (rule 7). `shape` — a round downspout's elbow is its angle.
 */
function attrText(t: Tr, key: string, v: string, fmt: LenFormat, shape?: string): string {
  if (ATTR_IN.has(key)) {
    const n = Number(v);
    return Number.isFinite(n) ? fmtLen(n, fmt) : v;
  }
  // a screw «10x1.5» as the trade writes it (#1747): «#10 × 1½″» — the gauge, then the length as on the drawing
  if (key === "screw") {
    const m = /^(\d+)x(\d+(?:\.\d+)?)$/i.exec(v);
    return m ? `#${m[1]} × ${fmtLen(Number(m[2]), fmt)}` : v;
  }
  // a size: of the part, of the gutter (an outlet), of a drain pipe; a reducer's «to» — «на 2×3»
  if (key === "size" || key === "gutterSize" || key === "pipe") return sizeText(v);
  if (key === "to") return t("mod.gutters.pr.toSize", { s: sizeText(v) });
  // a bolt «10-24x0.75»: «#10-24 × ¾″»
  if (key === "bolt") {
    const m = /^(\d+-\d+)x(\d+(?:\.\d+)?)$/i.exec(v);
    return m ? `#${m[1]} × ${fmtLen(Number(m[2]), fmt)}` : v;
  }
  // the metal's thickness (#1766): «.027» → «0.027″», «26ga» → «26 ga», «16oz» → «16 oz»
  if (key === "gauge") {
    if (/^0?\.\d+$/.test(v)) return `${v.startsWith(".") ? "0" : ""}${v}″`;
    const m = /^(\d+)\s*(ga|oz)$/i.exec(v);
    return m ? `${m[1]} ${m[2]!.toLowerCase()}` : v;
  }
  // a rivet's or a shank's number «42» (#1766): «№42» / «#42»
  if (key === "rivet" || key === "shank") return /^\d+$/.test(v) ? t("mod.gutters.pr.numberOf", { n: v }) : v;
  // an elbow's style: a rectangular one by its type «тип A», a round one by its angle «45°»
  if (key === "style") return shape === "round" || /^\d+$/.test(v) ? `${v}°` : t("mod.gutters.pr.typeOf", { s: v });
  const group = key === "buy" ? "buy" : ATTR_WORDS[key];
  if (!group) {
    // a value with a word of its own (#1766): a guard «micromesh», an eave box «open», an anchor «masonry»
    const vk = `mod.gutters.pr.v.${key}.${v}` as DictKey;
    return t(vk) === vk ? v : t(vk);
  }
  const k = (key === "buy" ? `mod.gutters.pr.buy.${v}` : `mod.gutters.attr.${group}.${v}`) as DictKey;
  const w = t(k);
  return w === k ? v : w;
}

/**
 * A part's quantity for a person (#1090): a length in feet as feet-inches-sixteenths (the sum of the engine is decimal, a
 * person reads «73′ 2″», not «73.16666666666667»), a count whole or to two places; the unit is a word of the document.
 */
export function partQty(t: (key: DictKey, params?: Record<string, string | number>) => string, p: Pick<PartQty, "qty" | "unit">, fmt: LenFormat = "ftin"): string {
  const n = Number(p.qty);
  if (!Number.isFinite(n)) return p.qty;
  const uk = `mod.gutters.view.u.${p.unit}` as DictKey;
  const u = t(uk) === uk ? p.unit : t(uk);
  if (p.unit === "ft") return fmtLen(n * 12, fmt);
  return `${Math.round(n * 100) / 100} ${u}`;
}
