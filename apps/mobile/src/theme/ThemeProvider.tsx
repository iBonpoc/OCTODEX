import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme, useWindowDimensions } from "react-native";
import { usePersistentState } from "@/data/persist";
import { breakpoint, themes, type ThemeColors, type ThemeName } from "@octo/design-tokens";
import { colorsFor, DEFAULT_SKIN, parseSkin, SKIN_KEY, type Skin } from "./skin";

export type ThemePref = "system" | ThemeName;
export type Device = "phone" | "tablet" | "desktop";

interface ThemeCtx {
  name: ThemeName;
  c: ThemeColors;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
  /** the colour set (#2292): «Наряд» unless the developer card turned «Графит» on */
  skin: Skin;
  setSkin: (s: Skin) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPref, ready] = usePersistentState<ThemePref>("octo.theme.v1", "system");
  const [skinRaw, setSkinRaw, skinReady] = usePersistentState<Skin>(SKIN_KEY, DEFAULT_SKIN);
  const skin = parseSkin(skinRaw);
  const name: ThemeName = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const value = useMemo<ThemeCtx>(
    () => ({
      name,
      c: colorsFor(skin, name),
      pref,
      setPref,
      toggle: () => setPref(name === "dark" ? "light" : "dark"),
      skin,
      setSkin: setSkinRaw,
    }),
    [name, pref, skin],
  );
  if (!ready || !skinReady) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** a theme fixed by the system's scheme, before the stored one is read (the boot layer, DS §18.2 «Запуск», #1046):
 *  the ui works in it, the choice cannot be changed there */
export function StaticThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  const value = useMemo<ThemeCtx>(() => ({ name, c: themes[name], pref: "system", setPref: () => {}, toggle: () => {}, skin: DEFAULT_SKIN, setSkin: () => {} }), [name]);
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
