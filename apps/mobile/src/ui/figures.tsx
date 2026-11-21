/**
 * The figures of visual v2 (docs/design/visual-v2.html «Визуальный язык числами»):
 * - NumberTrio — «тройка цифр»: three cells `surf2` (radius 14) 8 apart, the figure 17/700 over its word 12/600 `mut`.
 * - FigureRow — a row «цифры справа»: a card from `figureRow.h` 64, an icon in a square 40 (radius 13) on the cell, the name 15/700 and
 *   a line 12/600 `mut`; on the right columns «word 12 / value 15/700» (`colW` 64 each but the last), or a StatusPill, or «›».
 * - TimerLine — «таймер»: the hourglass 20, «1:12:40» 17/700 tabular, «с 8:34» 13 `mut`; on the right a round 32 («⌃»).
 * - TimeSlot — «время и интервал»: the hour column `timeSlot.timeW` 44 (the hour 15/700, the length 12) and the visit's card with the
 *   interval plate 26 «8:30 ▸ 12:30» of two halves; the nearest one in the accent's TONE (`tint`/`tint2` + `accText`), never a fill.
 * All figures are tabular (T draws them so).
 */
import { type ReactNode } from "react";
import { View } from "react-native";
import { component, radius, rhythm, size, space, spaceHalf, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "./controls";
import { Icon, Press, T, type IconKey } from "./primitives";
import { StatusPill } from "./statusPill";
import type { IconAction } from "./templates/types";

/** «4 ч на месте · 12 мин в дороге · Alex мастер» */
export function NumberTrio({ items, testID }: { items: readonly [Fig, Fig, Fig]; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: rhythm.cardGap }}>
      {items.map((f, i) => (
        <TrioCell key={i} f={f} />
      ))}
    </View>
  );
}
type Fig = { value: string; label: string };
function TrioCell({ f }: { f: Fig }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`${f.value} ${f.label}`} style={{ flex: 1, minWidth: 0, backgroundColor: c.surf2, borderRadius: radius.inner, paddingVertical: space[2], paddingHorizontal: space[2], alignItems: "center" }}>
      <T v="heading" numberOfLines={1}>
        {f.value}
      </T>
      <T v="micro" tone="mut" numberOfLines={1}>
        {f.label}
      </T>
    </View>
  );
}

/** a value column on the right of a FigureRow; `tone` — a status word («−9 дн» bad) */
export type FigureCol = { label: string; value: string; tone?: StatusName };

export function FigureRow({ title, line, icon, lead, cols, status, onPress, testID }: {
  title: string;
  line?: string;
  /** the icon in the square 40 */
  icon?: IconKey;
  /** instead of the icon: a short word in the square («7:30») */
  lead?: string;
  /** the columns «word / value» on the right */
  cols?: FigureCol[];
  status?: { status: StatusName; label: string };
  /** the row opens something: «›» on the right when there are no columns */
  onPress?: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const k = component.figureRow;
  const said = [title, line, ...(cols ?? []).map((x) => `${x.label} ${x.value}`), status?.label].filter(Boolean).join(", ");
  const body = (
    <View
      style={{
        minHeight: k.h,
        backgroundColor: c.surf,
        borderRadius: radius.card,
        borderTopWidth: component.hairline,
        borderTopColor: c.hl,
        paddingVertical: space[2] + spaceHalf.hair,
        paddingHorizontal: space[3],
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
      }}
    >
      {icon || lead ? (
        <View style={{ width: k.icon, height: k.icon, borderRadius: k.iconRadius, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
          {icon ? <Icon name={icon} s={size.iconMd} color={c.ink} /> : (
            <T v="caption" w="bold" numberOfLines={1}>
              {lead}
            </T>
          )}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="body" w="bold" numberOfLines={1}>
          {title}
        </T>
        {line ? (
          <T v="micro" tone="mut" numberOfLines={1}>
            {line}
          </T>
        ) : null}
      </View>
      {(cols ?? []).map((x, i, all) => (
        <View key={x.label} style={{ alignItems: "flex-end", width: i < all.length - 1 ? k.colW : undefined }}>
          <T v="micro" tone="mut" numberOfLines={1}>
            {x.label}
          </T>
          <T v="body" w="bold" tone={x.tone ?? "ink"} numberOfLines={1}>
            {x.value}
          </T>
        </View>
      ))}
      {status ? <StatusPill status={status.status} label={status.label} /> : null}
      {onPress && !cols?.length && !status ? <Icon name="chevronRight" s={size.iconMd} color={c.mut} /> : null}
    </View>
  );
  if (!onPress)
    return (
      <View testID={testID} accessible accessibilityLabel={said}>
        {body}
      </View>
    );
  return (
    <Press testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={said}>
      {body}
    </Press>
  );
}

/** «⌛ 1:12:40 с 8:34 ⌃» — the time on the visit; `action` — the round 32 on the right */
export function TimerLine({ value, since, action, testID }: { value: string; since?: string; action?: IconAction; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <View accessible accessibilityLabel={[value, since].filter(Boolean).join(", ")} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Icon name="hourglass" s={size.iconMd} color={c.ink} />
        <T v="heading" numberOfLines={1}>
          {value}
        </T>
        {since ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {since}
          </T>
        ) : null}
      </View>
      {action ? <IconButton icon={action.icon} label={action.a11y} onPress={action.onPress} testID={action.testID} size="card" /> : null}
    </View>
  );
}

/** «8:30 ▸ 12:30» — the interval as a plate of two halves (the start's half points to the end) */
export function IntervalPlate({ from, to, near }: { from: string; to: string; near?: boolean }) {
  const { c } = useTheme();
  const k = component.timeSlot;
  const fg = near ? c.accText : c.ink;
  return (
    <View style={{ flexDirection: "row", height: k.interval, borderRadius: radius.pill, overflow: "hidden", backgroundColor: near ? c.tint : c.surf2, alignSelf: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: space[2] + spaceHalf.hair, backgroundColor: near ? c.tint2 : c.surf3 }}>
        <T v="caption" w="bold" style={{ color: fg }} numberOfLines={1}>
          {from}
        </T>
        <View style={{ width: k.notch, alignItems: "center" }}>
          <Icon name="chevronRight" s={size.iconXs} color={fg} />
        </View>
      </View>
      <View style={{ justifyContent: "center", paddingHorizontal: space[2] + spaceHalf.hair }}>
        <T v="caption" w="bold" style={{ color: fg }} numberOfLines={1}>
          {to}
        </T>
      </View>
    </View>
  );
}

/**
 * One visit on the Plan's day: the hour column on the left and the visit's card — the interval plate with a StatusPill (or `right`)
 * on its line, the name 15/600 and the line 13 `mut`. `near` — the nearest visit: its plate in the accent's tone.
 */
export function TimeSlot({ hour, length, from, to, near, title, line, status, right, onPress, testID }: {
  hour: string;
  length?: string;
  from: string;
  to: string;
  near?: boolean;
  title: string;
  line?: string;
  status?: { status: StatusName; label: string };
  /** instead of the status: what stands on the right of the plate (the tech's initials) */
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const k = component.timeSlot;
  const said = [`${from}–${to}`, title, line, status?.label].filter(Boolean).join(", ");
  const card = (
    <View style={{ backgroundColor: c.surf, borderRadius: radius.card, borderTopWidth: component.hairline, borderTopColor: c.hl, paddingVertical: space[2] + spaceHalf.hair, paddingHorizontal: space[3], gap: spaceHalf.tight }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <IntervalPlate from={from} to={to} near={near} />
        <View style={{ flex: 1 }} />
        {status ? <StatusPill status={status.status} label={status.label} /> : right}
      </View>
      <View>
        <T v="body" w="semibold" numberOfLines={1}>
          {title}
        </T>
        {line ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {line}
          </T>
        ) : null}
      </View>
    </View>
  );
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: space[2] + spaceHalf.hair }}>
      <View style={{ width: k.timeW }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <T v="body" w="bold" numberOfLines={1}>
          {hour}
        </T>
        {length ? (
          <T v="micro" tone="mut" numberOfLines={1}>
            {length}
          </T>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {onPress ? (
          <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={said}>
            {card}
          </Press>
        ) : (
          <View accessible accessibilityLabel={said}>
            {card}
          </View>
        )}
      </View>
    </View>
  );
}
