/**
 * The fraction beside the inches, pure (#2414, founder 22.11: «размер прыгает, кнопка „Применить“ перескакивает»): what is
 * over the tape must not change its size while the tape is pulled — a row that grows under the finger moves the tape
 * and «Применить» with it.
 */
import { fracLabel } from "../canvas/format";

/** the main row: eighths, 0 … 7 of 8 (a fraction in sixteenths = 2 × this) */
export const EIGHTHS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
/** the second row, behind «1/16»: the odd sixteenths */
export const ODD_SIXTEENTHS = [1, 3, 5, 7, 9, 11, 13, 15] as const;
/** a fraction in sixteenths (0..15) → the key of its button in the eighths row, or null when it is a sixteenth (odd) */
export const eighthKey = (e16: number): string | null => (e16 % 2 === 0 ? String(e16 / 2) : null);

/** the fraction's place is as wide as the widest of 1/16 … 15/16 (figures are tabular): the row is the same with any value — it never wraps on 11/16 and back */
export const FRAC_SLOT = Array.from({ length: 15 }, (_, i) => fracLabel(i + 1)).reduce((a, b) => (b.length > a.length ? b : a), "");

/**
 * The odd sixteenths' row (behind «1/16»): open when the window opens on one, then only by a tap on «1/16». A value that
 * comes in later (from the tape) never opens it — the row came in over the tape under the finger (#2414); the «1/16» chip
 * shows the choice is behind it instead (`sixteenthBehind`).
 */
export const sixteenthsOpenAtStart = (e16: number): boolean => e16 % 2 === 1;
/** the value is an odd sixteenth and its row is closed: «1/16» looks chosen */
export const sixteenthBehind = (e16: number, open: boolean): boolean => !open && e16 % 2 === 1;
