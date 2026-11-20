/**
 * The colour set of the app (#2292, Ш2): «Наряд» (default) or «Графит». Chosen in the hidden developer card of Settings,
 * kept on this device only (not the company, not the account). Off = the very same `themes[name]` object as before.
 */
import { graphiteThemes, graphiteToTheme, themes, type ThemeColors, type ThemeName } from "@octo/design-tokens";

export type Skin = "naryad" | "graphite";
export const SKIN_KEY = "octo.ds.skin.v1";
export const DEFAULT_SKIN: Skin = "naryad";

/** only the exact "graphite" is «Графит»: anything else (junk, old value) is «Наряд» */
export const parseSkin = (v: unknown): Skin => (v === "graphite" ? "graphite" : DEFAULT_SKIN);

const cache = new Map<ThemeName, ThemeColors>();
/** the colours for a skin and a theme; «Наряд» returns `themes[name]` itself, «Графит» a mapped copy (made once) */
export function colorsFor(skin: Skin, name: ThemeName): ThemeColors {
  if (skin !== "graphite") return themes[name];
  let c = cache.get(name);
  if (!c) cache.set(name, (c = graphiteToTheme(themes[name], graphiteThemes[name])));
  return c;
}
