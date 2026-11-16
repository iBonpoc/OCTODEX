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
import { computeGutterParts, gutterPreview, type MeasurementInput, type PartQty, type PreviewRates } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { catalogMatch } from "@/features/catalogMatch";
import type { DictKey } from "@/i18n";
import { catalogUnitPrice } from "@/features/estimateDoc";
import { fmtLen, type LenFormat } from "./canvas/format";
import { TEST_RATES } from "./canvas/testRates";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "./settings";
import { uuidV5 } from "./uuid5";

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
  const legacy = LEGACY_ROUND_ELBOW(want);
  return legacy ? catalogMatch(pool, legacy)[0] : undefined;
}

/** a round downspout's default 45° elbow → the same elbow under its old name «A» (see findItem); anything else → none */
const LEGACY_ROUND_ELBOW = (w: Record<string, string>): Record<string, string> | null =>
  w.part === "elbow" && w.shape === "round" && w.style === "45" ? { ...w, style: "A" } : null;

/** parts with a word of their own; any other part (a kit's) shows its code — data, like an item's name */
export const PART_WORDS = new Set([
  "gutter", "downspout", "end_cap", "hanger", "ds_strap", "elbow", "outlet", "end_outlet", "extension", "splash_block", "flex", "drain", "drain_adapter", "splash_pan", "sealant",
  "shank", "spike", "circle", "bolt", "screw", "anchor", "ferrule", "flat_coil",
  "rivet", "touch_up_paint", "flux", "solder", "strip_miter", "wedge", "guard",
  "slip_joint", "miter", "splash_guard", "expansion_joint", "guard_run", "offset", "reducer", "funnel", "conductor_head", "diverter", "eave_box", "outlet_screen", "wye", "rain_chain", "rain_chain_adapter",
]);
export const WORK_WORDS = new Set(["install", "downspout", "corner_cut", "tearoff", "tile", "cleaning", "flush", "guard_install"]);

/* ---------- the parts the company prices ---------- */

export type PriceRow = { key: string; part: PartQty };

/** the labor lines a gutter job has (spec П22.10 №1): install by storey (ft), a downspout by storey (each), the rest */
export const LABOR_STORIES = ["1", "2", "3", "4"] as const;
const labor = (key: string, unit: PartQty["unit"], attrs: Record<string, string>): PartQty => ({ key, section: "labor", qty: "1", unit, use: "estimate", kind: "labor", attrs });
export const LABOR_PARTS: readonly PartQty[] = [
  ...LABOR_STORIES.map((s) => labor(`labor.install.story${s}`, "ft", { work: "install", story: s })),
  ...LABOR_STORIES.map((s) => labor(`labor.downspout.story${s}`, "ea", { work: "downspout", story: s })),
  labor("labor.corner_cut", "ea", { work: "corner_cut" }),
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
    downspouts: [{ ...(newDsAttrs(ch) as Omit<MeasurementInput["downspouts"][number], "id" | "runId">), id: "d", runId: "a" }],
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
    if (findItem(catalog, part)) continue;
    const id = stableItemId(companyId, key);
    if (ids.has(id) || out.has(id)) continue;
    out.set(id, {
      id,
      kind: part.kind === "labor" ? "labor" : "material",
      name: name(part).slice(0, 200),
      unit: part.unit,
      priceCents: testPriceCents(part),
      // a material's price is cost × tax × markup in the core's editor (catalog/[id]): cost = the price, no tax, no markup
      ...(part.kind === "labor" ? {} : { costCents: testPriceCents(part), vendorTaxBps: 0, markupBps: 0 }),
      placeholder: true,
      attributes: matchAttrs(part),
    });
  }
  return [...out.values()];
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
export function dsLine(t: Tr, d: { shape?: string; elbows: readonly { style: string; qty: number }[]; offsets: readonly { lengthIn: number; qty: number }[] }): string {
  const round = d.shape === "round";
  const el = d.elbows.filter((e) => e.qty > 0).map((e) => t("mod.gutters.view.dsElbow", { style: round ? `${e.style}°` : e.style, n: e.qty }));
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
  const word = partWord(t, part, p.key);
  const used = new Set<string>(["custom"]);
  let title = word;
  const qualify = (q: string) => t("mod.gutters.pr.titleOf", { part: title, q });
  if (rest.buy === "coil") {
    // the seamless coil to buy: «Бесшовный рулон 11⅞″» — not a second «Желоб»
    title = [attrText(t, "buy", "coil", fmt), rest.blankIn ? attrText(t, "blankIn", rest.blankIn, fmt) : ""].filter(Boolean).join(" ");
    used.add("buy").add("blankIn");
  } else if (rest.buy === "section") {
    title = qualify(t("mod.gutters.pr.sectionOf", { len: attrText(t, "lengthIn", rest.lengthIn ?? "", fmt) }));
    used.add("buy").add("lengthIn");
  } else if (rest.stickIn) {
    // the downspout's sticks to buy: «Водосток, хлыст 10′» — not a second «Водосток» in feet
    title = qualify(t("mod.gutters.pr.stickOf", { len: attrText(t, "stickIn", rest.stickIn, fmt) }));
    used.add("stickIn");
  } else if (part === "elbow" && rest.style) {
    title = qualify(attrText(t, "style", rest.style, fmt, rest.shape));
    used.add("style");
  } else if (part === "offset" && rest.lengthIn) {
    title = qualify(attrText(t, "lengthIn", rest.lengthIn, fmt));
    used.add("lengthIn");
  }
  if (opts.side && part === "end_cap" && (p.attrs.side === "L" || p.attrs.side === "R")) title = qualify(t(k(`side.${p.attrs.side}`)));
  // a profile and its size read as one: «K 5″» (an outlet: the gutter's size; its own size is the downspout's)
  if (rest.profile && (rest.gutterSize || rest.size)) {
    rest.profile = `${attrText(t, "profile", rest.profile, fmt)} ${attrText(t, "size", rest.gutterSize ?? rest.size!, fmt)}`;
    used.add(rest.gutterSize ? "gutterSize" : "size");
  } else if (rest.profile) rest.profile = attrText(t, "profile", rest.profile, fmt);
  // «2×3″» already says it is rectangular: the shape is a word only for a round one
  if (rest.shape === "rect" && /x/i.test(rest.size ?? rest.to ?? "")) used.add("shape");
  const keys = Object.keys(rest).filter((x) => !used.has(x)).sort((x, y) => humanRank(x) - humanRank(y) || x.localeCompare(y));
  return { title, props: keys.map((key) => (key === "profile" ? rest.profile! : attrText(t, key, rest[key]!, fmt, rest.shape))) };
}

/** a part's word: the parts' dictionary, else a wall fastener's (a downspout's kit is named by its part: «hinged_hook»), else its code */
function partWord(t: Tr, part: string | undefined, key: string): string {
  if (part && PART_WORDS.has(part)) return t(`mod.gutters.pr.p.${part}` as DictKey);
  const wk = `mod.gutters.attr.wk.${part}` as DictKey;
  return part && t(wk) !== wk ? t(wk) : part ?? key;
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

/** a cross-section as the trade writes it (#1766, DS §4.5): «2×3″», a round «3″» — one inch mark at the end */
export const sizeText = (v: string) => {
  if (/^\d+(\.\d+)?$/.test(v)) return `${v}″`;
  if (/^\d+(\.\d+)?x\d+(\.\d+)?$/i.test(v)) return `${v.replace(/x/i, "×")}″`;
  return v;
};

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
  // a size: of the part, of the gutter (an outlet), of a drain pipe; a reducer's «to» — «на 2×3″»
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
