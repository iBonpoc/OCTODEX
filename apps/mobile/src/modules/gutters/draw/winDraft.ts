/**
 * The properties window of a gutter / downspout (DS §7.3, §9б.7; founder 16.11, #1857): «Закрыть» and «Сохранить» at the bottom.
 * Its edits show on the canvas at once (each one is written to the phone, nothing is lost), but they are one draft: «Сохранить» keeps
 * them as ONE step of «Назад», «Не сохранять» puts the drawing and its history back as they were before the window's first edit.
 * Pure — unit-tested (test/gutterWinDraft.test.ts).
 */
import type { Drawing } from "../geometry";
import { pushHistory, type History } from "../canvas/edit";

/** the drawing and the history before the window's first edit; null — the window has no edit yet */
export type WinStart = { drawing: Drawing; hist: History } | null;

/** the first edit of the window remembers where it began; later edits keep that start */
export const winStartOn = (start: WinStart, drawing: Drawing, hist: History): WinStart => start ?? { drawing, hist };

const same = (a: Drawing, b: Drawing) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** the window has unsaved edits: the drawing is not what it was before them (an edit taken back by hand is no edit) */
export const winDirty = (start: WinStart, now: Drawing): boolean => !!start && !same(start.drawing, now);

/** «Сохранить»: the window's edits stay, as one step of «Назад» (the history from before the window, plus its start) */
export function winSave(start: WinStart, now: Drawing, hist: History): History {
  if (!start) return hist;
  return same(start.drawing, now) ? start.hist : pushHistory(start.hist, start.drawing);
}

/** «Не сохранять»: the drawing and the history as before the window; null — nothing to put back */
export const winDiscard = (start: WinStart): { drawing: Drawing; hist: History } | null => (start ? { drawing: start.drawing, hist: start.hist } : null);
