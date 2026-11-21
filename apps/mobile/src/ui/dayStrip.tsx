/**
 * The day strip of the Plan (BUILD-SPEC §1 «DayStrip», BUILD-PLAN §1 поток В): moved here from features/PlanParts.tsx
 * (which re-exports it until wave 3). `DayCell` is one day — a cell of the Week / Month, or a pill of the strip;
 * `WeekStrip` — 7 cells in a row; `DayStrip` — pills in one row that scrolls sideways; `stripDays` — the strip's days.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, type ScrollViewInstance } from "react-native";
import { component, radius, space } from "@octo/design-tokens";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";
import { formatDayKey } from "@/features/zone";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Button, IconButton, StatusChip } from "./controls";
import { fillStyle } from "./fill";
import { Press, T } from "./primitives";
import { RowView } from "./surfaces";
import { SelectedCheck } from "./selectedCheck";
import { pillDot, pillLook, stripDays, stripOffset } from "./dayStripLogic";

export { stripDays } from "./dayStripLogic";

const pill = component.dayPill;

/**
 * One day of the Week strip and of the Month (24 §B): the date, the number of the Feed's items («В плане: N» to a screen
 * reader), yellow only when an open visit has nobody on it; a day off of the picked person is the word «выходной»,
 * no colour. The picked cell is «Заливка» with a check (DS «Выделение выбранного», not the accent); today is bold.
 * As a pill of the Day's strip (`pill`): «Пн / 23 / •», the picked one filled with the accent (BUILD-SPEC §1 DayStrip).
 */
export function DayCell({ day, load, selected, dim, head, pill: asPill, onPress }: {
  day: DayKey;
  load?: DayLoad;
  selected: boolean;
  dim?: boolean;
  head?: string;
  /** the Day's strip: a pill «Пн / 23 / •» */
  pill?: boolean;
  onPress: () => void;
}) {
  const { t, dayOf } = useI18n();
  const { c } = useTheme();
  const today = day === todayKey();
  const n = load?.n ?? 0;
  const un = load?.unassigned ?? 0;
  // a screen reader hears the day in words, «В плане: N», «Не назначено · N», «выходной» (review of #267)
  const said = [dayOf(day), t("plan5.planned", { n }), un ? t("plan5.unassigned", { n: un }) : null, load?.dayOff ? t("plan5.dayOff") : null].filter(Boolean).join(", ");
  const look = pillLook(selected, today);
  const dot = pillDot(load, selected);
  return (
    <Press
      onPress={onPress}
      visibleHeight={asPill ? undefined : component.rowCompact}
      accessibilityRole="button"
      accessibilityLabel={said}
      accessibilityState={asPill ? { selected } : undefined}
      testID={asPill ? `plan-strip-${day}` : `plan-day-${day}`}
      containerStyle={asPill ? undefined : { flex: 1, minWidth: 0 }}
      // one cell, two looks: the Week / Month cell, or the Day's pill
      style={asPill
        ? {
            minWidth: pill.w,
            minHeight: pill.h,
            paddingHorizontal: space[1],
            borderRadius: radius.pill,
            backgroundColor: c[look.fill],
            borderWidth: component.hairline,
            borderColor: c[look.edge],
            alignItems: "center" as const,
            justifyContent: "center" as const,
          }
        : {
            minHeight: component.rowCompact + space[4],
            borderRadius: component.checkbox.radius,
            // chosen day: «Заливка» + a check (DS «Выделение выбранного»), not an ink frame
            ...(selected ? fillStyle(c) : { backgroundColor: c.in }),
            borderWidth: component.hairline,
            borderColor: selected ? "transparent" : c.bd,
            opacity: dim ? component.dimOpacity : 1,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            gap: space[1],
          }}
    >
      {asPill ? (
        <>
          <T v="micro" tone={selected ? "onAcc" : "mut"} numberOfLines={1}>
            {head}
          </T>
          <T v="heading" w={look.bold ? "bold" : "semibold"} style={{ color: c[look.num] }} tabular>
            {Number(day.slice(8))}
          </T>
          {/* the day has something: a dot (warn when a visit there has nobody on it); a day off is said to a screen reader */}
          <View style={{ width: pill.dot, height: pill.dot, borderRadius: radius.pill, backgroundColor: dot === "none" ? "transparent" : dot === "warn" ? c.status.warn.text : c[dot] }} />
        </>
      ) : (
        <>
          {selected ? <SelectedCheck small /> : null}
          {head ? (
            <T v="micro" tone="mut" numberOfLines={1}>
              {head}
            </T>
          ) : null}
          <T v="caption" w={today ? "bold" : "regular"} tabular>
            {Number(day.slice(8))}
          </T>
          {n ? <StatusChip status={un ? "warn" : "info"} label={String(n)} soft /> : null}
          {load?.dayOff ? (
            // a cell of the strip is ~46 px on a phone: the short word; the screen reader hears the whole one
            <T v="micro" tone="mut" numberOfLines={1}>
              {t("plan5.dayOffShort")}
            </T>
          ) : null}
        </>
      )}
    </Press>
  );
}

const localeOf = (lang: string) => (lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU");

/** The Week strip: 7 days in a row, the same cell as the Month (24 §B) */
export function WeekStrip({ days, loads, date, onPick }: { days: DayKey[]; loads: Map<DayKey, DayLoad>; date: DayKey; onPick: (k: DayKey) => void }) {
  const { lang } = useI18n();
  const loc = localeOf(lang);
  return (
    <View style={{ flexDirection: "row", gap: space[1] }} testID="plan-week-strip">
      {days.map((k) => (
        <DayCell key={k} day={k} load={loads.get(k)} selected={k === date} head={formatDayKey(k, { weekday: "short" }, loc)} onPress={() => onPick(k)} />
      ))}
    </View>
  );
}

/**
 * The days as pills «Пн / 23 / •» in one row that scrolls sideways (BUILD-SPEC §1 «DayStrip», #2350): 52 tall, the picked
 * day is the accent with `onAcc` (light theme: + `accEdge`), today's number `accText`, a dot 4 — «есть выезды» (`warn` when
 * a visit there has nobody on it). Above: the month, «Сегодня» when away, a week back / forward as icons.
 * `days` — the pills (default: `stripDays(date)`, four weeks around the picked day).
 */
export function DayStrip({ days: given, date, loads, onPick, testID = "plan-day-strip" }: { days?: DayKey[]; date: DayKey; loads: Map<DayKey, DayLoad>; onPick: (k: DayKey) => void; testID?: string }) {
  const { t, lang } = useI18n();
  const loc = localeOf(lang);
  const today = todayKey();
  const days = useMemo(() => given ?? stripDays(date), [given, date]);
  const ref = useRef<ScrollViewInstance>(null);
  const [w, setW] = useState(0);
  // the picked pill to the middle of the row
  useEffect(() => {
    const i = days.indexOf(date);
    if (!w || i < 0) return;
    ref.current?.scrollTo({ x: stripOffset(i, w), animated: true });
  }, [date, w]); // eslint-disable-line react-hooks/exhaustive-deps
  // the month in words; the year only when it is not this one («Ноябрь», «Январь 2027»)
  const month = date.slice(0, 4) === today.slice(0, 4) ? formatDayKey(date, { month: "long" }, loc) : formatDayKey(date, { month: "long", year: "numeric" }, loc);
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
          {month.charAt(0).toUpperCase() + month.slice(1)}
        </T>
        {date !== today ? <Button label={t("common.today")} size="sm" variant="secondary" onPress={() => onPick(today)} /> : null}
        <IconButton icon="chevronLeft" label={t("plan.prev")} onPress={() => onPick(addDays(date, -7))} />
        <IconButton icon="chevronRight" label={t("plan.next")} onPress={() => onPick(addDays(date, 7))} />
      </RowView>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        // the row runs to the screen's edges, the pills start at the padding
        style={{ marginHorizontal: -space[4] }}
        contentContainerStyle={{ gap: pill.gap, paddingHorizontal: space[4] }}
      >
        {days.map((k) => (
          <DayCell key={k} day={k} load={loads.get(k)} selected={k === date} head={formatDayKey(k, { weekday: "short" }, loc)} pill onPress={() => onPick(k)} />
        ))}
      </ScrollView>
    </View>
  );
}
