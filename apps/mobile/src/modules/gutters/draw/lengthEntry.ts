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

/**
 * The feet typed in the length window (#2434, founder 23.11.2026): the FIRST time the window opens after a gutter is drawn, the
 * drawn inches and fraction are only a guess — new feet start a fresh length, the inches and the fraction go to 0. The window opened
 * again (a length label tapped: the length is a measured one) keeps them. Once the inches or the fraction were touched in this window,
 * the feet never wipe them.
 */
export const feetResetsRest = (o: { firstOpen: boolean; restTouched: boolean }): boolean => o.firstOpen && !o.restTouched;

/**
 * A unit picked in the window (#2446): the fields are rewritten from the length in hand. If a field was edited before, the inches and
 * the fraction now show a length the user typed, not the drawn guess — the feet typed after it never wipe them.
 */
export const restTouchedAfterUnitPick = (o: { restTouched: boolean; edited: boolean }): boolean => o.restTouched || o.edited;
