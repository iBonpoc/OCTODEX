/**
 * Run `measure` once the keyboard is down (#923): the length sheet sits on the keyboard, and a tap on the unit takes the
 * keyboard away, so the sheet drops while the menu opens — a frame measured at the tap is a frame the sheet has left
 * (the menu came up high, over the drawing). Keyboard down already → at once. Otherwise: ask it to go, measure when it
 * has gone — or after `waitMs` if the news is lost. Once only.
 */
export interface KeyboardLike {
  isVisible(): boolean;
  dismiss(): void;
  /** the hidden event; returns how to stop listening */
  onHidden(fn: () => void): () => void;
}
export function measureAfterKeyboard(kb: KeyboardLike, measure: () => void, later: (fn: () => void, ms: number) => () => void, waitMs = 400): void {
  if (!kb.isVisible()) return measure();
  let done = false;
  let stopListen = () => {};
  let stopWait = () => {};
  const go = () => {
    if (done) return;
    done = true;
    stopListen();
    stopWait();
    measure();
  };
  stopListen = kb.onHidden(go);
  stopWait = later(go, waitMs);
  kb.dismiss();
}
