import { useState } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { addMonths, dayKeyOf, fromDayKey, monthGrid, todayKey, type DayKey } from "@/features/calendar";
import { isWorkday } from "@/features/schedule";
import { businessHoursOf } from "@/features/scheduleSettings";
import { useStore } from "@/data/store";
import { IconButton } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/**
 * «Другая дата» in the visit form (docs/specs/03 §7.1, wave П3b): a month calendar. Past days cannot be picked; days off
 * are paler but can be picked (an emergency on Saturday is normal). The picked day has an ink frame — the one yellow of
 * the form stays the save button (rule 2).
 */
export function DatePick({ value, onPick }: { value: DayKey; onPick: (k: DayKey) => void }) {
  // days off of the company are paler (its hours by weekday, «Компания → Расписание»)
  const hours = businessHoursOf(useStore().db.company);
  const { t, lang } = useI18n();
  const { c } = useTheme();
  const [month, setMonth] = useState<DayKey>(value);
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  const cells = monthGrid(month);
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
  const wd = new Intl.DateTimeFormat(loc, { weekday: "short" });
  const title = new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(fromDayKey(month));
  const today = todayKey();
  const thisMonth = month.slice(0, 7) <= today.slice(0, 7);
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
            {wd.format(fromDayKey(x.key))}
          </T>
        ))}
      </View>
      {weeks.map((row) => (
        <View key={row[0]!.key} style={{ flexDirection: "row", gap: space[1] }}>
          {row.map((x) => {
            const past = x.key < today;
            const off = !isWorkday(fromDayKey(x.key), hours);
            const selected = x.key === value;
            return (
              <Press
                key={x.key}
                onPress={past ? undefined : () => onPick(x.key)}
                disabled={past}
                visibleHeight={component.rowCompact}
                accessibilityRole="button"
                accessibilityState={{ disabled: past, selected }}
                accessibilityLabel={new Intl.DateTimeFormat(loc, { weekday: "long", month: "long", day: "numeric" }).format(fromDayKey(x.key))}
                containerStyle={{ flex: 1, minWidth: 0 }}
                style={{
                  minHeight: component.rowCompact,
                  borderRadius: component.checkbox.radius,
                  borderWidth: selected ? component.selectedBorder : component.hairline,
                  borderColor: selected ? c.ink : c.bd,
                  backgroundColor: x.key === today ? c.surf2 : c.in,
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

export const dayOffsetOf = (k: DayKey): number => {
  const a = fromDayKey(k).getTime();
  const b = fromDayKey(dayKeyOf(new Date())).getTime();
  return Math.round((a - b) / 86_400_000);
};
