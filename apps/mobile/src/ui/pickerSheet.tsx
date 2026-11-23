import { useMemo, useRef, useState } from "react";
import { Image, View, type ImageSourcePropType } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { TextField } from "./controls";
import { Sheet } from "./overlays";
import { Icon, T, type IconKey } from "./primitives";
import { Card, ListRow } from "./surfaces";
import { component, radius, size, space } from "@octo/design-tokens";

/** an Esc this soon after the field emptied itself is the one that emptied it (the browser clears a search field on Esc) */
const ESC_AFTER_CLEAR_MS = 400;

/** what stands at the start of a row (DS §9б.6): a picture of the part, a colour's sample (only `ColorField`, rule 2, 3rd exception),
 *  «no colour» (a struck-through ring), or an icon */
export type Leading = { image: ImageSourcePropType } | { swatch: string } | { none: true } | { icon: IconKey };

export interface PickerItem<K extends string> {
  key: K;
  label: string;
  /** a line under the name (an address, a price) — `mut` */
  subtitle?: string;
  leading?: Leading;
  /** «Ничего», «As the other part», «Unpainted»: their own group over the list (DS §9б.5) */
  top?: boolean;
}

/** the start of a row or of a field: the picture 40, the sample 24 (18 in a field) with a `mut` ring, the struck ring, an icon */
export function LeadingMark({ leading, inField }: { leading: Leading; inField?: boolean }) {
  const { c } = useTheme();
  const d = inField ? component.select.swatchField : component.select.swatchRow;
  if ("image" in leading) return <Image source={leading.image} style={{ width: component.select.thumb, height: component.select.thumb, borderRadius: radius.tip }} accessibilityIgnoresInvertColors />;
  // an icon in place of the part's picture (no photo yet): the same tile 40 (DS §9б.5)
  if ("icon" in leading)
    return (
      <View style={{ width: component.select.thumb, height: component.select.thumb, borderRadius: radius.tip, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
        <Icon name={leading.icon} s={size.iconSm} color={c.mut} />
      </View>
    );
  const ring = { width: d, height: d, borderRadius: d / 2, borderWidth: component.selectedBorder, borderColor: c.mut } as const;
  if ("swatch" in leading) return <View testID="swatch" style={{ ...ring, backgroundColor: leading.swatch }} />;
  return (
    <View style={{ ...ring, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ width: d * 1.2, height: component.selectedBorder, backgroundColor: c.mut, transform: [{ rotate: "-45deg" }] }} />
    </View>
  );
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
  search = true,
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
  /** people and objects always have the search (А3); a value list from a field — from `select.searchFrom` items (§9б.5) */
  search?: boolean;
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
        {search ? (
          <View testID={`${testID}-search`} accessibilityRole="search">
            <TextField type="search" icon="search" value={q} onChangeText={change} placeholder={t("ui.picker.search")} label={t("ui.picker.search")} />
          </View>
        ) : null}
        {found.length === 0 ? (
          <View testID={`${testID}-empty`} accessibilityLiveRegion="polite">
            <T v="body" tone="mut">
              {t("ui.picker.empty", { q: q.trim() })}
            </T>
          </View>
        ) : (
          <>
            {[found.filter((i) => i.top), found.filter((i) => !i.top)].map((group, g) =>
              group.length ? (
                <Card key={g}>
                  {group.map((i, n) => (
                    <View key={i.key} testID={`${testID}-${i.key}`}>
                      {n > 0 ? <View style={{ height: component.hairline, backgroundColor: c.bd }} /> : null}
                      <ListRow
                        title={i.label}
                        subtitle={i.subtitle}
                        left={i.leading ? <LeadingMark leading={i.leading} /> : undefined}
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
              ) : null,
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}
