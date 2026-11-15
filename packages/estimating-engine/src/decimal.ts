import DecimalBase from "decimal.js";

/**
 * One fixed Decimal configuration for the whole engine (ADR-005).
 * Precision 40 significant digits, ROUND_HALF_UP (half away from zero) everywhere.
 * Never use JS `number` arithmetic for money or lengths inside the engine.
 */
export const D = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecLike = Dec | number | string;

export const dec = (v: DecLike): Dec => (v instanceof D ? v : new D(v));

/** Round a decimal amount of cents to an integer number of cents (half up). */
export function roundCents(v: DecLike): number {
  return dec(v).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber();
}

/** Basis points (950 = 9.50%) to a decimal fraction. */
export const bps = (b: number): Dec => dec(b).div(10000);

/** #1219: a sales tax rate in parts per million (1 = 0.0001 %; 8.875 % = 88750, 100 % = 1000000) — a rate with three
 *  decimals (New York 8.875 %, 7.375 %, 9.125 % in California) is not a whole number of basis points. */
export const PPM_MAX = 1_000_000;
export const ppm = (p: number): Dec => dec(p).div(1_000_000);
/** a whole ppm in 0..1000000 */
export const ppmOk = (p: unknown): p is number => typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= PPM_MAX;
/** the basis points written next to a ppm rate, for older phones and the older column: round half up (8.875 % → 888) —
 *  as the server's own tax_rate_bps = round(tax_rate_ppm / 100) */
export const bpsFromPpm = (p: number): number => dec(p).div(100).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber();
/** the rate of a tax that may carry ratePpm (#1219) next to the older rateBps: ratePpm when it is a whole ppm that rounds
 *  to the rateBps beside it; else the basis points × 100 — an older document, an older phone's row, or a rate changed by
 *  something that writes only the basis points (the ppm left behind is stale) — counted as before. The server the same
 *  (app.doc_tax_ppm). */
export const taxRatePpm = (t: { rateBps: number; ratePpm?: number | null }): number =>
  ppmOk(t.ratePpm) && bpsFromPpm(t.ratePpm) === t.rateBps ? t.ratePpm : Math.round(dec(t.rateBps || 0).mul(100).toNumber());

/** Ceil `v` to a multiple of `step` (step 0 = no rounding). */
export function ceilTo(step: DecLike, v: DecLike): Dec {
  const s = dec(step);
  if (s.isZero()) return dec(v);
  return dec(v).div(s).ceil().mul(s);
}

/** Format cents as $1,234.56 (messages and tests only). */
export function fmtUsd(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}
