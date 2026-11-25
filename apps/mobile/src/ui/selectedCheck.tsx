import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./primitives";

/**
 * The check of a chosen row or card (DS «Выделение выбранного»): «Заливка» is not the only sign of a choice (its contrast to the
 * ground is low), so a chosen card or day carries `check` in its top right corner (`left`: the desktop row, whose right edge is its buttons, #1495). Decoration: the state is read from the control.
 */
export function SelectedCheck({ small, left }: { small?: boolean; left?: boolean }) {
  const { c } = useTheme();
  return (
    <View testID="selected-check" pointerEvents="none" style={{ position: "absolute", top: space[1], ...(left ? { left: space[1] } : { right: space[1] }) }}>
      <Icon name="check" s={small || left ? size.iconXs : size.iconSm} color={c.ink} />
    </View>
  );
}
