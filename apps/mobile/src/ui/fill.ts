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
 */
export function fillStyleFlat(c: ThemeColors): ViewStyle {
  return { backgroundColor: c.surf2 };
}
