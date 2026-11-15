import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { TextField } from "./controls";
import { Sheet } from "./overlays";
import { Icon, T } from "./primitives";
import { Card, ListRow } from "./surfaces";
import { component, space } from "@octo/design-tokens";

/** an Esc this soon after the field emptied itself is the one that emptied it (the browser clears a search field on Esc) */
const ESC_AFTER_CLEAR_MS = 400;

export interface PickerItem<K extends string> {
  key: K;
  label: string;
  /** a line under the name (an address, a price) — `mut` */
  subtitle?: string;
}

/**
 * A long list with search (DS А3, #1164): a `large` sheet, the search first in the body, a row per item with `check`
 * at the chosen one, «Ничего не нашлось» when the search finds nothing. The list is the sheet's own scroll (no nested
 * ScrollView), so the swipe down and the keyboard keep working. `SelectField` opens it for more than 12 items.
 */
export function PickerSheet<K extends string>({
  visible,
  title,
  items,
  value,
  onSelect,
  onClose,
  onExited,
  testID = "picker-sheet",
}: {
  visible: boolean;
  title: string;
  items: PickerItem<K>[];
  value: K | null | undefined;
  onSelect: (k: K) => void;
  onClose: () => void;
  /** the sheet is gone (what the pick opens next — a row, a field — takes its focus only now, DS Б1) */
  onExited?: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const qNow = useRef(q);
  qNow.current = q;
  // a search field clears itself on Esc in the browser, before the key reaches the sheet: that press is still the first
  const clearedAt = useRef(0);
  const change = (v: string) => {
    if (!v && qNow.current) clearedAt.current = Date.now();
    setQ(v);
  };
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((i) => `${i.label} ${i.subtitle ?? ""}`.toLowerCase().includes(needle)) : items;
  }, [items, q]);
  const close = () => {
    setQ("");
    onClose();
  };
  return (
    // Esc: the first press clears the search, the second closes (DS А3)
    <Sheet visible={visible} onClose={close} onExited={onExited} title={title} height="large" onEscape={() => (qNow.current ? (change(""), true) : Date.now() - clearedAt.current < ESC_AFTER_CLEAR_MS)}>
      <View testID={testID} style={{ gap: space[2] }}>
        <View testID={`${testID}-search`} accessibilityRole="search">
          <TextField type="search" icon="search" value={q} onChangeText={change} placeholder={t("ui.picker.search")} label={t("ui.picker.search")} />
        </View>
        {found.length === 0 ? (
          <View testID={`${testID}-empty`} accessibilityLiveRegion="polite">
            <T v="body" tone="mut">
              {t("ui.picker.empty", { q: q.trim() })}
            </T>
          </View>
        ) : (
          <Card>
            {found.map((i) => (
              <View key={i.key} testID={`${testID}-${i.key}`}>
                <ListRow
                  title={i.label}
                  subtitle={i.subtitle}
                  selected={i.key === value}
                  chevron={false}
                  minHeight={component.rowOption}
                  lines={2}
                  right={i.key === value ? <Icon name="check" color={c.ink} /> : undefined}
                  onPress={() => {
                    setQ("");
                    onSelect(i.key);
                    onClose();
                  }}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Sheet>
  );
}
