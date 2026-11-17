import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, layout, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton, TextField } from "./controls";
import type { FieldType } from "./fieldTypes";
import { Menu, type MenuItem } from "./overlays";
import { Icon, Press, T, type IconKey } from "./primitives";
import { useReadOnly } from "./readOnly";

export interface MultiValue<L extends string> {
  id: string;
  label: L;
  value: string;
}

/** one action of a row's label menu after the labels, as its own group («Сделать основным») */
export interface MultiValueAction {
  key: string;
  label: string;
  onPress: () => void;
}

/** the label of a row: a menu button, `ink` 600 + `chevronDown`, the menu with a check at the current one */
function LabelButton<L extends string>({
  row,
  labels,
  actions,
  onPick,
  menuTitle,
  testID,
}: {
  row: MultiValue<L>;
  labels: { key: L; label: string }[];
  actions: MultiValueAction[];
  onPick: (l: L) => void;
  menuTitle: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // a value with no labels (an email) shows the menu's title for its actions («Email ⌄» → «Сделать основным»)
  const shown = labels.find((l) => l.key === row.label)?.label ?? (labels.length ? row.label : menuTitle);
  const items: MenuItem<string>[] = [
    ...labels.map((l) => ({ key: `label:${l.key}`, label: l.label, selected: l.key === row.label, testID: testID ? `${testID}-${l.key}` : undefined })),
    ...actions.map((a, i) => ({ key: `act:${a.key}`, label: a.label, group: i === 0, testID: testID ? `${testID}-${a.key}` : undefined })),
  ];
  return (
    <View ref={ref} collapsable={false} style={{ maxWidth: component.valueLabelMax, flexShrink: 0 }}>
      <Press
        testID={testID}
        disabled={ro}
        onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h }))}
        visibleHeight={size.hitMin}
        accessibilityRole="button"
        accessibilityLabel={`${menuTitle}, ${shown}`}
        accessibilityState={{ expanded: !!anchor }}
        aria-haspopup="menu"
        style={{ minHeight: size.hitMin, flexDirection: "row", alignItems: "center", gap: space[1] }}
      >
        <T v="body" w="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {shown}
        </T>
        <Icon name="chevronDown" s={size.iconSm} color={c.ink} />
      </Press>
      <Menu
        visible={!!anchor}
        anchor={anchor}
        title={menuTitle}
        items={items}
        onClose={() => setAnchor(null)}
        onSelect={(k) => {
          if (k.startsWith("label:")) onPick(k.slice("label:".length) as L);
          else actions.find((a) => `act:${a.key}` === k)?.onPress();
        }}
      />
    </View>
  );
}

/**
 * Repeated values — phones, emails of a person (DS §9 А14а, spec 56 §3а.3; as iOS Contacts): rows `⊖ [label ⌄] value` and the row
 * «⊕ Добавить …» under them, always, also with no value. «⊖» — `IconButton` bare, visible 22, the zone 44, `status.bad.text`
 * («Удалить номер»); the label — a menu (Мобильный · Домашний · …, a check at the current one; then, as its own group, the row's
 * actions such as «Сделать основным»); the value — the screen's own (`renderValue`) or a `TextField` of `valueType`.
 * «⊕» and its words are `ink` (green is a status colour, never an action, rule 2). The model stays the screen's: the first row is
 * the main one. Width on 390: ⊖ 36 + label ≤ 110 + `space[2]` + field ≥ 204.
 */
export function MultiValueField<L extends string>({
  rows,
  labels,
  onChange,
  onRemove,
  onAdd,
  addLabel,
  removeLabel,
  menuTitle,
  actionsFor,
  renderValue,
  valueType = "text",
  placeholder,
  testID,
}: {
  rows: MultiValue<L>[];
  labels: { key: L; label: string }[];
  onChange: (id: string, patch: Partial<Pick<MultiValue<L>, "label" | "value">>) => void;
  /** the screen removes the row and offers «Вернуть» (rule 5) */
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** «Добавить телефон» */
  addLabel: string;
  /** «Удалить номер» — read on the «⊖» */
  removeLabel: string;
  /** the label menu's title («Метка») */
  menuTitle: string;
  /** the row's own actions in its label menu (the second number and on: «Сделать основным») */
  actionsFor?: (row: MultiValue<L>, index: number) => MultiValueAction[];
  /** the value drawn by the screen (a `PhoneField`); without it — a `TextField` of `valueType` */
  renderValue?: (row: MultiValue<L>, index: number) => ReactNode;
  valueType?: FieldType;
  placeholder?: string;
  /** the group; a row — `<testID>-row-<i>`, its parts `-remove` / `-label` / `-value`; the add row — `<testID>-add` */
  testID?: string;
}) {
  const ro = useReadOnly();
  return (
    <View testID={testID} style={{ gap: space[1], maxWidth: layout.formMax }}>
      {rows.map((r, i) => {
        const id = testID ? `${testID}-row-${i}` : undefined;
        return (
          <View key={r.id} testID={id} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            {ro ? null : <IconButton bare tone="bad" icon="minusCircle" label={removeLabel} onPress={() => onRemove(r.id)} testID={id ? `${id}-remove` : undefined} />}
            {labels.length || actionsFor?.(r, i).length ? (
              <LabelButton row={r} labels={labels} actions={actionsFor?.(r, i) ?? []} menuTitle={menuTitle} onPick={(l) => onChange(r.id, { label: l })} testID={id ? `${id}-label` : undefined} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              {renderValue ? (
                renderValue(r, i)
              ) : (
                <TextField type={valueType} value={r.value} onChangeText={(v) => onChange(r.id, { value: v })} placeholder={placeholder} label={labels.find((l) => l.key === r.label)?.label ?? menuTitle} testID={id ? `${id}-value` : undefined} />
              )}
            </View>
          </View>
        );
      })}
      {ro ? null : <ActionRow testID={testID ? `${testID}-add` : undefined} icon="plusCircle" label={addLabel} onPress={onAdd} />}
    </View>
  );
}

/**
 * A row that does one thing, the whole width (DS §9 А14а; spec 56 §3а.3): «⊕ Добавить телефон / email / контакт» — `plusCircle` and
 * the words in `ink` (green is a status colour, never an action, rule 2); «Удалить контакт» — `tone="bad"`, the words in
 * `status.bad.text`, no icon (iOS Contacts' red row). The zone is 44; it is a `button`.
 */
export function ActionRow({ label, onPress, icon, tone, testID }: { label: string; onPress: () => void; icon?: IconKey; tone?: "bad"; testID?: string }) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const color = tone === "bad" ? c.status.bad.text : c.ink;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={ro}
      visibleHeight={size.hitMin}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: size.hitMin, flexDirection: "row", alignItems: "center", gap: space[2] }}
    >
      {icon ? (
        <View style={{ width: component.dockBtn, alignItems: "center" }}>
          <Icon name={icon} s={component.valueIcon} color={color} />
        </View>
      ) : null}
      <T v="body" style={{ color }}>
        {label}
      </T>
    </Press>
  );
}
