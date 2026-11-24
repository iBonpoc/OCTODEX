import type { ReactNode } from "react";
import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "./primitives";
import { badgeText } from "./headerIconRules";
import type { IconAction } from "./templates/types";

/**
 * The round button of the one header (docs/design/visual-v2.html «Единая шапка»): a circle `header.circle` 40 on the card tone
 * (`surf`, one tone lighter than the ground, no frame), the icon 20, the zone 44. Every control of the row is one of these —
 * «←», «×», search, the bell, «＋», «⋯» — no bare icons, no second size (audit 12 §1). `dot` — the «Демо» dot 6 `warn` on its corner
 * (the folded header, v2 «Где строка версии и «Демо»»). `children` — instead of the icon (the avatar's initials).
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  testID,
  dot,
  children,
  hint,
  popup,
}: {
  icon?: IconKey;
  label: string;
  onPress?: () => void;
  testID?: string;
  dot?: ReactNode;
  children?: ReactNode;
  hint?: string;
  /** the button opens a menu or a sheet (VoiceOver «всплывающее») */
  popup?: boolean;
}) {
  const { c } = useTheme();
  const s = component.header.circle;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      visibleHeight={s}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-haspopup={popup ? "menu" : undefined}
      style={{ width: s, height: s, borderRadius: radius.pill, backgroundColor: c.surf, alignItems: "center", justifyContent: "center" }}
    >
      {children ?? (icon ? <Icon name={icon} s={size.iconMd} color={c.ink} /> : null)}
      {dot}
    </Press>
  );
}

/**
 * A round icon of a screen's header (search, the bell, the offline queue) — a `HeaderButton`. `badge` — a count on its corner: the
 * status fill with the number in its text (rule 2: never a colour alone), `bad` by default, «99+» past 99, nothing at 0
 * (`badgeText`); `badge.dot` — a dot 8 instead (the bell: the count is in the label). testIDs: the action's, `<testID>-badge`.
 */
export function HeaderIcon({ action }: { action: IconAction }) {
  const { c } = useTheme();
  const text = action.badge ? badgeText(action.badge.n) : null;
  const tone = c.status[action.badge?.tone ?? "bad"];
  const d = component.header.bellDot;
  return (
    <View>
      <HeaderButton testID={action.testID} icon={action.icon} label={action.a11y} onPress={action.onPress} />
      {text && action.badge?.dot ? (
        // v2 `.bd`: the dot 8 in the status's text tone, ringed by the circle's own tone, inside the circle's corner — the number is
        // read by VoiceOver from the button's label (founder approved v2 after rule 2: DS §12.13)
        <View
          testID={`${action.testID}-badge`}
          pointerEvents="none"
          style={{ position: "absolute", top: space[2] - component.header.ringGap, right: space[2] - component.header.ringGap, width: d + 2 * component.header.ringGap, height: d + 2 * component.header.ringGap, borderRadius: radius.pill, backgroundColor: c.surf, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: d, height: d, borderRadius: radius.pill, backgroundColor: tone.text }} />
        </View>
      ) : text ? (
        <View
          testID={`${action.testID}-badge`}
          pointerEvents="none"
          style={{ position: "absolute", top: -space[1], right: -space[1], minWidth: component.chip.h, height: component.chip.h, paddingHorizontal: space[1], borderRadius: radius.pill, backgroundColor: tone.fill, alignItems: "center", justifyContent: "center" }}
        >
          <T v="micro" w="semibold" tabular capped style={{ color: tone.on }}>
            {text}
          </T>
        </View>
      ) : null}
    </View>
  );
}
