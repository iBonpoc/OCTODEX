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
