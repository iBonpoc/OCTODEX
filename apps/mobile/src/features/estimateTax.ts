/**
 * The estimate's sales tax in the editor (spec 2026-11-12 Р6, #1097): off in every new estimate, once on — one rate typed by
 * hand on the WHOLE amount after the discount (not by kind of line). The pure part: what turning it on or changing the rate does
 * to an OLD unsigned estimate whose tax was set «by kind» (only some groups taxed) — that changes the client's sum, so the person
 * is asked first with «was / will be» — and the rate «as in the last estimate». The money is the engine's (rule 8).
 */
import { LINE_GROUPS, taxRatePpm, taxWithRatePpm, type CustomSettings, type TaxSettings } from "@octo/estimating-engine";
import type { Estimate, EstimateDoc } from "@/data/types";
import { optionTotals } from "./estimateDoc";

/** an older document: tax on only some of the kinds of line */
export const isPartialTax = (t: TaxSettings): boolean => LINE_GROUPS.some((g) => !t.groups[g]);

/** every kind taxed, the tax on or off, the rate in ppm (and its basis points beside it for older phones) */
export function wholeTax(t: TaxSettings, patch: { enabled?: boolean; ratePpm?: number }): TaxSettings {
  const groups = { service: true, labor: true, material: true };
  const next: TaxSettings = { ...t, groups, enabled: patch.enabled ?? t.enabled };
  return patch.ratePpm === undefined ? next : taxWithRatePpm(next, patch.ratePpm);
}

/** an option whose client's sum changes: its name, the sum now and the sum after */
export interface TaxDiff {
  name: string;
  was: number;
  will: number;
}

export interface TaxChange {
  /** the settings to apply when the person agrees (or when no question is needed) */
  tax: TaxSettings;
  /** an old «by kind» estimate: the options whose client's sum changes (the tax is one for Good / Better / Best — any of them may move,
   *  not only the one that is open) — ask «was $X, will be $Y» for each before applying; null — nothing moves */
  ask: TaxDiff[] | null;
}

/** what turning the tax on/off or a new rate does to EVERY option of this document */
export function taxChange(doc: EstimateDoc, patch: { enabled?: boolean; ratePpm?: number }): TaxChange {
  const tax = wholeTax(doc.settings.tax, patch);
  if (!isPartialTax(doc.settings.tax)) return { tax, ask: null };
  const after: EstimateDoc = { ...doc, settings: { ...doc.settings, tax } as CustomSettings };
  const diffs = doc.options
    .map((o) => ({ name: o.name, was: optionTotals(doc, o).total, will: optionTotals(after, o).total }))
    .filter((d) => d.was !== d.will);
  return { tax, ask: diffs.length ? diffs : null };
}

/** «as in the last estimate»: the rate (ppm) of the estimate SAVED last with the tax on — by the time of its last save (the list's
 *  own order is the order of the ids in the cloud, not of time); not the one being edited; never filled in by itself */
export function lastTaxRatePpm(estimates: Estimate[], exceptId?: string): number | null {
  const at = (e: Estimate) => e.savedAt ?? e.sentAt ?? "";
  const sorted = estimates.map((e, i) => ({ e, i })).sort((x, y) => at(y.e).localeCompare(at(x.e)) || y.i - x.i);
  for (const { e } of sorted) {
    const tax = e.doc?.settings.tax;
    if (e.id === exceptId || !tax?.enabled) continue;
    const p = taxRatePpm(tax);
    if (p > 0) return p;
  }
  return null;
}
