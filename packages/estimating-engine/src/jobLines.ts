/**
 * Lines of a job made without an estimate (wave П-2a, docs/specs/13-app-structure.md §5) and the tax of an exempt client.
 * The server counts the same totals (supabase app.job_lines_totals); test/jobLines.test.ts checks both on the same numbers.
 */
import { computeOption, type TaxMode } from "./estimate.js";
import type { DecLike } from "./decimal.js";

export interface JobLine {
  quantity: DecLike;
  unitPriceCents: number;
  taxable?: boolean;
}
export interface JobTax {
  enabled: boolean;
  rateBps: number;
}
export interface JobLinesTotals {
  subtotal: number;
  tax: number;
  total: number;
  lineTotals: number[];
}

/** The tax mode of a client's documents: an exempt client pays no sales tax (customers.tax_exempt). */
export const taxModeFor = (taxExempt: boolean | undefined): TaxMode => (taxExempt ? "exempt" : "added_on_top");

/** Line total floor(qty × price + 0.5); subtotal; tax on the taxable lines, half up; total = subtotal + tax. */
export function jobLinesTotals(lines: JobLine[], tax: JobTax, taxExempt = false): JobLinesTotals {
  const r = computeOption(
    lines.map((l, i) => ({ name: `line ${i + 1}`, quantity: l.quantity, unitPriceCents: l.unitPriceCents, taxable: !!l.taxable })),
    { mode: taxModeFor(taxExempt), enabled: tax.enabled && !taxExempt, rateBps: tax.rateBps },
  );
  return { subtotal: r.subtotal, tax: r.tax, total: r.total, lineTotals: r.lineTotals };
}
