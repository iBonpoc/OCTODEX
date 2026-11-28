import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, useColorScheme, useWindowDimensions } from "react-native";
import { usePersistentState } from "@/data/persist";
import { breakpoint, themes, type AccentName, type ThemeColors, type ThemeName } from "@octo/design-tokens";
import { themeColors } from "./colors";
export { themeColors };

export type ThemePref = "system" | ThemeName;
export type Device = "phone" | "tablet" | "desktop";

interface ThemeCtx {
  name: ThemeName;
  c: ThemeColors;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
  /** GoRix этап 3: «Повышение контраста» системы включено — серые, жёлтые слова и слова статусов ≥ 7:1 (`highContrast`) */
  highContrast: boolean;
  /** founder 21.11 (#2350): palette A — one muted yellow (kept as a value for a future choice) */
  accent: AccentName;
  setAccent: (a: AccentName) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

/** the system's «more contrast» switch: iOS «Повышение контраста» (darker system colors), Android «Текст с высоким контрастом»,
 *  the web `prefers-contrast: more`; false where the platform cannot tell */
export function useSystemHighContrast(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-contrast: more)") : null;
      if (!mq) return;
      setOn(mq.matches);
      const h = (e: { matches: boolean }) => setOn(e.matches);
      mq.addEventListener?.("change", h);
      return () => mq.removeEventListener?.("change", h);
    }
    const ios = Platform.OS === "ios";
    const ask = ios ? AccessibilityInfo.isDarkerSystemColorsEnabled : AccessibilityInfo.isHighTextContrastEnabled;
    let alive = true;
    ask?.call(AccessibilityInfo)?.then((v: boolean) => alive && setOn(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(ios ? "darkerSystemColorsChanged" : "highTextContrastChanged", (v: boolean) => setOn(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}


export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPref, ready] = usePersistentState<ThemePref>("octo.theme.v1", "system");
  const [accent, setAccent, accReady] = usePersistentState<AccentName>("octo.accent.v3", "yellow", { validate: (v) => v === "yellow" });
  const name: ThemeName = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const highContrast = useSystemHighContrast();
  const value = useMemo<ThemeCtx>(
    () => ({
      name,
      c: themeColors(name, accent, highContrast),
      highContrast,
      pref,
      setPref,
      toggle: () => setPref(name === "dark" ? "light" : "dark"),
      accent,
      setAccent,
    }),
    [name, pref, accent, highContrast],
  );
  if (!ready || !accReady) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** a theme fixed by the system's scheme, before the stored one is read (the boot layer, DS §18.2 «Запуск», #1046):
 *  the ui works in it, the choice cannot be changed there */
export function StaticThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  const value = useMemo<ThemeCtx>(() => ({ name, c: themes[name], highContrast: false, pref: "system", setPref: () => {}, toggle: () => {}, accent: "yellow", setAccent: () => {} }), [name]);
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
