/**
 * The pure part of the estimate's row in place (DS §8.3, spec 2026-11-12-estimate-editor Р1–Р2): what a line says when it
 * is folded, what is wrong in it, and the replace / duplicate of a line. Money is the engine's (rule 8).
 */
import { computeCustomOption, lineProfit, marginPctOf, parseQty, type CustomLine } from "@octo/estimating-engine";
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
  if (q === null) out.push({ id: "qty", key: "est.row.needQty" });
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
