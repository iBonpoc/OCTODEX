/**
 * The chain of typing a length without «Done» (#1316, founder 13.11): feet → inches → the fraction by buttons. Pure.
 */

/** the stage of the entry: the feet are typed, then the inches, then the fraction is chosen (no keyboard needed for it) */
export type EntryStage = "ft" | "in" | "frac";

/** the next stage of «Далее»; the fraction is the last — «Применить» ends the entry */
export const nextStage = (s: EntryStage): EntryStage => (s === "ft" ? "in" : "frac");

/**
 * The inches are typed to the end — the cursor may go to the fraction by itself: a first digit 2–9 can not be followed by another
 * (inches are under 12), «0» is complete too (0″ needs no «Далее»), «1» may be 10 or 11 — it waits for the next digit (or «Далее»); two digits are complete.
 */
export const inchesComplete = (text: string): boolean => /^[02-9]$/.test(text) || /^\d{2,}$/.test(text);

/** the inches typed are 12 or more: wrong at once (a foot is feet's), not at «Применить» */
export const inchesTooBig = (text: string): boolean => /^\d+$/.test(text) && Number(text) >= 12;
