import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./primitives";

/**
 * The mark of a chosen thing (DS §9 «Выделение выбранного», spec 56 §3.2): `check` `iconMd` in `ink` at the right edge of a row,
 * in the place of «›» (`placement="row"`), or in the top right corner of a tile (`placement="corner"`, `space[2]` in). Never `acc`,
 * never green, never a circle, never on the left of a row. A picture: the state is read from the row or tile that holds it.
 * Dark theme: `ink` is light there, ≥ 3:1 to `surf`. Replaces `SelectedCheck` (waves 2–6 of spec 56).
 */
export function CheckMark({ placement = "row", testID = "check-mark" }: { placement?: "row" | "corner"; testID?: string }) {
  const { c } = useTheme();
  const corner = placement === "corner";
  return (
    <View
      testID={testID}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={corner ? { position: "absolute", top: space[2], right: space[2] } : { flexShrink: 0 }}
    >
      <Icon name="check" s={size.iconMd} color={c.ink} />
    </View>
  );
}
