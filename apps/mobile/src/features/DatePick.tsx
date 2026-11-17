import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { addDays, addMonths, monthGrid, todayKey, type DayKey } from "@/features/calendar";
import { formatDayKey, weekdayOf } from "@/features/zone";
import { isWorkday } from "@/features/schedule";
import { businessHoursOf } from "@/features/scheduleSettings";
import { useStore } from "@/data/store";
import { IconButton } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/** what a day cell is (DS А7, the state table): each by its shape, not only by weight */
export type DayState = { selected: boolean; today: boolean; off: boolean; before: boolean; other: boolean };
export const dayState = (k: DayKey, o: { value: DayKey | null; today: DayKey; first: DayKey; month: DayKey; workday: (k: DayKey) => boolean }): DayState => ({
  selected: k === o.value,
  today: k === o.today,
  off: !o.workday(k),
  before: k < o.first,
  other: k.slice(0, 7) !== o.month.slice(0, 7),
});
/** the day the arrow keys move to (WAI-ARIA date grid): ←/→ a day, ↑/↓ a week, Home/End the week's ends, PageUp/PageDown a month */
export function dayKeyMove(k: DayKey, key: string, sundayFirst: boolean): DayKey | null {
  const pos = sundayFirst ? weekdayOf(k) : (weekdayOf(k) + 6) % 7;
  switch (key) {
    case "ArrowLeft": return addDays(k, -1);
    case "ArrowRight": return addDays(k, 1);
    case "ArrowUp": return addDays(k, -7);
    case "ArrowDown": return addDays(k, 7);
    case "Home": return addDays(k, -pos);
    case "End": return addDays(k, 6 - pos);
    case "PageUp": return addMonths(k, -1);
    case "PageDown": return addMonths(k, 1);
    default: return null;
  }
}

/**
 * The month calendar of `DateField` (DS А7; docs/specs/03 §7.1). States by shape (the review of wave 5б): the chosen day —
 * an `ink` circle with the inverse digit; today — an `ink` ring, no fill; a day off — `mut` digit, full contrast, can be
 * picked (an emergency on Saturday is normal); before `min` (the company's today by default) — `dimOpacity` and not picked;
 * another month's day — `mut`, a tap picks it (the month follows). Cells 44 × 44, no overlap of the touch zones. The week
 * starts on Sunday in en-US. Web: one Tab stop for the grid, arrows / Home / End / PageUp / PageDown inside.
 */
export function DatePick({ value, onPick, min, testID }: { value: DayKey | null; onPick: (k: DayKey) => void; min?: DayKey; testID?: string }) {
  // days off of the company are paler (its hours by weekday, «Компания → Расписание»)
  const hours = businessHoursOf(useStore().db.company);
  const { t, lang } = useI18n();
  const { c } = useTheme();
  const today = todayKey();
  const first = min ?? today;
  const [month, setMonth] = useState<DayKey>(value ?? (today < first ? first : today));
  // the month follows a value set from outside («Сегодня», another field)
  useEffect(() => {
    if (value) setMonth(value);
  }, [value]);
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  const sundayFirst = lang === "en";
  const cells = monthGrid(month, sundayFirst);
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
  // labels of calendar days (no zone); «today» is the company's (П4b)
  const title = formatDayKey(month, { month: "long", year: "numeric" }, loc);
  const atMin = month.slice(0, 7) <= first.slice(0, 7);
  // the one Tab stop of the grid: the chosen day, else today, else the first day that can be picked in this month
  const inMonth = (k: DayKey | null) => !!k && k.slice(0, 7) === month.slice(0, 7);
  const focusKey = inMonth(value) ? value! : inMonth(today) && today >= first ? today : cells.find((x) => x.inMonth && x.key >= first)?.key ?? null;
  const [want, setWant] = useState<DayKey | null>(null);
  const cellId = (k: DayKey) => `${testID ?? "date-pick"}-cell-${k}`;
  useEffect(() => {
    if (!want || Platform.OS !== "web" || typeof document === "undefined") return;
    (document.getElementById(cellId(want)) as HTMLElement | null)?.focus();
    setWant(null);
    // focus once the month with that day is drawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, month]);
  const onKey = (e: { key: string; preventDefault: () => void; target?: unknown }) => {
    const id = (e.target as HTMLElement | undefined)?.id ?? "";
    const from = id.slice(id.lastIndexOf("-cell-") + 6) as DayKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return;
    const to = dayKeyMove(from, e.key, sundayFirst);
    if (!to) return;
    e.preventDefault();
    const k = to < first ? first : to;
    if (k.slice(0, 7) !== month.slice(0, 7)) setMonth(k);
    setWant(k);
  };
  return (
    <View style={{ gap: space[1] }}>
      <RowView style={{ justifyContent: "space-between" }}>
        {atMin ? (
          // the month of `min`: nothing earlier can be picked — no way back (a space keeps the title in place)
          <View style={{ width: component.dockBtn, height: component.dockBtn }} testID={testID ? `${testID}-prev-off` : undefined} />
        ) : (
          <IconButton icon="chevronLeft" label={t("ui.cal.prev")} onPress={() => setMonth(addMonths(month, -1))} testID={testID ? `${testID}-prev` : undefined} />
        )}
        <View accessibilityRole="header" accessibilityLiveRegion="polite" {...({ "aria-live": "polite" } as object)}>
          <T v="body" w="semibold">{title}</T>
        </View>
        <IconButton icon="chevronRight" label={t("ui.cal.next")} onPress={() => setMonth(addMonths(month, 1))} testID={testID ? `${testID}-next` : undefined} />
      </RowView>
      <View style={{ flexDirection: "row" }}>
        {weeks[0]!.map((x) => (
          <T key={x.key} v="micro" tone="mut" center style={{ flex: 1 }}>
            {formatDayKey(x.key, { weekday: "short" }, loc)}
          </T>
        ))}
      </View>
      <View {...(Platform.OS === "web" ? ({ role: "grid", onKeyDown: onKey } as object) : null)} accessibilityLabel={title}>
        {weeks.map((row) => (
          <View key={row[0]!.key} style={{ flexDirection: "row" }} {...(Platform.OS === "web" ? ({ role: "row" } as object) : null)}>
            {row.map((x) => {
              const s = dayState(x.key, { value, today, first, month, workday: (k) => isWorkday(k, hours) });
              const words = [formatDayKey(x.key, { weekday: "long", month: "long", day: "numeric" }, loc), s.today ? t("ui.cal.today") : null, s.off ? t("ui.cal.dayOff") : null].filter(Boolean).join(", ");
              const ink = s.selected ? c.bg : s.off || s.other ? c.mut : c.ink;
              return (
                <Press
                  key={x.key}
                  nativeID={cellId(x.key)}
                  testID={testID ? `${testID}-${x.key}` : undefined}
                  onPress={s.before ? undefined : () => onPick(x.key)}
                  disabled={s.before}
                  visibleHeight={size.hitMin}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: s.before, selected: s.selected }}
                  accessibilityLabel={words}
                  {...({ tabIndex: x.key === focusKey ? 0 : -1, dataSet: { state: [s.selected && "selected", s.today && "today", s.off && "off", s.before && "before", s.other && "other"].filter(Boolean).join(" ") } } as object)}
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  style={{ height: size.hitMin, alignItems: "center", justifyContent: "center", opacity: s.before ? component.dimOpacity : 1 }}
                >
                  {/* the shape: an ink circle — chosen; an ink ring — today; nothing — any other day */}
                  <View
                    style={{
                      width: component.dockBtn,
                      height: component.dockBtn,
                      borderRadius: radius.pill,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: s.selected ? c.ink : "transparent",
                      borderWidth: s.today && !s.selected ? component.selectedBorder : 0,
                      borderColor: c.ink,
                    }}
                  >
                    <T v="caption" w={s.selected || s.today ? "bold" : "regular"} tabular style={{ color: ink }}>
                      {Number(x.key.slice(8))}
                    </T>
                  </View>
                </Press>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export { dayOffsetOf } from "@/features/calendar";
