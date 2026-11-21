/**
 * StatusPill (BUILD-SPEC §1): a status as an icon and a word — `chip.h` 24, `chip.px` 10, the icon `statusIcon` 12 and the
 * word 12 semibold in `status[x].fill` / `.text` of the theme. Five: ok ✓, info ◷, warn !, bad ×, neutral ✎. It presses only
 * where the office changes the status (the object's header → `StatusPicker`); elsewhere it is text.
 */
import { View } from "react-native";
import { component, radius, size, space, spaceHalf, statusIcon, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";

export function StatusPill({ status, label, onPress, a11y, testID }: {
  status: StatusName;
  label: string;
  /** the office in the object's header: opens the status picker */
  onPress?: () => void;
  /** what a screen reader hears on a pressable pill («Статус: Отправлена, изменить») — default the word */
  a11y?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const st = c.status[status];
  const pill = (
    <View
      accessibilityRole={onPress ? undefined : "text"}
      accessibilityLabel={onPress ? undefined : label}
      testID={onPress ? undefined : testID}
      style={{
        minHeight: component.chip.h,
        paddingHorizontal: component.chip.px,
        paddingVertical: spaceHalf.hair,
        borderRadius: radius.pill,
        backgroundColor: st.fill,
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        alignSelf: "flex-start",
        // a long word (RU / ES, a bigger system font) wraps inside the pill, it is never cut
        maxWidth: "100%",
      }}
    >
      <Icon name={statusIcon[status]} s={size.iconXs} color={st.text} />
      <T v="micro" w="semibold" style={{ color: st.text, flexShrink: 1 }}>
        {label}
      </T>
    </View>
  );
  if (!onPress) return pill;
  return (
    <Press onPress={onPress} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={a11y ?? label} testID={testID} containerStyle={{ alignSelf: "flex-start" }}>
      {pill}
    </Press>
  );
}
