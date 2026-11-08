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
import { catalogUnitPrice } from "@/features/estimateDoc";
import { TEST_RATES } from "./canvas/testRates";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "./settings";
import { uuidV5 } from "./uuid5";

/** what a part is, for the parts the engine leaves without `part` (their key's first word says it) */
const PART_BY_KEY: Record<string, string> = { gutter: "gutter", ds: "downspout", guard: "guard_run" };
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
  return catalogMatch(catalog.filter((it) => live(it) && it.unit.trim().toLowerCase() === unit), matchAttrs(p))[0];
}

/** parts with a word of their own; any other part (a kit's) shows its code — data, like an item's name */
export const PART_WORDS = new Set([
  "gutter", "downspout", "end_cap", "hanger", "ds_strap", "elbow", "outlet", "end_outlet", "extension", "splash_block", "flex", "drain", "drain_adapter", "splash_pan", "sealant",
  "shank", "spike", "circle", "bolt", "screw", "anchor", "ferrule", "flat_coil",
  "slip_joint", "miter", "splash_guard", "expansion_joint", "guard_run", "offset", "reducer", "funnel", "conductor_head", "diverter", "eave_box", "outlet_screen", "wye", "rain_chain", "rain_chain_adapter",
]);
export const WORK_WORDS = new Set(["install", "downspout", "corner_cut", "tearoff", "tile"]);

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
      run("a", 480, [{ kind: "cap" }, { kind: "corner", cornerId: "c1" }]),
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
