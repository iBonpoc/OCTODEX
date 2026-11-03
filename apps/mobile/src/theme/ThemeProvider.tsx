import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useColorScheme, useWindowDimensions } from "react-native";
import { breakpoint, themes, type ThemeColors, type ThemeName } from "@octo/design-tokens";

export type ThemePref = "system" | ThemeName;
export type Device = "phone" | "tablet" | "desktop";

interface ThemeCtx {
  name: ThemeName;
  c: ThemeColors;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPref] = useState<ThemePref>("system");
  const name: ThemeName = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const value = useMemo<ThemeCtx>(
    () => ({
      name,
      c: themes[name],
      pref,
      setPref,
      toggle: () => setPref(name === "dark" ? "light" : "dark"),
    }),
    [name, pref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}

/** Device class by width (HANDOFF: 390 / 820 / 1280). Phone is the primary target. */
export function useDevice(): { device: Device; width: number; wide: boolean } {
  const { width } = useWindowDimensions();
  const device: Device = width >= breakpoint.desktop ? "desktop" : width >= breakpoint.tablet ? "tablet" : "phone";
  return { device, width, wide: device !== "phone" };
}
