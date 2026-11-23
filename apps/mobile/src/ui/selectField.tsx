import { useRef, useState } from "react";
import { useFieldScroll, type FieldBinding } from "./requiredForm";
import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { Platform } from "react-native";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu, type MenuItem } from "./overlays";
import { LeadingMark, PickerSheet, type PickerItem } from "./pickerSheet";
import { opensList } from "./menuLayout";
import { Icon, Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/** a longer list is not a menu (DS А2: more than 12 → PickerSheet) */
export const MENU_MAX = component.select.menuMaxItems;

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
  labelAbove,
  onOpen,
  expanded,
  controls,
  rowRef,
}: {
  label: string;
  value: K | null | undefined;
  /** a picture / a sample / a line under the name, or a long name, open a list instead of the menu (DS §9б.2); `top` — its own group first */
  items: PickerItem<K>[];
  onChange: (k: K) => void;
  /** shown while nothing is chosen (default «Выберите») */
  placeholder?: string;
  /** a line under the row, `bad` with a mark */
  error?: string;
  testID?: string;
  disabled?: boolean;
  /** a required field of a form (`useRequiredForm().field(id)`): its error and its place for the scroll */
  field?: FieldBinding;
  /** the label over the field, as a number field has it (a row of narrow fields, DS §8.3 «Кол-во · Ед. · Цена»); the
   *  field itself shows only the value */
  labelAbove?: boolean;
  /** the owner's own sheet opens instead of the menu — a list with groups and «＋ Новый …» (the sources, spec 56 §3а.5); `items` then
   *  only name the chosen value */
  onOpen?: () => void;
  /** with `onOpen`: what the owner opened under the row is open now (DateField's calendar) — read to the screen reader */
  expanded?: boolean;
  /** with `expanded`: the id of what opens under the row (`aria-controls`; no `aria-haspopup` — it is not a popup) */
  controls?: string;
  /** the row itself — the owner gives the focus back to it (DateField after a pick) */
  rowRef?: (n: React.ComponentRef<typeof View> | null) => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const ro = useReadOnly();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const chosen = items.find((i) => i.key === value);
  const shownError = error ?? field?.error;
  const shown = chosen?.label ?? placeholder ?? t("ui.select.choose");
  const menu: MenuItem<K>[] = items.map((i, n) => ({ key: i.key, label: i.label, selected: i.key === value, group: n > 0 && !!items[n - 1]!.top && !i.top, testID: testID ? `${testID}-${i.key}` : undefined }));
  // more than 12 values, a long name or a picture are not a menu: a list (DS §9б.2); the field's «›» says so before the tap
  const long = opensList(items, MENU_MAX, component.select.menuMaxChars);
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
  useFieldScroll(field);
  const open = () => (onOpen ? onOpen() : long ? openPicker() : ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h })));
  return (
    <View ref={field?.anchorRef} collapsable={false} style={{ gap: space[1] }} testID={testID ?? field?.testID}>
      {labelAbove ? (
        <T v="micro" tone="mut">
          {label}
        </T>
      ) : null}
      <View ref={(n) => { ref.current = n; rowRef?.(n); }} collapsable={false}>
        <Press
          testID={testID ? `${testID}-button` : undefined}
          onPress={open}
          disabled={disabled || ro}
          visibleHeight={size.fieldPhone}
          accessibilityRole="button"
          // the web reads the label instead of the button's text and ignores the value: the chosen one goes into the label
          accessibilityLabel={Platform.OS === "web" ? `${label}, ${shown}` : label}
          accessibilityValue={{ text: shown }}
          accessibilityState={{ expanded: !!anchor || picker || !!expanded, disabled: !!(disabled || ro) }}
          // the web reads `aria-expanded` only when it is set on the element (as est-bar-total does)
          {...({ "aria-expanded": !!anchor || picker || !!expanded } as object)}
          {...(expanded !== undefined && onOpen ? ({ "aria-controls": controls } as object) : ({ "aria-haspopup": long || onOpen ? "dialog" : "menu" } as object))}
          style={{
            minHeight: size.fieldPhone,
            flexDirection: "row",
            alignItems: "center",
            gap: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.field,
            borderWidth: component.hairline,
            borderColor: shownError ? c.status.bad.fill : c.bdField,
            backgroundColor: c.in,
          }}
        >
          {labelAbove ? null : (
            <T v="body" style={{ flex: 1 }} numberOfLines={1}>
              {label}
            </T>
          )}
          {chosen?.leading && !("image" in chosen.leading) ? <LeadingMark leading={chosen.leading} inField /> : null}
          <T v="body" tone={labelAbove ? "ink" : "mut"} numberOfLines={1} style={labelAbove ? { flex: 1 } : { flexShrink: 1 }}>
            {shown}
          </T>
          <Icon name={long ? "chevronRight" : "chevronDown"} s={size.iconSm} color={c.mut} />
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
        <PickerSheet visible={picker} title={label} items={items} search={items.length >= component.select.searchFrom} value={value} onSelect={(k) => { field?.clear(); onChange(k); }} onClose={closePicker} testID={testID ? `${testID}-picker` : undefined} />
      ) : (
        <Menu visible={!!anchor} anchor={anchor} items={menu} onSelect={(k) => { field?.clear(); onChange(k); }} onClose={() => setAnchor(null)} a11yLabel={label} fit />
      )}
    </View>
  );
}
