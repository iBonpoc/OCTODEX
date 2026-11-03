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
