/**
 * The number a person types (DS А6.2): «-100», «abc», «1e5», «12,50» are errors under the field, never a quiet zero.
 * Parsing is the engine's (rule 8); this file only refuses what the engine would read in a surprising way (a comma that is
 * not a thousands separator) and formats the way the US writes numbers.
 */
import { parseMoneyToCents, parsePctToBps, parseQty } from "@octo/estimating-engine";

export type NumberKind = "money" | "percent" | "qty" | "integer";

/** a comma is only a thousands separator: «1,234.50», not «12,50» */
const COMMAS_OK = /^[^,]*$|^\s*\$?\d{1,3}(,\d{3})+(\.\d*)?\s*%?\s*$/;

export type Parsed<V> = { state: "empty" } | { state: "bad" } | { state: "ok"; value: V };

function strict(text: string): string | null {
  const s = text.trim();
  return COMMAS_OK.test(s) ? s : null;
}

export function parseCents(text: string): Parsed<number> {
  if (text.trim() === "") return { state: "empty" };
  const s = strict(text);
  const v = s === null ? null : parseMoneyToCents(s);
  return v === null ? { state: "bad" } : { state: "ok", value: v };
}
export function parseBps(text: string): Parsed<number> {
  if (text.trim() === "") return { state: "empty" };
  const s = strict(text);
  const v = s === null ? null : parsePctToBps(s);
  return v === null ? { state: "bad" } : { state: "ok", value: v };
}
export function parseQuantity(text: string): Parsed<string> {
  if (text.trim() === "") return { state: "empty" };
  const s = strict(text);
  const v = s === null ? null : parseQty(s);
  return v === null ? { state: "bad" } : { state: "ok", value: v };
}
export function parseWhole(text: string): Parsed<number> {
  if (text.trim() === "") return { state: "empty" };
  const s = strict(text);
  if (s === null || !/^\d{1,3}(,\d{3})*$|^\d+$/.test(s)) return { state: "bad" };
  const n = Number(s.replace(/,/g, ""));
  return Number.isSafeInteger(n) ? { state: "ok", value: n } : { state: "bad" };
}

/** on leaving the field: the US format — money `1,234.50`, a percent without trailing zeros, a quantity as the engine writes it */
export const formatCents = (c: number) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatBps = (b: number) => String(b / 100);
export const formatWhole = (n: number) => n.toLocaleString("en-US");
