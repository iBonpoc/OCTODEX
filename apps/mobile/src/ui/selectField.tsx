import { useRef, useState } from "react";
import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Menu, type MenuItem } from "./overlays";
import { Icon, Press, T } from "./primitives";

/**
 * One of 5–12 values, kept in a form row (DS А2, #947): a row — the label on the left, the value (`mut`) and a chevron
 * on the right — and the `Menu` at the row on tap, a check at the chosen one. Under 5 short values — `Segmented`;
 * more than 12 or a search — `PickerSheet`. An error shows a line with a mark under the row.
 */
export function SelectField<K extends string>({
  label,
  value,
  items,
  onChange,
  placeholder,
  error,
  testID,
  disabled,
}: {
  label: string;
  value: K | null | undefined;
  items: { key: K; label: string }[];
  onChange: (k: K) => void;
  /** shown while nothing is chosen (default «Выберите») */
  placeholder?: string;
  /** a line under the row, `bad` with a mark */
  error?: string;
  testID?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { wide } = useDevice();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const chosen = items.find((i) => i.key === value);
  const shown = chosen?.label ?? placeholder ?? t("select.choose" as DictKey);
  const menu: MenuItem<K>[] = items.map((i) => ({ key: i.key, label: i.label, selected: i.key === value }));
  const open = () => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h }));
  return (
    <View style={{ gap: space[1] }} testID={testID}>
      <View ref={ref} collapsable={false}>
        <Press
          onPress={open}
          disabled={disabled}
          visibleHeight={wide ? size.field : size.fieldPhone}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: shown }}
          accessibilityState={{ expanded: !!anchor, disabled: !!disabled }}
          aria-haspopup="menu"
          style={{
            minHeight: wide ? size.field : size.fieldPhone,
            flexDirection: "row",
            alignItems: "center",
            gap: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.field,
            borderWidth: component.hairline,
            borderColor: error ? c.status.bad.text : c.bd,
            backgroundColor: c.in,
          }}
        >
          <T v="body" style={{ flex: 1 }} numberOfLines={1}>
            {label}
          </T>
          <T v="body" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
            {shown}
          </T>
          <Icon name="chevronDown" s={size.iconSm} color={c.mut} />
        </Press>
      </View>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }} accessibilityLiveRegion="polite">
          <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
          <T v="caption" tone="bad">
            {error}
          </T>
        </View>
      ) : null}
      <Menu visible={!!anchor} anchor={anchor} items={menu} onSelect={onChange} onClose={() => setAnchor(null)} title={label} />
    </View>
  );
}
