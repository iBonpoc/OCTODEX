import { accents, themes, withHighContrast, type AccentName, type ThemeColors, type ThemeName } from "@octo/design-tokens";

/** the colours of a theme: the accent laid over it, and GoRix «Повышение контраста» when the system asks for it (этап 3) */
export function themeColors(name: ThemeName, accent: AccentName, highContrast: boolean): ThemeColors {
  const c = { ...themes[name], ...accents[accent][name] };
  return highContrast ? withHighContrast(c, name) : c;
}
