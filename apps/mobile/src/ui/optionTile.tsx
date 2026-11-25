import { Platform, View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { CheckMark } from "./checkMark";
import { fillStyle } from "./fill";
import { Icon, Press, T, type IconKey } from "./primitives";
import { useReadOnly } from "./readOnly";
import { rovingKeyDown } from "./rovingKeys";

/**
 * One tile (DS §9 А2б): an icon over a word, `optionTile.h` 76 tall, not wider than `optionTile.maxW`. A choice tile chosen —
 * «Заливка» + 600 + `CheckMark` in the corner; not chosen — `ink` 400 (not `mut`: it would read as switched off), no fill, the field frame. The action tile (`role` button) never carries a mark.
 */
function Tile({
  label,
  icon,
  selected,
  action,
  onPress,
  testID,
  disabled,
}: {
  label: string;
  icon: IconKey;
  selected?: boolean;
  action?: boolean;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const on = !!selected && !action;
  const web = Platform.OS === "web";
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      visibleHeight={component.optionTile.h}
      accessibilityRole={action ? "button" : "radio"}
      accessibilityState={action ? { disabled: !!disabled } : { selected: on, disabled: !!disabled }}
      {...(!action && web ? ({ "aria-checked": on } as object) : null)}
      accessibilityLabel={label}
      style={{
        minHeight: component.optionTile.h,
        borderRadius: radius.inner,
        borderWidth: component.hairline,
        borderColor: c.bdField,
        alignItems: "center",
        justifyContent: "center",
        gap: space[1],
        paddingHorizontal: space[2],
        paddingVertical: space[2],
        ...(on ? fillStyle(c) : { backgroundColor: "transparent" }),
      }}
    >
      <Icon name={icon} s={size.iconMd} color={c.ink} />
      <T v="caption" w={on ? "semibold" : "regular"} style={{ color: c.ink }} center numberOfLines={2}>
        {label}
      </T>
      {on ? <CheckMark placement="corner" testID={testID ? `${testID}-check` : undefined} /> : null}
    </Press>
  );
}

/**
 * Tiles: one of 2–3 and an action on the same object (DS §9 А2б, spec 56 §3 row 5а) — only where the guard lists it (a trade
 * module's drawing: «Наружный · Внутренний · Разъединить»). All tiles are one size; the choice is a `radiogroup` of `radio`, the action a
 * `button` outside it, `space[3]` 12 from the choice (not 8), with no mark, neither yellow nor red. A choice applies at once.
 */
export function OptionTiles<K extends string>({
  label,
  items,
  value,
  onChange,
  action,
  testID,
}: {
  /** what the group is a choice of — read with it («Угол») */
  label: string;
  items: { key: K; label: string; icon: IconKey }[];
  value: K | null | undefined;
  onChange: (k: K) => void;
  /** the action tile after the choice («Разъединить») */
  action?: { label: string; icon: IconKey; onPress: () => void; testID?: string };
  /** each tile — `<testID>-<key>`; its mark — `<testID>-<key>-check` */
  testID?: string;
}) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const n = items.length;
  const maxW = component.optionTile.maxW;
  const web = Platform.OS === "web";
  // every tile the same width: the choice gets n shares plus its own gaps, the action one share (gap 12 between them); each
  // tile stops at `optionTile.maxW` and the row stays on the left (1280)
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "stretch" }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: "row", gap: space[2], flexGrow: n, flexShrink: 1, flexBasis: space[2] * (n - 1), maxWidth: maxW * n + space[2] * (n - 1) }}
        {...(web ? ({ onKeyDown: (e: Parameters<typeof rovingKeyDown>[0]) => rovingKeyDown(e, '[role="radio"]', (i) => !ro && items[i] && onChange(items[i]!.key), "horizontal") } as object) : null)}
      >
        {items.map((it) => (
          <View key={it.key} style={{ flex: 1 }}>
            <Tile testID={testID ? `${testID}-${it.key}` : undefined} label={it.label} icon={it.icon} selected={it.key === value} disabled={ro} onPress={() => onChange(it.key)} />
          </View>
        ))}
      </View>
      {action ? (
        <>
          {/* the action stands apart: the 12 gap with a hairline in its middle */}
          <View testID={testID ? `${testID}-divider` : undefined} style={{ width: component.hairline, backgroundColor: c.bd, marginHorizontal: (space[3] - component.hairline) / 2 }} />
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, maxWidth: maxW }}>
          <Tile testID={action.testID ?? (testID ? `${testID}-action` : undefined)} label={action.label} icon={action.icon} action disabled={ro} onPress={action.onPress} />
          </View>
        </>
      ) : null}
    </View>
  );
}
