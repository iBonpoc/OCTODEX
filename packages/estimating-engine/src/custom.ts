import { dec, bps, roundCents, type DecLike } from "./decimal.js";
import { computeOption, type Discount, type Line, type OptionTotals } from "./estimate.js";

/**
 * Universal (trade-agnostic) estimate: free-form or catalog lines in three groups,
 * 1–3 options, optional add-ons, discount, sales tax per group (separate line, off by default),
 * deposit as a percent or a fixed amount. All money in integer cents, round half up.
 */

export type LineGroup = "service" | "labor" | "material";
export const LINE_GROUPS: LineGroup[] = ["service", "labor", "material"];

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
