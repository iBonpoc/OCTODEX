import { Platform, useWindowDimensions } from "react-native";

/**
 * The system text size (iOS Dynamic Type, Android font scale): 1 — the standard, 1.25 — one step bigger (DS §4.3, #2761).
 * react-native-web has none (always 1), so an e2e that draws the page with the bigger text (`e2e/fontScale.cjs`) sets
 * `globalThis.__octoFontScale` to the same number — the layout that depends on it is then seen in the browser too.
 */
export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  const forced = Platform.OS === "web" ? (globalThis as { __octoFontScale?: number }).__octoFontScale : undefined;
  return forced ?? fontScale ?? 1;
}
