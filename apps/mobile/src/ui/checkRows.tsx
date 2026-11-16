import type { ReactNode } from "react";
import { View } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { Card, Divider, RowView } from "./surfaces";

export interface CheckItem<K extends string> {
  key: K;
  label: string;
  /** a line under the name — `mut` */
  subtitle?: string;
}

/**
 * Several of many (DS §А4, §А1в «чипы не переносятся», #1797): one row per item — the name on the left, a flag on the right
 * (22, `check` inside when chosen: «Заливка» rule — not yellow, not a status colour); a row is a `checkbox` for the screen
 * reader. Instead of wrapping chips: a list reads in one column on any width and holds a long word. `footer` — the last
 * row of the same card (e.g. «＋ Своё направление»).
 */
export function CheckRows<K extends string>({
  items,
  value,
  onChange,
  footer,
  testID = "check-rows",
}: {
  items: CheckItem<K>[];
  value: K[];
  onChange: (v: K[]) => void;
  footer?: ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const toggle = (k: K) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <Card style={{ paddingVertical: space[1], gap: 0 }}>
      <View testID={testID}>
        {items.map((it, i) => {
          const on = value.includes(it.key);
          return (
            <View key={it.key}>
              {i > 0 ? <Divider /> : null}
              <Press
                testID={`${testID}-${it.key}`}
                onPress={() => toggle(it.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={it.label}
                {...({ "aria-checked": on } as object)}
              >
                <RowView style={{ minHeight: component.rowOption, paddingVertical: space[2], gap: space[3] }}>
                  <View style={{ flex: 1 }}>
                    <T v="body" w={on ? "semibold" : undefined} numberOfLines={2}>
                      {it.label}
                    </T>
                    {it.subtitle ? (
                      <T v="caption" tone="mut" numberOfLines={2}>
                        {it.subtitle}
                      </T>
                    ) : null}
                  </View>
                  <View
                    style={{
                      width: component.checkbox.size,
                      height: component.checkbox.size,
                      borderRadius: component.checkbox.radius,
                      borderWidth: component.checkbox.border,
                      borderColor: on ? c.ink : c.bdField,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on ? <Icon name="check" s={size.iconSm} color={c.ink} /> : null}
                  </View>
                </RowView>
              </Press>
            </View>
          );
        })}
        {footer ? (
          <View>
            {items.length ? <Divider /> : null}
            {footer}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
