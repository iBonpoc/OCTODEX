import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";

/**
 * A quick way to reach the client from a record's card: a round button with its word under it (prototype v6:
 * Позвонить · Написать · Маршрут). The client's card and the job's card use the same one (#1343, #1474).
 */
export function ActionTile({ icon, label, onPress, testID }: { icon: IconKey; label: string; onPress: () => void; testID: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} containerStyle={{ flex: 1 }} style={{ alignItems: "center", gap: space[1], minHeight: size.hitMin }}>
      <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} />
      </View>
      <T v="caption" tone="mut" center>
        {label}
      </T>
    </Press>
  );
}
