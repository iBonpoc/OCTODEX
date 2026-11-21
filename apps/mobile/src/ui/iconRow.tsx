import { View } from "react-native";
import { component, radius, size } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { ICON_ROW_LABEL_LINES, iconRowItems, type IconRowVariant } from "./iconRowRules";
import type { IconAction } from "./templates/types";

/** an IconRow action: the shared `IconAction` + its visible caption («Позвонить») and, when it cannot be done, why */
export type IconRowItem = IconAction & { label?: string; disabled?: boolean; reason?: string };

/**
 * QuickActions — the icon AND its word (BUILD-SPEC §1: a bare icon is not recognised in the sun), a replacement of `features/ActionTile`.
 * `row`: 3…5 circles `roundButton.quick` 44 on `surf` with the top highlight (visual v2), icon 20 `ink`, the caption 12 medium `mut` under it, across the width; the fifth
 * is «Ещё» (the screen gives it); a caption takes up to two lines (`ICON_ROW_LABEL_LINES`), never cut to «…». `inline`: 2 circles `quickAction.inline` 36 with the 44 touch zone (the header's address line), the
 * word is the VoiceOver label. Pressed — `pressScale` (Press); unavailable — `dimOpacity`, the reason is the VoiceOver hint. No accent
 * in either theme. More than the limit is cut and told in development (`iconRowItems`).
 * testIDs: each action's own `testID`; the row `testID`.
 */
export function IconRow({ actions, variant = "row", testID }: { actions: IconRowItem[]; variant?: IconRowVariant; testID?: string }) {
  const { c } = useTheme();
  const { shown, problem } = iconRowItems(actions, variant);
  if (problem && __DEV__) console.warn(problem);
  const inline = variant === "inline";
  const d = inline ? component.quickAction.inline : component.roundButton.quick;
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-start", gap: component.iconRow.gap, ...(inline ? null : { alignSelf: "stretch", justifyContent: "space-around" }) }}>
      {shown.map((a) => (
        <Press
          key={a.testID}
          testID={a.testID}
          onPress={a.onPress}
          disabled={a.disabled}
          visibleHeight={d}
          accessibilityRole="button"
          accessibilityLabel={a.a11y}
          accessibilityHint={a.disabled ? a.reason : undefined}
          accessibilityState={{ disabled: !!a.disabled }}
          containerStyle={inline ? undefined : { flex: 1, maxWidth: component.quickAction.labelW, alignItems: "center" }}
          style={{ alignItems: "center", gap: component.iconRow.gap }}
        >
          {/* the circle is the look this component defines (BUILD-SPEC §1 QuickActions); the touch is the whole column */}
          {/* visual v2 «Круглые кнопки»: the quick row's 44 is a card on the screen (`surf` + the top highlight); inline — the cell */}
          <View style={{ width: d, height: d, borderRadius: radius.pill, backgroundColor: inline ? c.surf2 : c.surf, borderTopWidth: inline ? 0 : component.hairline, borderTopColor: c.hl, alignItems: "center", justifyContent: "center" }}>
            <Icon name={a.icon} s={size.iconMd} color={c.ink} />
          </View>
          {!inline && a.label ? (
            // up to two lines, never «…»: «Напомнить» / «Записать в план» do not fit the 64 cell at 12 (wave 3); the circles stay on one line
            <T v="micro" w="medium" tone="mut" numberOfLines={ICON_ROW_LABEL_LINES} center capped style={{ maxWidth: component.quickAction.labelW }}>
              {a.label}
            </T>
          ) : null}
        </Press>
      ))}
    </View>
  );
}
