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
  };
}
