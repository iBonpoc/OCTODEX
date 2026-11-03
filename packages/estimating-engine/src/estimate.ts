import { dec, bps, roundCents, type DecLike } from "./decimal.js";

/**
 * Estimate / option totals (PRD 05 §7.2, PRD 19 §7.5). All money in integer cents, round half up.
 */

export type TaxMode = "included_in_price" | "added_on_top" | "tax_inclusive_display" | "exempt";

export interface Line {
  sku?: string;
  name: string;
  quantity: DecLike;
  unitPriceCents: number;
  unitCostCents?: number;
  /** Part of unit cost bought from a supplier (purchase tax applies to it). */
  unitMaterialCostCents?: number;
  /** Supplier purchase tax snapshot, basis points (1025 = 10.25%). */
  purchaseTaxBps?: number;
  taxable?: boolean;
  isOptional?: boolean;
  selected?: boolean; // for optional lines
  clientVisible?: boolean; // hidden BOM lines must have price 0
}

export interface TaxContext {
  mode: TaxMode;
  enabled: boolean;
  rateBps: number;
  includePurchaseTaxInCost?: boolean; // default true
}

export type Discount = { kind: "pct"; value: DecLike } | { kind: "fixed"; cents: number } | null;

export interface DepositRule {
  kind: "pct" | "fixed";
  value: DecLike; // pct as fraction (0.1) or cents for fixed
  contractType?: "ca_hic" | "ca_service_repair" | "non_hic";
  caCapEnabled?: boolean;
}

export interface OptionTotals {
  subtotal: number;
  discount: number;
  net: number;
  taxableSub: number;
  taxableDisc: number;
  tax: number;
  total: number;
  revenue: number; // total without tax
  cost: number;
  margin: number;
  marginPct: string | null; // one decimal, null when net = 0
  lineTotals: number[];
  lineCosts: number[];
  warnings: string[];
}

export class ValidationError extends Error {}

export const lineTotal = (l: Line): number => roundCents(dec(l.quantity).mul(l.unitPriceCents));

export function lineCost(l: Line, includePurchaseTax = true): number {
  const unit = dec(l.unitCostCents ?? 0).add(
    includePurchaseTax && l.unitMaterialCostCents && l.purchaseTaxBps
      ? dec(l.unitMaterialCostCents).mul(bps(l.purchaseTaxBps))
      : 0,
  );
  return roundCents(dec(l.quantity).mul(unit));
}

const included = (l: Line) => !l.isOptional || !!l.selected;

export function computeOption(lines: Line[], tax: TaxContext, discount: Discount = null): OptionTotals {
  const warnings: string[] = [];
  for (const l of lines) {
    if (l.clientVisible === false && l.unitPriceCents !== 0) {
      throw new ValidationError(`Скрытая строка «${l.name}» не может иметь цену`);
    }
  }
  const inc = lines.filter(included);
  const lineTotals = lines.map(lineTotal);
  const includePT = tax.includePurchaseTaxInCost ?? true;
  const lineCosts = lines.map(l => lineCost(l, includePT));
  const subtotal = lines.reduce((s, l, i) => (included(l) ? s + lineTotals[i]! : s), 0);
  let disc = 0;
  if (discount?.kind === "pct") disc = roundCents(dec(subtotal).mul(dec(discount.value)));
  if (discount?.kind === "fixed") disc = Math.min(discount.cents, subtotal);
  const net = subtotal - disc;
  if (net === 0 && subtotal > 0) warnings.push("Итог $0");
  const taxableSub = lines.reduce((s, l, i) => (included(l) && l.taxable ? s + lineTotals[i]! : s), 0);
  const taxableDisc = subtotal === 0 ? 0 : roundCents(dec(disc).mul(taxableSub).div(subtotal));
  const base = dec(taxableSub - taxableDisc);
  const rate = bps(tax.rateBps);
  let taxCents = 0;
  if (tax.enabled && tax.mode === "added_on_top") taxCents = roundCents(base.mul(rate));
  if (tax.enabled && tax.mode === "tax_inclusive_display") taxCents = roundCents(base.mul(rate).div(rate.add(1)));
  const total = tax.mode === "tax_inclusive_display" ? net : net + taxCents;
  const revenue = total - taxCents;
  const cost = lines.reduce((s, l, i) => (included(l) ? s + lineCosts[i]! : s), 0);
  const margin = net - cost;
  const marginPct = net === 0 ? null : dec(margin).mul(100).div(net).toDecimalPlaces(1).toFixed(1);
  return {
    subtotal, discount: disc, net, taxableSub, taxableDisc, tax: taxCents, total, revenue,
    cost, margin, marginPct, lineTotals, lineCosts, warnings,
  };
}

export function computeDeposit(totalCents: number, rule: DepositRule): { deposit: number; warnings: string[] } {
  const warnings: string[] = [];
  if (rule.contractType === "ca_service_repair") {
    return { deposit: 0, warnings: ["Service & Repair: депозит запрещён (оплата после выполнения)"] };
  }
  let dep = rule.kind === "pct" ? roundCents(dec(totalCents).mul(dec(rule.value))) : Math.min(dec(rule.value).toNumber(), totalCents);
  if ((rule.contractType ?? "ca_hic") === "ca_hic" && (rule.caCapEnabled ?? true)) {
    const cap = Math.min(roundCents(dec(totalCents).mul("0.1")), 100000);
    if (dep > cap) { warnings.push("Депозит ограничен лимитом CA (меньшее из 10% и $1,000)"); dep = cap; }
  }
  return { deposit: dep, warnings };
}

/** Tax part of a deposit when deposit_tax_mode = proportional (TX17b). */
export const depositTaxPart = (depositCents: number, taxCents: number, totalCents: number): number =>
  totalCents === 0 ? 0 : roundCents(dec(depositCents).mul(taxCents).div(totalCents));

/** Split a refund into tax and non-tax parts by the document tax mode (PRD 18 §K5). */
export function refundAllocation(refundCents: number, invoiceTotal: number, invoiceTax: number, mode: TaxMode) {
  if (mode === "included_in_price" || mode === "exempt" || invoiceTotal === 0) {
    return { tax: 0, revenue: refundCents };
  }
  const tax = roundCents(dec(refundCents).mul(invoiceTax).div(invoiceTotal));
  return { tax, revenue: refundCents - tax };
}

/** Recover a pre-tax price from a tax-inclusive shelf price (TX19). */
export const pretaxFromInclusive = (inclusiveCents: number, rateBps: number): number =>
  roundCents(dec(inclusiveCents).div(bps(rateBps).add(1)));

/** Supplier purchase tax on a PO subtotal (TX21). */
export const purchaseTax = (subtotalCents: number, rateBps: number): number =>
  roundCents(dec(subtotalCents).mul(bps(rateBps)));
