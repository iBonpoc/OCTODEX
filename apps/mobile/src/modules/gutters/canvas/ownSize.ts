/**
 * A size of its own (founder 27.11, #2981: «должен быть ещё и кастомный какой-то размер»; answer in #2981: «своего размера нет в
 * прайсе — цена 0, обычная строка „нет в прайсе“»): a gutter or a downspout made to order. Whole inches only — a size is a part of
 * the price key (`5`, `2x3`), a point would read as the key's separator. Pure: the window and changeRun / changeDs read it.
 *  - gutter: 3–12″ («9»);
 *  - rectangular downspout: «AxB», each 1–8″ («3x5»; «3 x 5», «3×5» are read too);
 *  - round downspout: 2–8″.
 */
export const OWN_RUN_IN = { min: 3, max: 12 } as const;
export const OWN_DS_IN = { min: 1, max: 8, roundMin: 2 } as const;

const whole = (v: string, min: number, max: number): number | null => {
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

/** a typed gutter size → the stored one («9»), or null when it is no size */
export function readOwnRunSize(text: string): string | null {
  const n = whole(text.trim().replace(/″|"|in$/g, "").trim(), OWN_RUN_IN.min, OWN_RUN_IN.max);
  return n === null ? null : String(n);
}

/** a typed downspout size → the stored one («3x5», «5»), or null */
export function readOwnDsSize(shape: string, text: string): string | null {
  const t = text.trim().toLowerCase().replace(/″|"/g, "").replace(/\s*[x×х*]\s*/g, "x");
  if (shape === "round") {
    const n = whole(t, OWN_DS_IN.roundMin, OWN_DS_IN.max);
    return n === null ? null : String(n);
  }
  const m = /^(\d{1,2})x(\d{1,2})$/.exec(t);
  if (!m) return null;
  const a = whole(m[1]!, OWN_DS_IN.min, OWN_DS_IN.max), b = whole(m[2]!, OWN_DS_IN.min, OWN_DS_IN.max);
  return a === null || b === null ? null : `${a}x${b}`;
}

/** a stored size is a good size of its own (it reads back as itself) */
export const isOwnRunSize = (s: string | undefined): boolean => !!s && readOwnRunSize(s) === s;
export const isOwnDsSize = (shape: string, s: string | undefined): boolean => !!s && readOwnDsSize(shape, s) === s;
