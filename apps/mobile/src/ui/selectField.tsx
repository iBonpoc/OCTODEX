import { useRef, useState } from "react";
import type { FieldBinding } from "./requiredForm";
import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { Platform } from "react-native";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu, type MenuItem } from "./overlays";
import { PickerSheet } from "./pickerSheet";
import { Icon, Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/** a longer list is not a menu (DS А2: more than 12 → PickerSheet) */
export const MENU_MAX = 12;

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
  field,
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
  /** a required field of a form (`useRequiredForm().field(id)`): its error and its place for the scroll */
  field?: FieldBinding;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const ro = useReadOnly();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const chosen = items.find((i) => i.key === value);
  const shownError = error ?? field?.error;
  const shown = chosen?.label ?? placeholder ?? t("ui.select.choose");
  const menu: MenuItem<K>[] = items.map((i) => ({ key: i.key, label: i.label, selected: i.key === value, testID: testID ? `${testID}-${i.key}` : undefined }));
  // more than 12 values are not a menu: a sheet with search (DS А2 → А3)
  const long = items.length > MENU_MAX;
  const [picker, setPicker] = useState(false);
  // web: the focus goes back to the row when the sheet closes — Esc, a pick or the ✕ (DS А3), as the menu does
  const opener = useRef<Element | null>(null);
  const openPicker = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") opener.current = document.activeElement;
    setPicker(true);
  };
  const closePicker = () => {
    setPicker(false);
    const el = opener.current as HTMLElement | null;
    opener.current = null;
    if (Platform.OS === "web" && el && typeof el.focus === "function") requestAnimationFrame(() => el.isConnected && el.focus());
  };
  const open = () => (long ? openPicker() : ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h })));
  return (
    <View ref={field?.anchorRef} collapsable={false} style={{ gap: space[1] }} testID={testID ?? field?.testID}>
      <View ref={ref} collapsable={false}>
        <Press
          testID={testID ? `${testID}-button` : undefined}
          onPress={open}
          disabled={disabled || ro}
          visibleHeight={size.fieldPhone}
          accessibilityRole="button"
          // the web reads the label instead of the button's text and ignores the value: the chosen one goes into the label
          accessibilityLabel={Platform.OS === "web" ? `${label}, ${shown}` : label}
          accessibilityValue={{ text: shown }}
          accessibilityState={{ expanded: !!anchor || picker, disabled: !!(disabled || ro) }}
          aria-haspopup={long ? "dialog" : "menu"}
          style={{
            minHeight: size.fieldPhone,
            flexDirection: "row",
            alignItems: "center",
            gap: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.field,
            borderWidth: component.hairline,
            borderColor: shownError ? c.status.bad.fill : c.bd,
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
      {shownError ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }} accessibilityLiveRegion="polite" testID={(testID ?? field?.testID) ? `${testID ?? field?.testID}-error` : undefined}>
          <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
          <T v="caption" tone="bad">
            {shownError}
          </T>
        </View>
      ) : null}
      {long ? (
        <PickerSheet visible={picker} title={label} items={items} value={value} onSelect={(k) => { field?.clear(); onChange(k); }} onClose={closePicker} testID={testID ? `${testID}-picker` : undefined} />
      ) : (
        <Menu visible={!!anchor} anchor={anchor} items={menu} onSelect={(k) => { field?.clear(); onChange(k); }} onClose={() => setAnchor(null)} title={label} matchWidth />
      )}
    </View>
  );
}
