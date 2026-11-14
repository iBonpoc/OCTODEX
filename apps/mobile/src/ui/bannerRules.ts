/**
 * The rules of `Banner` (DS Б9, §15.3; #957) as pure functions, so a unit test holds them (review of #1436).
 * - How a change of the banner's title is said: iOS has no live regions in React Native, so the banner announces it
 *   (`AccessibilityInfo.announceForAccessibility`); Android and the web read the live region by themselves — announcing there
 *   too said it twice (review of #1436).
 * - When it is said: only when the title changed, never on the first show (the screen reader reads the screen itself then).
 * - The «✕»: only an info banner may be closed (§15.3) — the props' type forbids it on the others, this says it at run time.
 */
import type { StatusName } from "@octo/design-tokens";

export type BannerTone = Exclude<StatusName, "neutral">;

/** "announce": call announceForAccessibility; "live": the live region reads it (nothing to call) */
export function sayChangeBy(os: string): "announce" | "live" {
  return os === "ios" ? "announce" : "live";
}

/** the title changed since it was last said (the first show is not a change) */
export function titleChanged(said: string, now: string): boolean {
  return said !== now;
}

/** the «✕» is drawn: an info banner that has somewhere to close to */
export function closable(tone: BannerTone, onClose: unknown): boolean {
  return tone === "info" && typeof onClose === "function";
}

/** what the screen reader hears on a change: the tone's word, then the title (rule 2: the tone is said, not only drawn) */
export function spoken(toneWord: string, title: string): string {
  return `${toneWord}. ${title}`;
}
