import type { ViewStyle } from "react-native";
import { component } from "@octo/design-tokens";
import type { ThemeColors } from "@octo/design-tokens";

/**
 * «Заливка» (DS «Выделение выбранного», #1306): the one look of a chosen segment, tab, chip and choice — a neutral raised fill
 * with the small shadow (`component.shadowSm`). Never `acc` (the main action's yellow) and never a status colour.
 * The unchosen: no fill, text `mut`.
 */
export function fillStyle(c: ThemeColors): ViewStyle {
  return {
    backgroundColor: c.surf2,
    shadowColor: c.shadow.color,
    shadowOpacity: component.shadowSm.opacity,
    shadowRadius: component.shadowSm.radius,
    shadowOffset: { width: 0, height: component.shadowSm.offsetY },
    // Android draws no shadow* props: the same lift as an elevation
    elevation: component.shadowSm.elevation,
  };
}

/**
 * «Заливка» without the shadow: for a moving slider only — the tab bar's pill (inside the iOS 26 GlassView) and Segmented's.
 * Their width and left animate every frame; a shadow (shadow* / elevation) on that layer is the main suspect of the iOS crash
 * on «Сегодня» (#1354, build 1351), so the slider carries the fill alone. Static chips, days and cards keep `fillStyle`.
 * Palette A (#2350): the surfaces are opaque and `surf2` over the segment's `track` is the same tone (1.03 : 1 dark, 1.09 light) —
 * the slider is `surf` (1.20 / 1.34 : 1 over the track), the raised card tone; the weight and ink-vs-mut text stay the sure sign.
 */
export function fillStyleFlat(c: ThemeColors): ViewStyle {
  return { backgroundColor: c.surf };
}
