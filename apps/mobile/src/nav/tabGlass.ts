/**
 * The phone tab bar's surface: iOS 26 «liquid glass» (expo-glass-effect) where the phone has it, else the old panel
 * (Glass: --ov + expo-blur). Android and the web have no liquid glass: the panel there is unchanged.
 * expo-glass-effect is loaded lazily: a JS update (runtimeVersion = sdkVersion) also reaches a TestFlight build made
 * before the module was added — there the native view is missing, and require/the checks throw: the old panel, no crash.
 */
import { Platform } from "react-native";
import type * as GlassModule from "expo-glass-effect";

export type TabSurface = "liquid" | "blur";

/** the checks the module gives; each may throw on a build without the native part */
export interface GlassProbe {
  os: string;
  load: () => Pick<typeof GlassModule, "isGlassEffectAPIAvailable" | "isLiquidGlassAvailable">;
}

/** liquid only on iOS, when the API exists on this iOS (some iOS 26 betas crash without it) and the app uses Liquid Glass */
export function tabSurface(p: GlassProbe): TabSurface {
  if (p.os !== "ios") return "blur";
  try {
    const m = p.load();
    return m.isGlassEffectAPIAvailable() && m.isLiquidGlassAvailable() ? "liquid" : "blur";
  } catch {
    return "blur";
  }
}

let cached: typeof GlassModule | null | undefined;
function glassModule(): typeof GlassModule {
  if (cached) return cached;
  if (cached === null) throw new Error("expo-glass-effect is not in this build");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-glass-effect") as typeof GlassModule;
    return cached;
  } catch (e) {
    cached = null;
    throw e;
  }
}

let surface: TabSurface | undefined;
/** decided once per launch */
export function deviceTabSurface(): TabSurface {
  return (surface ??= tabSurface({ os: Platform.OS, load: glassModule }));
}

/** GlassView, only after deviceTabSurface() said «liquid» */
export function liquidGlassView(): typeof GlassModule.GlassView {
  return glassModule().GlassView;
}
