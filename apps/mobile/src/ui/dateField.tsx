import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import { DatePick } from "@/features/DatePick";
import { Button } from "./controls";
import { SelectField } from "./selectField";
import { RowView } from "./surfaces";

/**
 * A day in a form (DS А7, spec 56 §3 «день в форме — DateField»): a row «Дата · Завтра, ср 18 нояб. ⌄» in the anatomy of
 * `SelectField`; a tap opens, right under the row, «Сегодня · Завтра» (one tap, as the old chips) and the month calendar —
 * in place, as the date row of an event in Apple Calendar: no layer over a sheet, the same on 390 and from 820. A pick
 * closes it. Days are the company's (`todayKey`, the company's zone): «Сегодня» is its today at any hour of the phone.
 * `min` — the first day that can be picked (the company's today by default); `optional` adds «Без даты».
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  optional,
  testID,
}: {
  label: string;
  value: DayKey | null;
  onChange: (k: DayKey | null) => void;
  /** days before it are pale and not picked (the company's today when not given) */
  min?: DayKey;
  /** «Без даты» under the quick days */
  optional?: boolean;
  /** the row is `${testID}-button`; the quick days `${testID}-today|tomorrow|none`; a day `${testID}-day-YYYY-MM-DD` */
  testID?: string;
}) {
  const { t, dayOf } = useI18n();
  const [open, setOpen] = useState(false);
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const first = min ?? today;
  const word = value === today ? t("common.today") : value === tomorrow ? t("common.tomorrow") : null;
  const shown = value ? (word ? `${word}, ${dayOf(value)}` : dayOf(value)) : t("ui.date.none");
  const pick = (k: DayKey | null) => {
    onChange(k);
    setOpen(false);
  };
  const id = (s: string) => (testID ? `${testID}-${s}` : undefined);
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <SelectField<string>
        label={label}
        value="v"
        items={[{ key: "v", label: shown }]}
        onChange={() => {}}
        onOpen={() => setOpen((x) => !x)}
        expanded={open}
        testID={id("row")}
      />
      {open ? (
        <View style={{ gap: space[2] }} testID={id("panel")}>
          {/* the quick days: one tap, as the chips were (buttons, not chips: an action that sets the day) */}
          <RowView>
            {today >= first ? <Button label={t("common.today")} size="sm" variant="secondary" onPress={() => pick(today)} testID={id("today")} /> : null}
            {tomorrow >= first ? <Button label={t("common.tomorrow")} size="sm" variant="secondary" onPress={() => pick(tomorrow)} testID={id("tomorrow")} /> : null}
            {optional ? <Button label={t("ui.date.none")} size="sm" variant="ghost" onPress={() => pick(null)} testID={id("none")} /> : null}
          </RowView>
          <DatePick value={value} min={first} onPick={(k) => pick(k)} testID={id("day")} />
        </View>
      ) : null}
    </View>
  );
}
