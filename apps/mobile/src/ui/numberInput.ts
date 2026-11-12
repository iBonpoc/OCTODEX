/**
 * The number a person types (DS А6.2): «-100», «abc», «1e5», «12,50» are errors under the field, never a quiet zero.
 * Parsing is the engine's (rule 8); this file cleans the text before the engine sees it (spaces, signs, commas — an iPhone in
 * a region with a decimal comma has no «.» on its number keyboard), refuses what would be rounded or read in a surprising way,
 * and formats the way the US writes numbers.
 *
 * Commas (founder's director, 12.11.2026): with a «.» the commas are thousands («1,234.50»); without one, a single comma with
 * 1–2 digits after it is the decimal («12,5», «12,50» → 12.50), exactly 3 digits after it (and 1–3 before) are thousands
 * («1,500» → 1500); anything else («1,2,3», «12,5000») is an error.
 */
import { fmtUsd, parseMoneyToCents, parsePctToBps, parseQty } from "@octo/estimating-engine";

export type NumberKind = "money" | "percent" | "qty" | "integer";

/** `ok` — a value; `empty` — nothing typed; `partial` — unfinished («2,», «.»), no error yet; `bad` — not a number */
export type Parsed<V> = { state: "empty" } | { state: "partial" } | { state: "bad" } | { state: "ok"; value: V };

/** the ceilings: a number past them is an error, never a number the phone cannot hold */
export const MAX_CENTS = 99_999_999_999; // $999,999,999.99
export const MAX_BPS = 1_000_000; // 10,000 %
export const MAX_WHOLE = 999_999_999;
const MAX_QTY_INT_DIGITS = 9;
const MAX_QTY_FRAC_DIGITS = 4;

/** the text for the engine: plain digits and at most one dot; null = not a number; "" = nothing typed; "partial" = unfinished */
export function cleanNumber(text: string, signs: string): string | null | "" | "partial" {
  const s = text.replace(new RegExp(`[\\s${signs}]`, "g"), "");
  if (s === "") return "";
  if (!/^[\d.,]+$/.test(s)) return null;
  const hasDot = s.includes(".");
  const commas = (s.match(/,/g) ?? []).length;
  if (commas === 0) {
    if (s === ".") return "partial";
    return (s.match(/\./g) ?? []).length > 1 ? null : s;
  }
  if (hasDot) {
    // «1,234.50»: the commas are thousands groups before the dot
    return /^\d{1,3}(,\d{3})*\.\d*$/.test(s) ? s.replace(/,/g, "") : null;
  }
  if (/^\d{1,3}(,\d{3})+$/.test(s) && !(commas === 1 && /^\d{1,3},\d{1,2}$/.test(s))) return s.replace(/,/g, "");
  if (/^\d*,$/.test(s)) return /^\d+,$/.test(s) ? "partial" : null;
  // one comma, 1–2 digits after it: the decimal
  if (commas === 1 && /^\d*,\d{1,2}$/.test(s)) return (s.startsWith(",") ? "0" : "") + s.replace(",", ".");
  // exactly 3 digits after the single comma: thousands
  if (commas === 1 && /^\d{1,3},\d{3}$/.test(s)) return s.replace(",", "");
  return null;
}

const fracDigits = (s: string) => (s.includes(".") ? s.split(".")[1]!.length : 0);

function parseWith<V>(text: string, signs: string, finish: (clean: string) => Parsed<V>): Parsed<V> {
  const c = cleanNumber(text, signs);
  if (c === null) return { state: "bad" };
  if (c === "") return { state: "empty" };
  if (c === "partial") return { state: "partial" };
  return finish(c);
}

export function parseCents(text: string): Parsed<number> {
  return parseWith<number>(text, "$", (c) => {
    if (fracDigits(c) > 2) return { state: "bad" };
    const v = parseMoneyToCents(c);
    return v === null || v > MAX_CENTS ? { state: "bad" } : { state: "ok", value: v };
  });
}
export function parseBps(text: string): Parsed<number> {
  return parseWith<number>(text, "%", (c) => {
    if (fracDigits(c) > 2) return { state: "bad" };
    const v = parsePctToBps(c);
    return v === null || v > MAX_BPS ? { state: "bad" } : { state: "ok", value: v };
  });
}
export function parseQuantity(text: string): Parsed<string> {
  return parseWith<string>(text, "", (c) => {
    if (fracDigits(c) > MAX_QTY_FRAC_DIGITS || c.split(".")[0]!.length > MAX_QTY_INT_DIGITS) return { state: "bad" };
    const v = parseQty(c);
    return v === null ? { state: "bad" } : { state: "ok", value: v };
  });
}
export function parseWhole(text: string): Parsed<number> {
  return parseWith<number>(text, "", (c) => {
    if (c.includes(".")) return { state: "bad" };
    const n = Number(c);
    return Number.isSafeInteger(n) && n <= MAX_WHOLE ? { state: "ok", value: n } : { state: "bad" };
  });
}

/** on leaving the field: the US format — money `1,234.50` (the engine's `fmtUsd`), a percent without trailing zeros */
export const formatCents = (c: number): string => fmtUsd(c).replace("$", "");
export const formatBps = (b: number) => String(b / 100);
export const formatWhole = (n: number) => n.toLocaleString("en-US");

/**
 * The field shows `text`; the screen's value is `value` (the engine's, or the screen's own). After an outer change the text is
 * rewritten only when it no longer says the value: a right text of the same value stays (the person is typing), a text that
 * is not a number or is empty — for a field that cannot be empty — is replaced. `emptyValue`: what an empty text means
 * (money 0), none — an empty quantity is an error, not a value.
 */
export function needsResync<V>(p: Parsed<V>, value: V, emptyValue: V | undefined): boolean {
  if (p.state === "ok") return p.value !== value;
  if (p.state === "empty") return emptyValue === undefined || emptyValue !== value;
  return true;
}

/** leaving the field with an unfinished text («2,», «5.»): the separator is dropped, the number is what stood before it */
export const finishText = (text: string): string => text.replace(/[\s]*[.,]$/, "");
