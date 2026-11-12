import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { TextField } from "./controls";
import { Sheet } from "./overlays";
import { Icon, T } from "./primitives";
import { Card, ListRow } from "./surfaces";
import { component, space } from "@octo/design-tokens";

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
  testID = "picker-sheet",
}: {
  visible: boolean;
  title: string;
  items: PickerItem<K>[];
  value: K | null | undefined;
  onSelect: (k: K) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((i) => `${i.label} ${i.subtitle ?? ""}`.toLowerCase().includes(needle)) : items;
  }, [items, q]);
  const close = () => {
    setQ("");
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title={title} height="large">
      <View testID={testID} style={{ gap: space[2] }}>
        <View testID={`${testID}-search`}>
          <TextField type="search" icon="search" value={q} onChangeText={setQ} placeholder={t("ui.picker.search")} label={t("ui.picker.search")} />
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
              <View key={i.key} testID={`${testID}-${i.key}`} style={{ minHeight: component.rowOption }}>
                <ListRow
                  title={i.label}
                  subtitle={i.subtitle}
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
