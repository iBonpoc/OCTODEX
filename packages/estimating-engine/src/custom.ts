import { dec, bps, bpsFromPpm, roundCents, type DecLike } from "./decimal.js";
import { computeOption, lineCost, lineTotal, type Discount, type Line, type OptionTotals } from "./estimate.js";
import { jobLineQty } from "./jobLines.js";

/**
 * Universal (trade-agnostic) estimate: free-form or catalog lines in three groups,
 * 1–3 options, optional add-ons, discount, sales tax per group (separate line, off by default),
 * deposit as a percent or a fixed amount. All money in integer cents, round half up.
 */

export type LineGroup = "service" | "labor" | "material";
export const LINE_GROUPS: LineGroup[] = ["service", "labor", "material"];

/**
 * What a module wrote into a line (docs/specs/33-gutters-estimate.md П23.7, C4) — the company's, never the client's:
 * kept in the stored document (calc_inputs), dropped by the app's clientDoc and by the server's page (app.client_doc).
 * The core reads only these fields; a module adds its own by extending the type — never a cost, markup or supplier
 * (the tech reads calc_inputs; review C4 security F1).
 */
export interface LineSource {
  /** the module's key (gutters, roofing…) */
  module: string;
  /** the module's key of the line: one line per key */
  key: string;
  /** the client price per unit the module wrote, cents */
  priceCents?: number;
  /** no price yet: 0 until someone sets it */
  noPrice?: true;
  /** the module took a TEST price (rule 9) */
  testPrice?: true;
  /** no longer in the module's data, kept because someone changed it by hand */
  gone?: true;
}

export interface CustomLine {
  id: string;
  name: string;
  description?: string;
  group: LineGroup;
  quantity: DecLike;
  unit: string;
  unitPriceCents: number;
  /** Our cost per unit incl. supplier tax (never shown to the client). */
  unitCostCents?: number;
  catalogItemId?: string;
  /** Add-on the client may tick in the portal. */
  optional?: boolean;
  selected?: boolean;
  /** written by a module (never sent to the client) */
  source?: LineSource;
  /** hidden from the client (PDF, /p/) — only a line priced $0 (the founder's #1100: a hidden line never changes the
   *  client's total); a priced one counts as visible (toLine), the app's normalizeDoc clears the mark */
  clientVisible?: false;
  /** the section of its option (CustomOption.sections); none, or one not there (an older phone's clone) — «без раздела» */
  sectionId?: string;
}

/** A section of an option (#1098, spec 2026-11-12-estimate-editor Р4): a heading with its subtotal; one level of
 *  subsections (parentId → a section with no parentId). The order is the order of the array. A kind section (its words
 *  come from the dictionary, in the client's language on the PDF and /p/) has no title; a module's — the title the phone
 *  wrote in the client's language. Money never depends on it: the server counts by lines. */
export interface EstimateSection {
  id: string;
  title?: string;
  kind?: LineGroup | "module";
  /** the module that wrote it (kept in the stored document, never sent to the client) */
  module?: string;
  parentId?: string;
}
/** at most this many sections and subsections in an option; a title at most this long (the server keeps the same) */
export const SECTIONS_MAX = 40;
export const SECTION_TITLE_MAX = 60;
/** a section id, a parent id, a line's sectionId: at most this long, or it does not count (the server the same) */
export const SECTION_ID_MAX = 64;
/** an id a section may have: a non-empty string of at most SECTION_ID_MAX characters */
export const sectionIdOk = (x: unknown): x is string => typeof x === "string" && x !== "" && Array.from(x).length <= SECTION_ID_MAX;
/** a subsection is one whose parentId is a non-empty string; "" or anything else — a top section (the server the same) */
export const isSubsection = (x: { parentId?: unknown }): boolean => typeof x.parentId === "string" && x.parentId !== "";

export interface CustomOption {
  id: string;
  name: string;
  recommended?: boolean;
  lines: CustomLine[];
  /** sections of the option (absent — none) */
  sections?: EstimateSection[];
}

export interface TaxSettings {
  enabled: boolean;
  rateBps: number;
  /** #1219: the rate in ppm (8.875 % = 88750) — the rate when present; rateBps stays its rounded copy for older phones */
  ratePpm?: number;
  groups: Record<LineGroup, boolean>;
}

export type DepositSetting = { kind: "pct"; bps: number } | { kind: "fixed"; cents: number } | { kind: "none" };

export interface CustomSettings {
  discount: Discount;
  tax: TaxSettings;
  deposit: DepositSetting;
  /** California home improvement contract: warn when the deposit is above min(10%, $1,000). */
  caHic?: boolean;
}

/** a new estimate: tax off; once on — on the whole amount (every group), the founder's 12.11 («не по виду»). An older
 *  document keeps its own groups and counts as it was written. */
export const DEFAULT_TAX: TaxSettings = { enabled: false, rateBps: 0, groups: { service: true, labor: true, material: true } };

export interface CustomTotals extends OptionTotals {
  groupSubtotals: Record<LineGroup, number>;
  deposit: number;
  /** CA limit for this total (lesser of 10% and $1,000) */
  caDepositLimit: number;
  depositOverCaLimit: boolean;
}

/** CA B&P §7159: deposit for a home improvement contract may not exceed the lesser of 10% and $1,000. */
export const caDepositLimit = (totalCents: number): number => Math.min(roundCents(dec(totalCents).mul("0.1")), 100000);

export function depositAmount(totalCents: number, rule: DepositSetting): number {
  if (rule.kind === "none" || totalCents <= 0) return 0;
  if (rule.kind === "pct") {
    const b = Math.max(0, Math.min(10000, rule.bps));
    return roundCents(dec(totalCents).mul(bps(b)));
  }
  return Math.max(0, Math.min(rule.cents, totalCents));
}

/**
 * The deposit rule as the server stores it (estimate_versions.deposit_rule) → the setting app.estimate_option_totals counts
 * (migration 20261110140000, #544): pct by whole bps when the rule has bps; otherwise pct by the share in value (0..1,
 * the quick estimate writes "0.1" = 10 %) as whole bps, round half up; fixed by cents; anything else — none.
 */
export function depositSettingFromRule(rule: unknown): DepositSetting {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return { kind: "none" };
  const r = rule as { kind?: unknown; bps?: unknown; value?: unknown; cents?: unknown };
  const scalar = (v: unknown) => typeof v === "number" || typeof v === "string";
  const num = (v: unknown) => (scalar(v) && /^\s*-?\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN);
  if (r.kind === "pct") {
    if (scalar(r.bps)) return Number.isFinite(num(r.bps)) ? { kind: "pct", bps: num(r.bps) } : { kind: "none" };
    const v = scalar(r.value) ? String(r.value).trim() : "";
    if (/^(\d+(\.\d+)?|\.\d+)$/.test(v)) return { kind: "pct", bps: roundCents(dec(v).mul(10000)) };
    return { kind: "pct", bps: 0 };
  }
  if (r.kind === "fixed" && Number.isFinite(num(r.cents))) return { kind: "fixed", cents: num(r.cents) };
  return { kind: "none" };
}

// The quantity as the server keeps it (estimate_line_items.quantity numeric(14,4), half away from zero): the page,
// the PDF and the server's totals count the same number (Н1, spec 33 П23.9)
const toLine = (l: CustomLine, tax: TaxSettings): Line => ({
  name: l.name,
  quantity: jobLineQty(l.quantity),
  unitPriceCents: l.unitPriceCents,
  unitCostCents: l.unitCostCents ?? 0,
  taxable: tax.enabled && tax.groups[l.group],
  isOptional: !!l.optional,
  selected: !!l.selected,
  // hidden only at $0: a priced line counts as visible, so the app never meets the engine's refusal (Р3; computeOption
  // keeps refusing a priced hidden line given to it directly)
  ...(l.clientVisible === false && l.unitPriceCents === 0 ? { clientVisible: false } : {}),
});

/** Lines that count (blank rows the user has not filled yet are skipped). `lineTotals` follow this order. */
export const activeLines = (lines: CustomLine[]): CustomLine[] => lines.filter((l) => l.name.trim() !== "" || l.unitPriceCents !== 0);

export function computeCustomOption(option: CustomOption, s: CustomSettings): CustomTotals {
  const lines = activeLines(option.lines);
  const anyGroup = s.tax.enabled && LINE_GROUPS.some((g) => s.tax.groups[g]);
  const totals = computeOption(
    lines.map((l) => toLine(l, s.tax)),
    { mode: "added_on_top", enabled: anyGroup, rateBps: s.tax.rateBps, ratePpm: s.tax.ratePpm },
    s.discount,
  );
  const groupSubtotals: Record<LineGroup, number> = { service: 0, labor: 0, material: 0 };
  lines.forEach((l, i) => {
    if (!l.optional || l.selected) groupSubtotals[l.group] += totals.lineTotals[i]!;
  });
  const deposit = depositAmount(totals.total, s.deposit);
  const limit = caDepositLimit(totals.total);
  return { ...totals, groupSubtotals, deposit, caDepositLimit: limit, depositOverCaLimit: !!s.caHic && deposit > limit };
}

/**
 * «Если клиент включит всё на выбор — итог $Y» (#1362, DS §8.9): the option's totals with every «на выбор клиента» line the
 * client could still tick ticked — the same engine, the same discount, tax and deposit as the estimate (no sums on a screen).
 * null when there is nothing left to tick (no optional line, or every one is already in).
 */
export function computeAllOptional(option: CustomOption, s: CustomSettings): CustomTotals | null {
  const lines = activeLines(option.lines);
  if (!lines.some((l) => l.optional && !l.selected)) return null;
  return computeCustomOption({ ...option, lines: option.lines.map((l) => (l.optional ? { ...l, selected: true } : l)) }, s);
}

/**
 * Catalog price of a bought item: supplier price + supplier sales tax, then our markup.
 * $10.00 at 10.25% tax = $11.03 cost; +10% markup = $12.13. No intermediate rounding.
 */
export function catalogCost(costCents: number, vendorTaxBps = 0): number {
  return roundCents(dec(costCents).mul(bps(vendorTaxBps).add(1)));
}
export function catalogPrice(costCents: number, vendorTaxBps = 0, markupBps = 0): number {
  return roundCents(dec(costCents).mul(bps(vendorTaxBps).add(1)).mul(bps(markupBps).add(1)));
}

/** "12.5" → 1250 cents; "" / garbage → null. Accepts "$1,234.5". */
export function parseMoneyToCents(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  return roundCents(dec(s).mul(100));
}
/** "10.25" (%) → 1025 bps; null when not a number. */
export function parsePctToBps(input: string): number | null {
  const s = input.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  return roundCents(dec(s).mul(100));
}
/** #1219: a tax rate input with up to four decimals: "8.875", "8,875 %" → 88750 ppm; null when not a number, more than
 *  four decimals (the rate would be cut silently) or above 100 %. */
export function parsePctToPpm(input: string): number | null {
  const s = input.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d*(\.\d{0,4})?$/.test(s) || s === "" || s === ".") return null;
  const p = dec(s).mul(10000).toNumber();
  return p <= 1_000_000 ? p : null;
}
/** the tax with a new rate in ppm: ratePpm and its rounded basis points beside it (older phones read those) */
export const taxWithRatePpm = <T extends { rateBps: number; ratePpm?: number }>(t: T, p: number): T => ({ ...t, ratePpm: p, rateBps: bpsFromPpm(p) });
/** a ppm rate as the percent people write: 88750 → "8.875", 95000 → "9.5", 0 → "0" (no trailing zeros, en-US dot) */
export const ppmToPctText = (p: number): string => dec(p).div(10000).toString();
/** Quantity input: "2", "2.5", "1,5" → decimal string; null when not a positive number. */
export function parseQty(input: string): string | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d*(\.\d+)?$/.test(s) || s === "") return null;
  return dec(s).toString();
}

/**
 * Cost of a kit (catalog card): Σ unit cost × quantity, one rounding at the end.
 * Unknown when any part has no cost or a quantity that is not a number — never a guess.
 */
export function partsCost(parts: { unitCostCents?: number; qty: string }[]): number | null {
  let sum = dec(0);
  for (const p of parts) {
    const q = parseQty(p.qty);
    if (p.unitCostCents === undefined || q === null) return null;
    sum = sum.add(dec(p.unitCostCents).mul(q));
  }
  return roundCents(sum);
}

/** Margin % of a price, like the estimate's: one decimal; null when the price is 0 or the cost unknown; may be negative. */
export function marginPctOf(priceCents: number, costCents: number | null): string | null {
  if (costCents === null || priceCents === 0) return null;
  return dec(priceCents - costCents).mul(100).div(priceCents).toDecimalPlaces(1).toFixed(1);
}

/** A line's profit before the discount: its total − its cost (only for who sees costs; never on /p/ or the PDF); null
 *  while the quantity is not a number */
export function lineProfit(l: CustomLine): number | null {
  // a quantity being typed ("abc", "") is no number yet: no profit, never an error (called on every keystroke)
  try {
    const x = toLine(l, DEFAULT_TAX);
    return lineTotal(x) - lineCost(x);
  } catch {
    return null;
  }
}

/** the sections that count (the first SECTIONS_MAX, in order, a repeated id once; a subsection only under a top section that counts) */
export function countedSections(o: Pick<CustomOption, "sections">): EstimateSection[] {
  // a repeated id counts once, the first (the document comes from a phone: no check of it on the way)
  const seen = new Set<string>();
  // the first 40, then a broken entry (no id) and a repeated id go — the app's normalizeDoc and the server the same order
  const all = Array.isArray(o.sections) ? o.sections : [];
  const first = all
    .slice(0, SECTIONS_MAX)
    .filter((x) => !!x && typeof x === "object" && sectionIdOk(x.id))
    .filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  const tops = new Set(first.filter((x) => !isSubsection(x)).map((x) => x.id));
  return first.filter((x) => !isSubsection(x) || tops.has(x.parentId!));
}

/**
 * Section subtotals of an option (Р4): a section's total — its lines and its subsections' (the lines that count: an
 * add-on only when chosen); a line with no section, or with one that does not count (absent — an older clone; past 40),
 * goes to `unsectioned`. Σ of the top sections + unsectioned = the option's subtotal. The stored data is never changed.
 */
export function sectionSubtotals(o: CustomOption, s: CustomSettings): { bySection: Record<string, number>; unsectioned: number } {
  const t = computeCustomOption(o, s);
  const lines = activeLines(o.lines);
  const secs = countedSections(o);
  const byId = new Map(secs.map((x) => [x.id, x]));
  const bySection: Record<string, number> = Object.fromEntries(secs.map((x) => [x.id, 0]));
  let unsectioned = 0;
  lines.forEach((l, i) => {
    if (l.optional && !l.selected) return;
    const cents = t.lineTotals[i]!;
    const sec = sectionIdOk(l.sectionId) ? byId.get(l.sectionId) : undefined;
    if (!sec) {
      unsectioned += cents;
      return;
    }
    bySection[sec.id]! += cents;
    if (isSubsection(sec)) bySection[sec.parentId!]! += cents;
  });
  return { bySection, unsectioned };
}

/**
 * «Сохранить в каталог» for a material (Р1): the catalog prices a material from its cost and markup
 * (catalogPrice(cost, 0, markup)) — a whole-bps markup that gives exactly the line's price: the nearest to the line's own
 * (m0 = round((P − C) × 10000 / C)), else m0 − 1 or m0 + 1.
 * No cost (or no right to see it), a price below the cost, a price above the server's limit (markup_bps ≤ 100000:
 * more than 11 × the cost) or no exact markup (a cost above $100, rare) — not saved, and why.
 */
export const CATALOG_MARKUP_MAX_BPS = 100000;
export function catalogMarkupFor(costCents: number | undefined, priceCents: number): { ok: true; markupBps: number } | { ok: false; reason: "noCost" | "belowCost" | "aboveMax" | "noExact" } {
  if (costCents === undefined || !(costCents > 0)) return { ok: false, reason: "noCost" };
  if (priceCents < costCents) return { ok: false, reason: "belowCost" };
  // above the server's markup (1000%): price more than 11 × the cost — its own reason, not «no exact markup»
  if (priceCents > roundCents(dec(costCents).mul(bps(CATALOG_MARKUP_MAX_BPS).add(1)))) return { ok: false, reason: "aboveMax" };
  const m0 = Math.round(((priceCents - costCents) * 10000) / costCents);
  // the markup closest to the line's (m0 first, then its neighbours): $10 at $11 is 10%, not 9.99% — a later change of the
  // cost keeps the percent the person meant (review of РС-3 №1)
  for (const m of [m0, m0 - 1, m0 + 1]) {
    if (m >= 0 && m <= CATALOG_MARKUP_MAX_BPS && catalogPrice(costCents, 0, m) === priceCents) return { ok: true, markupBps: m };
  }
  return { ok: false, reason: "noExact" };
}
