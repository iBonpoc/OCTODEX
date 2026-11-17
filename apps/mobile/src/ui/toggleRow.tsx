import { type ReactNode } from "react";
import { Platform, View } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import { useDevice } from "@/theme/ThemeProvider";
import { Toggle } from "./controls";
import { haptics } from "./haptics";
import { Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/**
 * One property on / off (DS §9 А5, spec 56 §3 rows 1–2): the label on the left (and a `mut` caption), the switch on the right;
 * the whole row presses — 44 and more on a phone, `field` 34 on 820 and 1280, the zone never under 44. The row is the one element:
 * `switch` + `checked`, its label is the switch's. The fields it turns on stand right under it while it is on (`children`, §11 п.19).
 * A consent by law (SMS, e-documents) is a `ToggleRow` too, off by default, the full text as its label. `selection` on a change.
 */
export function ToggleRow({
  label,
  caption,
  value,
  onChange,
  disabled,
  testID,
  children,
}: {
  label: string;
  caption?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** the row; its switch picture — `<testID>-switch` */
  testID?: string;
  /** what this row turns on: shown right under it while it is on */
  children?: ReactNode;
}) {
  const { wide } = useDevice();
  const ro = useReadOnly();
  const off = !!(disabled || ro);
  const h = wide ? component.field.h : size.hitMin;
  const flip = () => {
    if (off) return;
    haptics.selection();
    onChange(!value);
  };
  return (
    <View style={{ gap: space[2] }}>
      <View
        // web: Space flips a switch (React Native Web presses a Pressable on Space only for a `button`); Enter is the Pressable's own
        {...(Platform.OS === "web"
          ? ({
              onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                if (e.key !== " " && e.key !== "Spacebar") return;
                e.preventDefault();
                flip();
              },
            } as object)
          : null)}
      >
        <Press
          testID={testID}
          onPress={flip}
          disabled={off}
          visibleHeight={h}
          accessibilityRole="switch"
          accessibilityLabel={caption ? `${label}, ${caption}` : label}
          accessibilityState={{ checked: value, disabled: off }}
          {...({ "aria-checked": value, "aria-disabled": off || undefined } as object)}
          style={{ minHeight: h, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[1] }}
        >
          <View style={{ flex: 1 }}>
            <T v="body">{label}</T>
            {caption ? (
              <T v="caption" tone="mut">
                {caption}
              </T>
            ) : null}
          </View>
          <View testID={testID ? `${testID}-switch` : undefined}>
            <Toggle part on={value} label={label} />
          </View>
        </Press>
      </View>
      {value && children ? <View testID={testID ? `${testID}-more` : undefined}>{children}</View> : null}
    </View>
  );
}
