import { dec, bps, roundCents, type DecLike } from "./decimal.js";
import { computeOption, type Discount, type Line, type OptionTotals } from "./estimate.js";

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
}

export interface CustomOption {
  id: string;
  name: string;
  recommended?: boolean;
  lines: CustomLine[];
}

export interface TaxSettings {
  enabled: boolean;
  rateBps: number;
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

export const DEFAULT_TAX: TaxSettings = { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: true } };

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

const toLine = (l: CustomLine, tax: TaxSettings): Line => ({
  name: l.name,
  quantity: l.quantity,
  unitPriceCents: l.unitPriceCents,
  unitCostCents: l.unitCostCents ?? 0,
  taxable: tax.enabled && tax.groups[l.group],
  isOptional: !!l.optional,
  selected: !!l.selected,
});

/** Lines that count (blank rows the user has not filled yet are skipped). `lineTotals` follow this order. */
export const activeLines = (lines: CustomLine[]): CustomLine[] => lines.filter((l) => l.name.trim() !== "" || l.unitPriceCents !== 0);

export function computeCustomOption(option: CustomOption, s: CustomSettings): CustomTotals {
  const lines = activeLines(option.lines);
  const anyGroup = s.tax.enabled && LINE_GROUPS.some((g) => s.tax.groups[g]);
  const totals = computeOption(
    lines.map((l) => toLine(l, s.tax)),
    { mode: "added_on_top", enabled: anyGroup, rateBps: s.tax.rateBps },
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
