import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, layout, size, space, spaceHalf } from "@octo/design-tokens";
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

/** what a value is: `phone` for numbers, `mail` for addresses (founder 21.11, #2350: «телефон значком») */
const KIND_ICON: Partial<Record<FieldType, IconKey>> = { phone: "phone", email: "mail" };

/**
 * The type of a row as an icon (founder 21.11, #2350: «просто иконки»): the value's icon and a small `chevronDown` — a menu button
 * (Мобильный · Домашний · …, a check at the current one; then, as its own group, «Сделать основным»). The word is in the menu and
 * for the screen reader only. A row with nothing to choose (the first email) — the icon alone, not a button.
 */
function KindButton<L extends string>({
  row,
  icon,
  labels,
  actions,
  onPick,
  menuTitle,
  testID,
}: {
  row: MultiValue<L>;
  icon: IconKey;
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
  const shown = labels.find((l) => l.key === row.label)?.label ?? (labels.length ? row.label : menuTitle);
  const items: MenuItem<string>[] = [
    ...labels.map((l) => ({ key: `label:${l.key}`, label: l.label, selected: l.key === row.label, testID: testID ? `${testID}-${l.key}` : undefined })),
    ...actions.map((a, i) => ({ key: `act:${a.key}`, label: a.label, group: i === 0 && labels.length > 0, testID: testID ? `${testID}-${a.key}` : undefined })),
  ];
  const slot = { width: size.hitMin, minHeight: size.hitMin, flexShrink: 0, alignItems: "center", justifyContent: "center" } as const;
  if (!items.length || ro)
    return (
      <View style={slot} accessible accessibilityLabel={shown} testID={testID}>
        <Icon name={icon} s={component.valueIcon} color={c.mut} />
      </View>
    );
  return (
    <View ref={ref} collapsable={false} style={{ flexShrink: 0 }}>
      <Press
        testID={testID}
        onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h }))}
        visibleHeight={size.hitMin}
        accessibilityRole="button"
        accessibilityLabel={`${menuTitle}, ${shown}`}
        accessibilityState={{ expanded: !!anchor }}
        aria-haspopup="menu"
        {...({ title: `${menuTitle}: ${shown}` } as object)}
        style={{ ...slot, flexDirection: "row", gap: spaceHalf.hair }}
      >
        <Icon name={icon} s={component.valueIcon} color={c.ink} />
        <Icon name="chevronDown" s={size.iconXs} color={c.mut} />
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
 * Repeated values — phones, emails of a person (DS §9 А14а, spec 56 §3а.3; founder 21.11, #2350 «просто иконки… корзинка
 * удалить»): rows `[📞⌄] [value] [🗑]` and under them a compact «＋» (an `IconButton`, «Добавить телефон» for the screen reader),
 * always, also with no value. The type — the value's icon with a small arrow, a menu (Мобильный · Домашний · …; then, as its own
 * group, «Сделать основным»); the word only in the menu. The value — the screen's own (`renderValue`) or a `TextField` of
 * `valueType`. «🗑» — `IconButton` bare, zone 44, `ink` («Удалить номер»; the screen offers «Вернуть», rule 5). No words where
 * the icon is clear. The model stays the screen's: the first row is the main one. Width on 390: icon 44 + field + 🗑 40.
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
  icon,
  placeholder,
  noteFor,
  testID,
}: {
  rows: MultiValue<L>[];
  labels: { key: L; label: string }[];
  onChange: (id: string, patch: Partial<Pick<MultiValue<L>, "label" | "value">>) => void;
  /** the screen removes the row and offers «Вернуть» (rule 5) */
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** «Добавить телефон» — read on the «＋» */
  addLabel: string;
  /** «Удалить номер» — read on the «🗑» */
  removeLabel: string;
  /** the type menu's title («Метка») */
  menuTitle: string;
  /** the row's own actions in its type menu (the second number and on: «Сделать основным») */
  actionsFor?: (row: MultiValue<L>, index: number) => MultiValueAction[];
  /** the value drawn by the screen (a `PhoneField`); without it — a `TextField` of `valueType` */
  renderValue?: (row: MultiValue<L>, index: number) => ReactNode;
  valueType?: FieldType;
  /** the type's icon; by default from `valueType` (`phone` → phone, `email` → mail) */
  icon?: IconKey;
  placeholder?: string;
  /** a quiet line under a row (`caption mut`): «основной» under the first number when there are several */
  noteFor?: (row: MultiValue<L>, index: number) => string | undefined;
  /** the group; a row — `<testID>-row-<i>`, its parts `-remove` / `-label` / `-value`; the «＋» — `<testID>-add` */
  testID?: string;
}) {
  const ro = useReadOnly();
  const kind = icon ?? KIND_ICON[valueType] ?? "pencil";
  return (
    <View testID={testID} style={{ gap: space[1], maxWidth: layout.formMax }}>
      {rows.map((r, i) => {
        const id = testID ? `${testID}-row-${i}` : undefined;
        const note = noteFor?.(r, i);
        const typeName = labels.find((l) => l.key === r.label)?.label ?? menuTitle;
        return (
          <View key={r.id} style={{ gap: spaceHalf.hair }}>
            <View testID={id} style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
              <KindButton row={r} icon={kind} labels={labels} actions={actionsFor?.(r, i) ?? []} menuTitle={menuTitle} onPick={(l) => onChange(r.id, { label: l })} testID={id ? `${id}-label` : undefined} />
              <View style={{ flex: 1, minWidth: 0 }}>
                {renderValue ? (
                  renderValue(r, i)
                ) : (
                  <TextField type={valueType} value={r.value} onChangeText={(v) => onChange(r.id, { value: v })} placeholder={placeholder} label={typeName} testID={id ? `${id}-value` : undefined} />
                )}
              </View>
              {ro ? null : <IconButton bare icon="trash" label={removeLabel} onPress={() => onRemove(r.id)} testID={id ? `${id}-remove` : undefined} />}
            </View>
            {note ? (
              <View testID={id ? `${id}-note` : undefined} style={{ marginLeft: size.hitMin + space[1] }}>
                <T v="caption" tone="mut">
                  {note}
                </T>
              </View>
            ) : null}
          </View>
        );
      })}
      {ro ? null : (
        <View style={{ width: size.hitMin, alignItems: "center" }}>
          <IconButton icon="plus" label={addLabel} onPress={onAdd} testID={testID ? `${testID}-add` : undefined} />
        </View>
      )}
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
