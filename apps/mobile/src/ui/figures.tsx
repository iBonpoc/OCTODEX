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
import Svg, { Line } from "react-native-svg";
import { component, pastels, radius, rhythm, size, space, spaceHalf, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "./controls";
import { Icon, Press, T, type IconKey } from "./primitives";
import { StatusPill } from "./statusPill";
import { pastelOf } from "./pastelOf";
import type { IconAction } from "./templates/types";

/** «4 ч на месте · 12 мин в дороге · Alex мастер» */
export function NumberTrio({ items, testID, look = "cells" }: {
  items: readonly [Fig, Fig, Fig];
  testID?: string;
  /** visual v2 макет 3 «Клиент» (`.num3`): `plain` — no cells, the word 12/600 `mut` over the figure 22, left-aligned */
  look?: "cells" | "plain";
}) {
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: rhythm.cardGap }}>
      {items.map((f, i) => (look === "plain" ? <PlainFig key={i} f={f} /> : <TrioCell key={i} f={f} />))}
    </View>
  );
}
type Fig = { value: string; label: string };
function PlainFig({ f }: { f: Fig }) {
  return (
    <View accessible accessibilityLabel={`${f.label} ${f.value}`} style={{ flex: 1, minWidth: 0 }}>
      <T v="micro" w="semibold" tone="mut" numberOfLines={1}>
        {f.label}
      </T>
      <T v="title" w="semibold" numberOfLines={1}>
        {f.value}
      </T>
    </View>
  );
}

/** «Работа · 3 из 5 · 62 %» — progress in words (v2: no bar): the caption 12/600 `mut` on the left, the figure 15/700 on the right */
export function ProgressWords({ caption, value, testID }: { caption: string; value?: string; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityLabel={[caption, value].filter(Boolean).join(", ")} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[2] + spaceHalf.hair }}>
      <T v="micro" w="semibold" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
        {caption}
      </T>
      {value ? (
        <T v="body" w="bold" numberOfLines={1}>
          {value}
        </T>
      ) : null}
    </View>
  );
}
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

export function FigureRow({ title, line, icon, lead, cols, status, onPress, testID, tone, iconTone, avatar }: {
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
  /** visual v2 макет 3 «Gate code 4512 · small dog»: the warm plate — the row on `status.warn.fill`, its words `status.warn.text` */
  tone?: "warn";
  /** visual v2 макет 6 «Оплачены сегодня»: the icon in a status colour («✓» ok) — the row's words keep theirs */
  iconTone?: StatusName;
  /** visual v2 макет 5 «Смета, редактор» (the client card): the person's initials on their pastel, a circle `avatar.md` 36, not the square */
  avatar?: { initials: string; name: string };
}) {
  const { c, name: themeName } = useTheme();
  const k = component.figureRow;
  const warm = tone === "warn" ? c.status.warn : null;
  const said = [title, line, ...(cols ?? []).map((x) => `${x.label} ${x.value}`), status?.label].filter(Boolean).join(", ");
  const body = (
    <View
      style={{
        minHeight: k.h,
        backgroundColor: warm ? warm.fill : c.surf,
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
      {avatar ? (
        <View style={{ width: component.avatar.md, height: component.avatar.md, borderRadius: radius.pill, backgroundColor: pastels[themeName][pastelOf(avatar.name)].fill, alignItems: "center", justifyContent: "center" }}>
          <T v="caption" w="bold" style={{ color: pastels[themeName][pastelOf(avatar.name)].text }} numberOfLines={1}>
            {avatar.initials}
          </T>
        </View>
      ) : null}
      {!avatar && (icon || lead) ? (
        <View style={{ width: k.icon, height: k.icon, borderRadius: k.iconRadius, backgroundColor: warm ? c.track : c.surf2, alignItems: "center", justifyContent: "center" }}>
          {icon ? <Icon name={icon} s={size.iconMd} color={warm ? warm.text : iconTone ? c.status[iconTone].text : c.ink} /> : (
            <T v="caption" w="bold" numberOfLines={1}>
              {lead}
            </T>
          )}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="body" w="bold" numberOfLines={1} style={warm ? { color: warm.text } : undefined}>
          {title}
        </T>
        {line ? (
          <T v="micro" w="semibold" tone={warm ? "warn" : "mut"} numberOfLines={1}>
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
      {onPress && !cols?.length && !status && !warm ? <Icon name="chevronRight" s={size.iconMd} color={c.mut} /> : null}
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

/** «8:30 ▸ 12:30» — the interval as a plate of two halves (the start's half points to the end); no `to` — one half («Весь день») */
export function IntervalPlate({ from, to, near }: { from: string; to: string; near?: boolean }) {
  const { c } = useTheme();
  const k = component.timeSlot;
  const fg = near ? c.accText : c.ink;
  return (
    <View style={{ flexDirection: "row", height: k.interval, borderRadius: radius.pill, overflow: "hidden", backgroundColor: near ? c.tint : c.surf2, alignSelf: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: space[2] + spaceHalf.hair, paddingRight: to ? 0 : space[2] + spaceHalf.hair, backgroundColor: near ? c.tint2 : c.surf3 }}>
        <T v="caption" w="bold" style={{ color: fg }} numberOfLines={1}>
          {from}
        </T>
        {to ? (
          <View style={{ width: k.notch, alignItems: "center" }}>
            <Icon name="chevronRight" s={size.iconXs} color={fg} />
          </View>
        ) : null}
      </View>
      {to ? (
        <View style={{ justifyContent: "center", paddingHorizontal: space[2] + spaceHalf.hair }}>
          <T v="caption" w="bold" style={{ color: fg }} numberOfLines={1}>
            {to}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One visit on the Plan's day: the hour column on the left and the visit's card — the interval plate with a StatusPill (or `right`)
 * on its line, the name 15/600 and the line 13 `mut`. `near` — the nearest visit: its plate in the accent's tone.
 */
export function TimeSlot({ hour, length, from, to, near, title, line, status, right, top, oneLine, onPress, testID }: {
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
  /** v2 макет 2: what stands over the plate inside the card — the hatched «в дороге · 12 мин» (`HatchPlate`) */
  top?: ReactNode;
  /** v2 макет 2: «работа · мастер» in one line, cut at the end */
  oneLine?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const k = component.timeSlot;
  const said = [to ? `${from}–${to}` : from, title, line, status?.label].filter(Boolean).join(", ");
  const card = (
    <View style={{ backgroundColor: c.surf, borderRadius: radius.card, borderTopWidth: component.hairline, borderTopColor: c.hl, paddingVertical: space[2] + spaceHalf.hair, paddingHorizontal: space[3], gap: spaceHalf.tight }}>
      {top ? <View style={{ marginBottom: spaceHalf.hair }}>{top}</View> : null}
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
          // two lines: «Bathroom remodel: vanity, toilet, tile · Alex» is not cut to «Bathroom remodel: va…» (audit 12 §2.1)
          <T v="caption" tone="mut" numberOfLines={oneLine ? 1 : 2}>
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

/**
 * «в дороге · 12 мин» (v2 макет 2 `.hatch`): a plate 30 high, radius 12, diagonal stripes 7 every 13 (135°) and a hairline edge, the
 * word 12/600 `mut` in the middle — the time on the road, not a progress.
 */
export function HatchPlate({ label, testID }: { label: string; testID?: string }) {
  const { c } = useTheme();
  const step = HATCH.period * Math.SQRT2;
  return (
    <View testID={testID} accessibilityRole="text" accessibilityLabel={label} style={{ height: HATCH.h, borderRadius: radius.field, overflow: "hidden", borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
      <Svg style={{ position: "absolute", left: 0, top: 0 }} width="100%" height={HATCH.h}>
        {Array.from({ length: HATCH.count }, (_, i) => (
          <Line key={i} x1={i * step} y1={HATCH.h + HATCH.band} x2={i * step + HATCH.h + 2 * HATCH.band} y2={-HATCH.band} stroke={c.surf2} strokeWidth={HATCH.band} />
        ))}
      </Svg>
      <T v="micro" tone="mut" numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}
/** the hatch: 30 high, stripes 7 wide every 13 (along the 135° normal), enough of them for a 1280 card */
const HATCH = { h: space[6] + spaceHalf.tight, band: 7, period: 13, count: 80 } as const;

/** «Позиции  7» — the count in a cell beside a block's title (visual v2 №5, «Your Habit (18)» of образец №2): `chip.h` 24, 13/700 */
export function CountPill({ n, testID }: { n: number; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={{ minWidth: component.chip.h + space[1], height: component.chip.h, paddingHorizontal: space[2], borderRadius: radius.pill, backgroundColor: c.surf, borderTopWidth: component.hairline, borderTopColor: c.hl, alignItems: "center", justifyContent: "center" }}>
      <T v="caption" w="bold" tabular numberOfLines={1}>
        {n}
      </T>
    </View>
  );
}

/**
 * «⚿ Код 4512 · собака» (visual v2 макет 4): a StatusPill with its own icon — the visit's access words in the warm tone, beside the
 * status pill. One line, cut with «…»; it presses when there is more to read (the sheet with the whole note).
 */
export function TonePill({ tone, icon, label, onPress, testID }: { tone: StatusName; icon: IconKey; label: string; onPress?: () => void; testID?: string }) {
  const { c } = useTheme();
  const st = c.status[tone];
  const pill = (
    <View
      style={{
        minHeight: component.chip.h,
        paddingLeft: component.statusPill.padL,
        paddingRight: component.statusPill.padR,
        borderRadius: radius.pill,
        backgroundColor: st.fill,
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        flexShrink: 1,
      }}
    >
      <Icon name={icon} s={component.statusPill.icon} color={st.text} />
      <T v="micro" w="semibold" capped numberOfLines={1} style={{ color: st.text, flexShrink: 1 }}>
        {label}
      </T>
    </View>
  );
  if (!onPress)
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={{ flexShrink: 1, minWidth: 0 }}>
        {pill}
      </View>
    );
  return (
    <Press testID={testID} onPress={onPress} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={label} containerStyle={{ flexShrink: 1, minWidth: 0 }}>
      {pill}
    </Press>
  );
}
