/**
 * The sync error under «Профиль и аккаунт» in our own words only (debt 2 of «Сметы» №1, review #259): the store keeps
 * the server's text for support, the screen never shows it. No answer of the server at all → «no connection»; any
 * other failure → one general text (the change stays on the phone and goes later, rule 6). A refusal we can explain is
 * told by its own card (REJECT_REASONS, outboxRejected.ts), not here. Pure: test/syncErrorText.test.ts.
 */
import { classify } from "./outboxRetry";

export type SyncErrorKey = "account.syncErr.network" | "account.syncErr.general";

export function syncErrorKey(error: string): SyncErrorKey {
  // the store keeps e.message: classify reads the text only when there is no status or code — as here
  return classify(new Error(error)) === "network" ? "account.syncErr.network" : "account.syncErr.general";
}
