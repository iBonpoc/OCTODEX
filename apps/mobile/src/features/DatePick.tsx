import { useState } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { addMonths, monthGrid, todayKey, type DayKey } from "@/features/calendar";
import { formatDayKey } from "@/features/zone";
import { isWorkday } from "@/features/schedule";
import { businessHoursOf } from "@/features/scheduleSettings";
import { useStore } from "@/data/store";
import { IconButton } from "@/ui/controls";
import { fillStyle } from "@/ui/fill";
import { Press, T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/**
 * The month calendar of `DateField` (DS А7; docs/specs/03 §7.1): days before `min` (the company's today by default) cannot
 * be picked; days off are paler but can be picked (an emergency on Saturday is normal). The picked day — «Заливка» and bold
 * (DS §9.2; no corner check: spec 56 removed `SelectedCheck`); today — `surf2`. The one yellow of the form stays its save.
 */
export function DatePick({ value, onPick, min, testID }: { value: DayKey | null; onPick: (k: DayKey) => void; min?: DayKey; testID?: string }) {
  // days off of the company are paler (its hours by weekday, «Компания → Расписание»)
  const hours = businessHoursOf(useStore().db.company);
  const { t, lang } = useI18n();
  const { c } = useTheme();
  const [month, setMonth] = useState<DayKey>(value ?? todayKey());
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  const cells = monthGrid(month);
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
  // labels of calendar days (no zone); «today» is the company's (П4b)
  const title = formatDayKey(month, { month: "long", year: "numeric" }, loc);
  const today = todayKey();
  const first = min ?? today;
  const thisMonth = month.slice(0, 7) <= first.slice(0, 7);
  return (
    <View style={{ gap: space[1] }}>
      <RowView style={{ justifyContent: "space-between" }}>
        <IconButton icon="chevronLeft" label={t("plan.prev")} onPress={() => { if (!thisMonth) setMonth(addMonths(month, -1)); }} />
        <T v="body" w="semibold">{title}</T>
        <IconButton icon="chevronRight" label={t("plan.next")} onPress={() => setMonth(addMonths(month, 1))} />
      </RowView>
      <View style={{ flexDirection: "row", gap: space[1] }}>
        {weeks[0]!.map((x) => (
          <T key={x.key} v="micro" tone="mut" center style={{ flex: 1 }}>
            {formatDayKey(x.key, { weekday: "short" }, loc)}
          </T>
        ))}
      </View>
      {weeks.map((row) => (
        <View key={row[0]!.key} style={{ flexDirection: "row", gap: space[1] }}>
          {row.map((x) => {
            const past = x.key < first;
            const off = !isWorkday(x.key, hours);
            const selected = x.key === value;
            return (
              <Press
                key={x.key}
                testID={testID ? `${testID}-${x.key}` : undefined}
                onPress={past ? undefined : () => onPick(x.key)}
                disabled={past}
                visibleHeight={component.rowCompact}
                accessibilityRole="button"
                accessibilityState={{ disabled: past, selected }}
                accessibilityLabel={formatDayKey(x.key, { weekday: "long", month: "long", day: "numeric" }, loc)}
                containerStyle={{ flex: 1, minWidth: 0 }}
                style={{
                  minHeight: component.rowCompact,
                  borderRadius: component.checkbox.radius,
                  // the chosen day: «Заливка» + a check (DS «Выделение выбранного»); today keeps its raised surface
                  ...(selected ? fillStyle(c) : { backgroundColor: x.key === today ? c.surf2 : c.in }),
                  borderWidth: component.hairline,
                  borderColor: selected ? "transparent" : c.bd,
                  opacity: past || !x.inMonth ? component.dimOpacity : off ? component.dimOpacity : 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T v="caption" w={selected ? "bold" : "regular"} tabular>
                  {Number(x.key.slice(8))}
                </T>
              </Press>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export { dayOffsetOf } from "@/features/calendar";
