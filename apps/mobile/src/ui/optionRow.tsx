import { Platform, View } from "react-native";
import { component, size, space, type StatusName } from "@octo/design-tokens";
import { StatusPill } from "./statusPill";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { CheckMark } from "./checkMark";
import { Icon, Press, T, type IconKey } from "./primitives";
import { useReadOnly } from "./readOnly";
import { rovingKeyDown } from "./rovingKeys";

/**
 * A row of a choice (DS §9 А2а, А4; spec 56 §6): an icon on the left (optional), the title, a `mut` subtitle (optional), and the
 * `CheckMark` on the right at the chosen one — no «Заливка», no «›». Row `rowOption` 48 on a phone, 44 on 820 and 1280.
 * One of many — `radio` (web `aria-checked`, iOS «selected»); several — `option` + `aria-selected`. `accessibilityState.checked`
 * belongs to `DoneCircle` and `Toggle` only. Usually drawn by `OptionRows`, which gives the group its role and keys.
 */
export function OptionRow({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  multiple,
  disabled,
  iconSlot,
  testID,
  inGroup,
  status,
}: {
  /** ЧЕРНОВИК #2531 (нужно в ДС §9 А2а): a row of a ListGroup — the group's side inset (`space[4]`) */
  inGroup?: boolean;
  /** ЧЕРНОВИК #2531 (нужно в ДС §9 А2а): a StatusPill on the right of the row, before the mark («Проверьте · +900 %») */
  status?: { status: StatusName; label: string };
  title: string;
  subtitle?: string;
  icon?: IconKey;
  selected: boolean;
  onPress: () => void;
  /** a row of a choice of several: `option` with `aria-selected` instead of `radio` */
  multiple?: boolean;
  disabled?: boolean;
  /** another row of the group has an icon: keep its place empty here, so the titles line up */
  iconSlot?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const ro = useReadOnly();
  const minHeight = wide ? size.hitMin : component.rowOption;
  const web = Platform.OS === "web";
  const a11y = multiple
    ? ({ role: "option", "aria-selected": selected } as object)
    : ({ accessibilityRole: "radio", ...(web ? { "aria-checked": selected } : null) } as object);
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled || ro}
      visibleHeight={minHeight}
      {...a11y}
      accessibilityState={{ selected, disabled: !!(disabled || ro) }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={{ minHeight, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[2], paddingHorizontal: inGroup ? space[4] : undefined }}
    >
      {icon ? <Icon name={icon} color={c.ink} /> : iconSlot ? <View style={{ width: size.iconMd }} /> : null}
      <View style={{ flex: 1 }}>
        <T v="body" numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" tone="mut" numberOfLines={status ? 3 : 2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {status ? <StatusPill status={status.status} label={status.label} /> : null}
      {/* the mark's place is kept: a row does not jump when it is chosen */}
      <View style={{ width: size.iconMd, alignItems: "center" }}>{selected ? <CheckMark testID={testID ? `${testID}-check` : undefined} /> : null}</View>
    </Press>
  );
}

export interface OptionItem<K extends string> {
  key: K;
  title: string;
  subtitle?: string;
  icon?: IconKey;
}

type Group<K extends string> = {
  /** what the group is a choice of — read with it («Кому назначить») */
  label: string;
  items: OptionItem<K>[];
  /** the group's testID; each row — `<testID>-<key>`, its mark — `<testID>-<key>-check` */
  testID?: string;
  disabled?: boolean;
};

/**
 * The group of `OptionRow` (DS §9 А2а): one — `radiogroup`, a tap chooses (a sheet whose only question this is closes itself);
 * several — `listbox` + `aria-multiselectable`, a tap adds or takes away (the sheet's `footer` «Готово · N» applies, Б1).
 * Web keys: ↑ / ↓ along the rows, Home / End, Space / Enter choose.
 */
export function OptionRows<K extends string>(
  props: Group<K> & ({ multiple?: false; value: K | null | undefined; onChange: (k: K) => void } | { multiple: true; value: K[]; onChange: (keys: K[]) => void }),
) {
  const { label, items, testID, disabled } = props;
  const ro = useReadOnly();
  const isOn = (k: K) => (props.multiple ? props.value.includes(k) : props.value === k);
  const choose = (k: K) => {
    if (props.multiple) props.onChange(props.value.includes(k) ? props.value.filter((x) => x !== k) : [...props.value, k]);
    else props.onChange(k);
  };
  const group = props.multiple
    ? ({ role: "listbox", "aria-multiselectable": true } as object)
    : ({ accessibilityRole: "radiogroup" } as object);
  const web = Platform.OS === "web";
  const iconSlot = items.some((i) => i.icon);
  return (
    <View
      testID={testID}
      {...group}
      accessibilityLabel={label}
      {...(web
        ? ({ onKeyDown: (e: Parameters<typeof rovingKeyDown>[0]) => rovingKeyDown(e, '[role="radio"],[role="option"]', (i) => items[i] && !disabled && !ro && choose(items[i]!.key)) } as object)
        : null)}
    >
      {items.map((it) => (
        <OptionRow
          key={it.key}
          testID={testID ? `${testID}-${it.key}` : undefined}
          title={it.title}
          subtitle={it.subtitle}
          icon={it.icon}
          selected={isOn(it.key)}
          multiple={props.multiple}
          disabled={disabled}
          iconSlot={iconSlot}
          onPress={() => choose(it.key)}
        />
      ))}
    </View>
  );
}
