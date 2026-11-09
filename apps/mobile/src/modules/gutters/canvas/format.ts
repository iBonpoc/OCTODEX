const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"] as const;
export const eighthLabel = (k: number) => EIGHTHS[k] || "0";

/** A length in inches as a contractor in the US writes it, to 1/8″: 12′ 6″, 8′, 9″, 8′ 9¼″ (rule 7: US formats). */
export function ftIn(inches: number): string {
  const e = Math.max(0, Math.round(inches * 8));
  const n = Math.floor(e / 8);
  const frac = EIGHTHS[e % 8]!;
  const ft = Math.floor(n / 12);
  const i = n % 12;
  const ins = i ? `${i}${frac}` : frac;
  if (ft === 0) return `${ins || "0"}″`;
  return ins ? `${ft}′ ${ins}″` : `${ft}′`;
}

/** how a gutter's length is shown on the drawing (founder 09.11, chosen in its properties): feet + inches, inches, mm */
export type LenUnit = "ftin" | "in" | "mm";
export const LEN_UNITS: readonly LenUnit[] = ["ftin", "in", "mm"];
export const MM_PER_IN = 25.4;

export function fmtLen(inches: number, unit: LenUnit = "ftin"): string {
  if (unit === "mm") return `${Math.round(inches * MM_PER_IN)} mm`;
  if (unit === "in") {
    const e = Math.max(0, Math.round(inches * 8));
    const i = Math.floor(e / 8);
    const frac = EIGHTHS[e % 8]!;
    return `${i || !frac ? i : ""}${frac}″`;
  }
  return ftIn(inches);
}
