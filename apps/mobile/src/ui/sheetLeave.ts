import { Platform } from "react-native";

/**
 * How a sheet leaves (DS Б1, #1163): `true` — the person's close goes out FIRST inside the Modal and only then asks the
 * owner, and the owner's own close cuts (iOS: a Modal that is still going out blocks the next sheet and its touches, #743);
 * `false` — the owner is asked first and the sheet stays on the screen while it goes out (web, Android).
 * A test sets `globalThis.__octoSheetLeave = "before" | "after"` to run either way on the web.
 */
export function leaveBefore(): boolean {
  const forced = (globalThis as { __octoSheetLeave?: string }).__octoSheetLeave;
  if (forced === "before") return true;
  if (forced === "after") return false;
  return Platform.OS === "ios";
}
