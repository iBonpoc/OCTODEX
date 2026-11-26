/**
 * #2853: unsaved edits of an editor (a new lead, a new client, a client's edit) are never lost by a «back» that is not the
 * header's «×»: the iOS back swipe (since iOS 26 from anywhere on the screen), the Android system «Назад», the browser's back.
 * EditorScreen holds the screen's removal while it is `dirty` (usePreventRemove) and asks the same «Выйти без сохранения?».
 *
 * No React here (test/leaveGuard.test.ts); the component that uses it is ./EditorScreen.tsx.
 */
import type { MainAction } from "./types";

/**
 * The screen's removal is held: there are unsaved edits, the screen is the one in front (a form under another card — a
 * new lead → «already a client» → the client — is the tab bar's to ask, nav/tabBarRule `formsAbove`), and it is not the
 * showcase frame (no screen of its own to hold).
 */
export const guardOn = (dirty: boolean, focused: boolean, preview: boolean): boolean => dirty && focused && !preview;

/**
 * The main step leaves the screen when pressed: it is ready — not off and no reason said over it (a reason means a tap only
 * shows what is missing, useRequiredForm, and the screen stays). The guard steps aside for it: a save is not a loss.
 */
export const stepLeaves = (step: Pick<MainAction, "disabled" | "reason">): boolean => !step.disabled && !step.reason;

/**
 * «Выйти» in the question: a held «back» (a swipe, the system or browser back) goes on as it was asked; the header's «×»
 * (asked before anything was sent) lifts the guard and goes back by the screen's own way.
 */
export function leaveNow(held: (() => void) | null, lift: () => void, back: () => void): void {
  if (held) return held();
  lift();
  back();
}
