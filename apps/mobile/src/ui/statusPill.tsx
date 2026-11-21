/**
 * StatusPill (visual v2 «Плашка статуса»): a status as an icon and a word — `chip.h` 24, radius 12, the icon `statusPill.icon` 13
 * and the word 12/600 in the quiet tones `status[x].fill` / `.text` of the theme (ok #86D3A0/#1C2E23 …), padding 7 · 9. Five: ok ✓, info ◷, warn !, bad ×, neutral ✎. It presses only
 * where the office changes the status (the object's header → `StatusPicker`); elsewhere it is text.
 */
import { View } from "react-native";
import { component, radius, space, spaceHalf, statusIcon, type StatusName } from "@octo/design-tokens";
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
        paddingLeft: component.statusPill.padL,
        paddingRight: component.statusPill.padR,
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
      <Icon name={statusIcon[status]} s={component.statusPill.icon} color={st.text} />
      <T v="micro" w="semibold" capped style={{ color: st.text, flexShrink: 1 }}>
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
