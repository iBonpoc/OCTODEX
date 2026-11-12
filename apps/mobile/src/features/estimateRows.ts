/**
 * The pure part of the estimate's row in place (DS §8.3, spec 2026-11-12-estimate-editor Р1–Р2): what a line says when it
 * is folded, what is wrong in it, and the replace / duplicate of a line. Money is the engine's (rule 8).
 */
import { catalogMarkupFor, computeCustomOption, lineProfit, marginPctOf, parseQty, type CustomLine } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { DEFAULT_SETTINGS, uid } from "./estimateDoc";

/** «120 LF × $8.50» — the line under the name of a folded row */
export function rowSummary(l: Pick<CustomLine, "quantity" | "unit" | "unitPriceCents">, money: (c: number) => string, shownQty: (q: CustomLine["quantity"]) => string): string {
  return `${shownQty(l.quantity)} ${l.unit} × ${money(l.unitPriceCents)}`;
}

export type RowProblemId = "name" | "qty" | "price";
export interface RowProblem {
  id: RowProblemId;
  /** the dictionary key of the text under the field */
  key: "est.row.needName" | "est.row.needQty" | "est.row.needPrice";
}

/** a line that is not finished: nothing typed in it at all (name empty, price 0) closes without a trace, see `isBlank` */
export const isBlank = (l: Pick<CustomLine, "name" | "unitPriceCents" | "description">): boolean =>
  l.name.trim() === "" && l.unitPriceCents === 0 && !(l.description ?? "").trim();

/** what is wrong in a line the person has touched: the name, the quantity as a number (not 0 either) */
export function rowProblems(l: Pick<CustomLine, "name" | "quantity" | "unitPriceCents">): RowProblem[] {
  const out: RowProblem[] = [];
  if (l.name.trim() === "") out.push({ id: "name", key: "est.row.needName" });
  const q = typeof l.quantity === "string" ? parseQty(l.quantity) : String(l.quantity);
  // «0» is not a quantity either (a line of nothing)
  if (q === null || /^0*\.?0*$/.test(q)) out.push({ id: "qty", key: "est.row.needQty" });
  if (!Number.isFinite(l.unitPriceCents) || l.unitPriceCents < 0) out.push({ id: "price", key: "est.row.needPrice" });
  return out;
}

/** «Заменить»: a new thing of the catalog in the place of the line. Stays: id, quantity, section, the module's mark (else the
 *  module's «Обновить смету» would add its part a second time); goes: name, description, kind, unit, prices, the catalog link. */
export function replaceLine(old: CustomLine, from: CustomLine): CustomLine {
  const { clientVisible: _hidden, ...rest } = from;
  const keep: Partial<CustomLine> = { id: old.id, quantity: old.quantity };
  if (old.sectionId !== undefined) keep.sectionId = old.sectionId;
  if (old.source !== undefined) keep.source = old.source;
  if (old.optional) keep.optional = old.optional;
  // a hidden line is shown again when the new one has a price (the founder's #1100)
  const hidden = old.clientVisible === false && rest.unitPriceCents === 0 ? { clientVisible: false as const } : {};
  return { ...rest, ...keep, ...hidden };
}

/** «Очистить позицию»: the line empties (the name, the prices), stays in its place with its quantity */
export function clearLine(old: CustomLine): CustomLine {
  const out: CustomLine = { id: old.id, name: "", group: old.group, quantity: old.quantity, unit: old.unit, unitPriceCents: 0 };
  if (old.sectionId !== undefined) out.sectionId = old.sectionId;
  // the module's mark stays (as in `replaceLine`): else «Обновить смету» adds the module's part a second time
  if (old.source !== undefined) out.source = old.source;
  return out;
}

/** «Дублировать»: the copy stands right after the line, with its own id and without a catalog/module mark of the original's `source` */
export function duplicateLine(lines: CustomLine[], id: string, newId: () => string = uid): { lines: CustomLine[]; copyId: string } | null {
  const i = lines.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const { source: _source, ...rest } = lines[i]!;
  const copy: CustomLine = { ...rest, id: newId() };
  return { lines: [...lines.slice(0, i + 1), copy, ...lines.slice(i + 1)], copyId: copy.id };
}

/** «Сумма $510.00 · Заработок $186.00 · 36.5 %» — numbers of an open row; profit only for who sees costs; null while the quantity is not a number */
export function rowFigures(l: CustomLine, costsVisible: boolean): { total: number; profit: number | null; marginPct: string | null } {
  let total = 0;
  try {
    // the one line as an option of its own: the engine's total, never a sum made here (rule 8)
    total = computeCustomOption({ id: "row", name: "", lines: [{ ...l, optional: false, clientVisible: undefined }] }, DEFAULT_SETTINGS).subtotal;
  } catch {
    return { total: 0, profit: null, marginPct: null };
  }
  if (!costsVisible || l.unitCostCents === undefined) return { total, profit: null, marginPct: null };
  let profit: number | null = null;
  try {
    profit = lineProfit(l) as number | null;
  } catch {
    profit = null;
  }
  return { total, profit, marginPct: profit === null ? null : marginPctOf(total, total - profit) };
}

/* ---- «Отменить» of one action takes back that action only (a later edit of another row stays) ---- */

/** the line back where it was (by its place in the list at the time), unless it is there already */
export function reinsertLine(lines: CustomLine[], line: CustomLine, index: number): CustomLine[] {
  if (lines.some((l) => l.id === line.id)) return lines;
  const at = Math.max(0, Math.min(index, lines.length));
  return [...lines.slice(0, at), line, ...lines.slice(at)];
}
/** the line as it was before the action (replace, clear) */
export function restoreLine(lines: CustomLine[], old: CustomLine): CustomLine[] {
  return lines.map((l) => (l.id === old.id ? old : l));
}
/** the copy of «Дублировать» out again */
export function dropLine(lines: CustomLine[], id: string): CustomLine[] {
  return lines.filter((l) => l.id !== id);
}

/**
 * What happens to the open row when something asks it to close (DS §8.3): a row with nothing typed in it vanishes; a right one
 * folds; a wrong one stays — and says why (the errors, the scroll, the vibration) unless the ask is a finger starting to scroll
 * (`quiet`): the page must be able to scroll, so the row just stays open.
 */
export function leaveDecision(l: Pick<CustomLine, "name" | "unitPriceCents" | "description">, problems: number, quiet: boolean): "remove" | "fold" | "stay-loud" | "stay-quiet" {
  if (isBlank(l)) return "remove";
  if (problems === 0) return "fold";
  return quiet ? "stay-quiet" : "stay-loud";
}

/* ---- «Скрыть от клиента» (Р3): only a line priced $0 may be hidden ---- */

export const canHide = (l: Pick<CustomLine, "unitPriceCents">): boolean => l.unitPriceCents === 0;
export const isHidden = (l: Pick<CustomLine, "clientVisible">): boolean => l.clientVisible === false;

/** a patch on a line: a price typed into a hidden line shows it again (the founder's #1100: a hidden line never changes the client's total) */
export function applyPatch(l: CustomLine, patch: Partial<CustomLine>): { line: CustomLine; unhidden: boolean } {
  const next = { ...l, ...patch } as CustomLine;
  if (isHidden(next) && next.unitPriceCents !== 0) {
    const { clientVisible: _v, ...rest } = next;
    return { line: rest, unhidden: true };
  }
  return { line: next, unhidden: false };
}

/* ---- «Сохранить в каталог» (Р1, К1): the thing the row describes, or why not ---- */

export type CatalogRefusal = "noCost" | "belowCost" | "aboveMax" | "noExact";
export type CatalogOffer =
  /** the line is right and can go: this is the catalog item (without id) */
  | { state: "offered"; item: Omit<CatalogItem, "id"> }
  /** the row is not finished (no name, a wrong price): the choice waits, the hint says what to write */
  | { state: "later" }
  /** a material the catalog cannot hold in its own terms: the toggle is pale, the reason under it */
  | { state: "refused"; reason: CatalogRefusal };

/**
 * A service / labor: `{ kind, name, description, unit, priceCents }` as the line says. A material: the catalog computes its
 * price (cost × (1 + vendor tax) × (1 + markup)), so the line's price is written as cost + the whole-bps markup that gives
 * exactly that price (the engine's `catalogMarkupFor`); no cost, a price below it, above 11 × it, or no exact markup — refused.
 * The price of the saved item is always the line's own (tested over a grid of costs and prices).
 */
export function catalogOffer(l: CustomLine, costsVisible: boolean): CatalogOffer {
  if (l.name.trim() === "" || !Number.isFinite(l.unitPriceCents) || l.unitPriceCents < 0) return { state: "later" };
  const base = { kind: l.group, name: l.name.trim(), unit: l.unit, ...(l.description?.trim() ? { description: l.description.trim() } : {}) };
  if (l.group !== "material") return { state: "offered", item: { ...base, priceCents: l.unitPriceCents } };
  const m = catalogMarkupFor(costsVisible ? l.unitCostCents : undefined, l.unitPriceCents);
  if (!m.ok) return { state: "refused", reason: m.reason };
  return { state: "offered", item: { ...base, priceCents: l.unitPriceCents, costCents: l.unitCostCents!, vendorTaxBps: 0, markupBps: m.markupBps } };
}
