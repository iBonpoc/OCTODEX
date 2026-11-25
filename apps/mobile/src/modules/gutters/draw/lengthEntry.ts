/**
 * The chain of typing a length without «Done» (#1316, founder 13.11): feet → inches → the fraction by buttons. Pure.
 */
import { oneIn, tapeIn, unitFields } from "../canvas/attrs";
import type { LenUnit } from "../canvas/format";

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

/**
 * The whole step of a unit picked (#2446): an edited field is read first (`typed`, null — half-typed or wrong: the length in hand comes
 * back and `bad` says so); the fields are rewritten from the length in hand in the new unit; the edit is spent, but the rest stays
 * «touched» if the user had edited a field.
 */
export function unitPickStep(o: { edited: boolean; typed: number | null; canon: number; restTouched: boolean; unit: LenUnit }) {
  const typed = o.edited ? o.typed : o.canon;
  const canon = typed ?? o.canon;
  return { canon, bad: typed === null, edited: false, restTouched: restTouchedAfterUnitPick({ restTouched: o.restTouched, edited: o.edited }), fields: unitFields(canon, o.unit) };
}

/**
 * The length window's tape has no «Применить» (v43, founder 24.11): every change of a field is read at once. A length that is good and
 * not the one the run has goes in (`len`; the window's draft keeps it or takes it back); a wrong one writes nothing and says so (`bad`);
 * both fields empty is wrong too (the run keeps the length it had; the warning says so). Pure.
 */
export function tapeDraft(ft: string, inc: string, e16: number, have: number): { len: number | null; bad: boolean; same: boolean } {
  // a field being retyped (empty) is not a zero foot: nothing moves the gutter until both are there
  const n = ft.trim() === "" || inc.trim() === "" ? null : tapeIn(ft, inc, e16);
  if (n === null) return { len: null, bad: true, same: false };
  return { len: n, bad: false, same: n === have };
}

/**
 * The same for the tape's second unit, millimetres (v43 PR B «футы | мм»): one number read at once. «3810», «3 810» and a pasted
 * «3,810» (the thousands comma of the US format) are the same length; nothing sensible — nothing is written and the warning shows.
 */
export function mmDraft(text: string, have: number): { len: number | null; bad: boolean; same: boolean } {
  const n = oneIn(text.replace(/[\s,]/g, ""), "mm");
  if (n === null) return { len: null, bad: true, same: false };
  return { len: n, bad: false, same: n === have };
}
