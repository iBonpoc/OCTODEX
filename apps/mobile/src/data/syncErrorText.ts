/**
 * The sync error under «Профиль и аккаунт» in our own words only (debt 2 of «Сметы» №1, review #259): the store keeps
 * the server's text for support, the screen never shows it. The fetch of the browser / React Native found no server
 * → «no connection»; any other failure (the server answered, or we cannot tell) → one general text. A refusal we can
 * explain is told by its own card (REJECT_REASONS, outboxRejected.ts), not here. Pure: test/syncErrorText.test.ts.
 */
export type SyncErrorKey = "account.syncErr.network" | "account.syncErr.general";

/** only the words of a fetch that got no answer at all — not «timeout» or «aborted», which the server also writes
 *  («canceling statement due to statement timeout», «current transaction is aborted»; review PR-A №4) */
const NO_ANSWER = /^(TypeError: )?(failed to fetch|network request failed|load failed|networkerror when attempting to fetch resource\.?|fetch failed)$/i;

export const syncErrorKey = (error: string): SyncErrorKey => (NO_ANSWER.test(error.trim()) ? "account.syncErr.network" : "account.syncErr.general");
