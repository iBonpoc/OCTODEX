import { View } from "react-native";
import { component, radius, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "./controls";
import { T } from "./primitives";
import { badgeText } from "./headerIconRules";
import type { IconAction } from "./templates/types";

/**
 * A round icon of a screen's header (BUILD-SPEC §1 HeaderActions: search, the bell, the offline queue): `headerIcon` 36 without a
 * plate, `ink`, zone 44 (`IconButton bare`). `badge` — a count on its corner: the status fill with the number in its text (rule 2:
 * never a colour alone), `bad` by default, «99+» past 99, nothing at 0 (`badgeText`). testIDs: the action's, `<testID>-badge`.
 */
export function HeaderIcon({ action }: { action: IconAction }) {
  const { c } = useTheme();
  const text = action.badge ? badgeText(action.badge.n) : null;
  const tone = c.status[action.badge?.tone ?? "bad"];
  return (
    <View>
      <IconButton testID={action.testID} icon={action.icon} label={action.a11y} onPress={action.onPress} bare />
      {text ? (
        <View
          testID={`${action.testID}-badge`}
          pointerEvents="none"
          style={{ position: "absolute", top: space[1], right: -space[1], minWidth: component.chip.h, height: component.chip.h, paddingHorizontal: space[1], borderRadius: radius.pill, backgroundColor: tone.fill, alignItems: "center", justifyContent: "center" }}
        >
          <T v="micro" w="semibold" tabular capped style={{ color: tone.on }}>
            {text}
          </T>
        </View>
      ) : null}
    </View>
  );
}
