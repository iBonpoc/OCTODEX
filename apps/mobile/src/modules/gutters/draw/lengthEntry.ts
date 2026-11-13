/**
 * The chain of typing a length without «Done» (#1316, founder 13.11): feet → inches → the fraction by buttons. Pure.
 */

/** the stage of the entry: the feet are typed, then the inches, then the fraction is chosen (no keyboard needed for it) */
export type EntryStage = "ft" | "in" | "frac";

/** the next stage of «Далее»; the fraction is the last — «Применить» ends the entry */
export const nextStage = (s: EntryStage): EntryStage => (s === "ft" ? "in" : "frac");

/**
 * The inches are typed to the end — the cursor may go to the fraction by itself: a first digit 2–9 can not be followed by another
 * (inches are under 12), «1» may be 10 or 11 — it waits for the next digit (or «Далее»); two digits are complete.
 */
export const inchesComplete = (text: string): boolean => /^[2-9]$/.test(text) || /^\d{2,}$/.test(text);

/** the fraction buttons: the main row — eighths (0, ⅛ … ⅞), «1/16» opens the odd sixteenths (3/16 … 15/16 and 1/16) */
export const EIGHTHS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const ODD_SIXTEENTHS = [1, 3, 5, 7, 9, 11, 13, 15] as const;
/** a fraction in sixteenths (0..15) → the key of its button in the eighths row, or null when it is a sixteenth (odd) */
export const eighthKey = (e16: number): string | null => (e16 % 2 === 0 ? String(e16 / 2) : null);
