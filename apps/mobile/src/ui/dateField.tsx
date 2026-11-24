import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, findNodeHandle, Keyboard, Platform, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import { DatePick } from "@/features/DatePick";
import type { FieldBinding } from "./requiredForm";
import { Button } from "./controls";
import { useSheetEscape } from "./overlays";
import { SelectField } from "./selectField";
import { RowView } from "./surfaces";
import { FieldRow } from "./pairs";

let seq = 0;

/**
 * A day in a form (DS А7, spec 56 §3 «день в форме — DateField»): a row «Дата · Завтра, ср 18 нояб. ⌄» in the anatomy of
 * `SelectField`; a tap opens, right under the row, «Сегодня · Завтра» (the chosen one marked) and the month calendar — in place,
 * as the date row of an event in Apple Calendar: no layer over a sheet, the same on 390 and from 820 (the panel not wider than
 * `popoverW`, on the left under the row). A pick closes it and gives the focus back to the row; the first Esc / Android «Назад»
 * in a sheet closes it, the next one the sheet. Days are the company's (`todayKey`). `min` — the first day that can be picked
 * (the company's today by default); `optional` adds «Без даты»; `quick={false}` hides the quick days (a form that has its own).
 * `beside` — the field that goes with the day (a time «Начало»): the two stand in one `FieldRow` when they fit (#2350: «дата, время…
 * горизонтально в ряд, если помещаются»), and the calendar opens under the whole row, at its full width.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  optional,
  quick = true,
  error,
  field,
  beside,
  testID,
}: {
  label: string;
  value: DayKey | null;
  onChange: (k: DayKey | null) => void;
  /** days before it are pale and not picked (the company's today when not given) */
  min?: DayKey;
  /** «Без даты» with the quick days; empty reads «Без даты» (a required one reads «Выберите») */
  optional?: boolean;
  /** «Сегодня · Завтра» over the calendar (default) */
  quick?: boolean;
  error?: string;
  field?: FieldBinding;
  /** a field beside the day (a time): one row while both fit, the calendar under both */
  beside?: ReactNode;
  /** the row is `<id>-row-button`, the panel `<id>-panel`; the quick days `<id>-today | -tomorrow | -none`; a day `<id>-day-YYYY-MM-DD` */
  testID?: string;
}) {
  const { t, dayOf } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useRef(`date-field-${++seq}`).current;
  const row = useRef<React.ComponentRef<typeof View> | null>(null);
  const panel = useRef<React.ComponentRef<typeof View> | null>(null);
  const opener = useRef<Element | null>(null);
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const first = min ?? today;
  const word = value === today ? t("common.today") : value === tomorrow ? t("common.tomorrow") : null;
  // in a row with `beside` the half is narrow: the day alone («пт, 20 нояб.»), the calendar still marks today
  const shown = value ? (word && !beside ? `${word}, ${dayOf(value)}` : dayOf(value)) : null;
  // the focus goes back to the row (as SelectField does when its picker closes, DS А3)
  const back = () => {
    if (Platform.OS === "web") {
      const el = opener.current as HTMLElement | null;
      opener.current = null;
      if (el && typeof el.focus === "function") requestAnimationFrame(() => el.isConnected && el.focus());
      return;
    }
    const h = row.current ? findNodeHandle(row.current) : null;
    if (h) AccessibilityInfo.setAccessibilityFocus(h);
  };
  const close = () => {
    setOpen(false);
    back();
  };
  const pick = (k: DayKey | null) => {
    onChange(k);
    close();
  };
  // in a sheet: the first Esc / «Назад» closes the calendar, not the sheet
  useSheetEscape(open ? () => (close(), true) : null);
  // opened: the keyboard goes away and the calendar comes into view (on 390 it would sit under the keyboard or the bar)
  useEffect(() => {
    if (!open) return;
    Keyboard.dismiss();
    if (Platform.OS === "web") requestAnimationFrame(() => (panel.current as unknown as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" }));
  }, [open]);
  const id = (s: string) => (testID ? `${testID}-${s}` : undefined);
  const quickDays = quick ? [today >= first ? today : null, tomorrow >= first ? tomorrow : null].filter((k): k is DayKey => !!k) : [];
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <FieldRow>
        <SelectField<string>
          label={label}
          labelAbove={!!beside}
          value={shown ? "v" : null}
          items={shown ? [{ key: "v", label: shown }] : []}
          placeholder={optional ? t("ui.date.none") : undefined}
          onChange={() => {}}
          onOpen={() => {
            if (Platform.OS === "web" && typeof document !== "undefined") opener.current = document.activeElement;
            setOpen((x) => !x);
          }}
          expanded={open}
          controls={panelId}
          rowRef={(n) => { row.current = n; }}
          error={error}
          field={field}
          testID={id("row")}
        />
        {beside}
      </FieldRow>
      {open ? (
        <View ref={panel} nativeID={panelId} style={{ gap: space[2], width: "100%", maxWidth: component.popoverW }} testID={id("panel")}>
          {quickDays.length || optional ? (
            <RowView>
              {quickDays.map((k) => (
                // the chosen quick day says so (a filled button and «selected»); the others are outlined
                <Button
                  key={k}
                  label={k === today ? t("common.today") : t("common.tomorrow")}
                  size="sm"
                  variant={k === value ? "secondary" : "ghost"}
                  selected={k === value}
                  onPress={() => pick(k)}
                  testID={id(k === today ? "today" : "tomorrow")}
                />
              ))}
              {optional ? <Button label={t("ui.date.none")} size="sm" variant={value === null ? "secondary" : "ghost"} selected={value === null} onPress={() => pick(null)} testID={id("none")} /> : null}
            </RowView>
          ) : null}
          <DatePick value={value} min={first} onPick={(k) => pick(k)} testID={id("day")} />
        </View>
      ) : null}
    </View>
  );
}
