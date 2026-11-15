/** lengths are kept and shown to 1/16″ (founder 11.11: «хранить с точностью до 1/16»); old data is in eighths, which fit */
export const DENOM = 16;
const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"] as const;
/** a fraction in sixteenths (1–15): a glyph for the eighths (⅜), text for the odd ones («3/16») — no glyph exists for those */
export const fracLabel = (k16: number) => (k16 % 2 === 0 ? EIGHTHS[k16 / 2] ?? "" : `${k16}/16`);
/** whole inches and a fraction written together: 5½, 5 3/16, ½, 3/16, 5 */
const mixed = (whole: number, k16: number) => {
  const f = fracLabel(k16);
  if (!f) return String(whole);
  if (!whole) return f;
  return f.length === 1 ? `${whole}${f}` : `${whole} ${f}`;
};

/** A length in inches as a contractor in the US writes it, to 1/16″: 12′ 6″, 8′, 9″, 8′ 9¼″, 8′ 9 3/16″ (rule 7: US formats). */
export function ftIn(inches: number): string {
  const e = Math.max(0, Math.round(inches * DENOM));
  const n = Math.floor(e / DENOM);
  const k = e % DENOM;
  const ft = Math.floor(n / 12);
  const i = n % 12;
  const ins = i || k ? mixed(i, k) : "";
  if (ft === 0) return `${ins || "0"}″`;
  return ins ? `${ft}′ ${ins}″` : `${ft}′`;
}

/** how a gutter's length is shown on the drawing (founder 09.11, chosen in its properties): feet + inches, inches, mm */
/** how a length is typed and shown (founder 09.11: feet + inches + sixteenths, inches, also metres, centimetres, millimetres);
 *  kept in inches to 1/16″ whatever is chosen */
export type LenUnit = "ftin" | "in" | "m" | "cm" | "mm";
export const LEN_UNITS: readonly LenUnit[] = ["ftin", "in", "m", "cm", "mm"];
export const MM_PER_IN = 25.4;
/** millimetres in one of each metric unit */
export const MM_OF: Record<"m" | "cm" | "mm", number> = { m: 1000, cm: 10, mm: 1 };

/**
 * The company's format of every length shown (#1092, founder 12.11: «везде так, как выбрано в настройках»): the typed units
 * (no decimal feet: the founder does not want them). One setting of the module, like the date format; the length is kept in inches to 1/16″ whatever is chosen.
 */
export type LenFormat = LenUnit;
export const LEN_FORMATS: readonly LenFormat[] = ["ftin", "in", "m", "cm", "mm"];
export const isLenFormat = (v: unknown): v is LenFormat => (LEN_FORMATS as readonly unknown[]).includes(v);

/** a length in the format; US notation, the decimal point is «.» in every language (rule 7) */
export function fmtLen(inches: number, unit: LenFormat = "ftin"): string {
  if (unit === "mm") return `${Math.round(inches * MM_PER_IN)} mm`;
  if (unit === "cm") return `${Math.round(inches * MM_PER_IN) / 10} cm`;
  if (unit === "m") return `${Math.round(inches * MM_PER_IN) / 1000} m`;
  if (unit === "in") {
    const e = Math.max(0, Math.round(inches * DENOM));
    return `${mixed(Math.floor(e / DENOM), e % DENOM) || "0"}″`;
  }
  return ftIn(inches);
}

