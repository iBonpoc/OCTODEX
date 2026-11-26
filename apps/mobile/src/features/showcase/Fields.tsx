import { space } from "@octo/design-tokens";
import { useState } from "react";
import { FieldRow } from "@/ui/pairs";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useI18n } from "@/i18n";
import { Labeled, MoneyField } from "@/features/fields";
import { Button, TextField } from "@/ui/controls";
import { formatPhoneUS } from "@/ui/inputFormat";
import { NumberField } from "@/ui/numberField";
import { DateField } from "@/ui/dateField";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import { formatBps, formatCents } from "@/ui/numberInput";
import { T } from "@/ui/primitives";
import { FieldGroup, FormMain, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/**
 * Input fields: a form's fields straight on the background, no card (DS §11 п.17), the field's helper action an icon inside it
 * (§11 п.18, #1411), and the number field in its four kinds (А6.2), live.
 */
export function FieldsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "fields")!;
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [cents, setCents] = useState(123450);
  const [bps, setBps] = useState(825);
  const [qty, setQty] = useState("2.5");
  const [date, setDate] = useState<DayKey | null>(() => addDays(todayKey(), 1));
  const [due, setDue] = useState<DayKey | null>(null);
  const [ft, setFt] = useState("12");
  const [inch, setInch] = useState("7 1/2");
  const [days, setDays] = useState(12);
  const paste = async () => {
    const v = await Clipboard.getStringAsync().catch(() => "");
    if (v) setPhone(formatPhoneUS(v));
  };
  return (
    <View testID="showcase-fields" style={{ gap: space[3] }}>
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <FieldGroup title={t("ds.fields.form")} testID="showcase-form">
        <T v="caption" tone="mut">{t("ds.fields.formHint")}</T>
        <Labeled label={t("lead.phone")}>
          <TextField
            type="phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 555-0100"
            label={t("lead.phone")}
            icon="phone"
            testID="showcase-phone"
            action={{ icon: "copy", label: t("field.pastePhone"), onPress: paste, testID: "showcase-phone-paste" }}
          />
        </Labeled>
        <Labeled label={t("lead.message")}>
          <TextField
            type="note"
            value={note}
            onChangeText={setNote}
            placeholder={t("lead.messagePh")}
            testID="showcase-note"
            action={note ? { icon: "close", label: t("common.clear"), onPress: () => setNote(""), testID: "showcase-note-clear" } : undefined}
          />
        </Labeled>
        <T v="caption" tone="mut">{t("ds.fields.formMain")}</T>
        <FormMain testID="showcase-form-main">
          <Button label={t("ds.fields.formMainBtn")} full onPress={() => {}} />
        </FormMain>
      </FieldGroup>
      <FieldGroup title={t("ds.fields.title")}>
        <T v="caption" tone="mut">{t("ds.fields.hint")}</T>
        <NumberField kind="money" label={t("ds.fields.money")} unitWord={t("ds.fields.moneyWord")} cents={cents} onChange={setCents} testID="showcase-num-money" />
        <View testID="showcase-num-money-value">
          <T v="caption" tone="mut">{t("ds.fields.value", { v: formatCents(cents) })}</T>
        </View>
        <NumberField kind="percent" label={t("ds.fields.percent")} unitWord={t("ds.fields.pctWord")} bps={bps} onChange={setBps} testID="showcase-num-percent" />
        <View testID="showcase-num-percent-value">
          <T v="caption" tone="mut">{t("ds.fields.value", { v: `${formatBps(bps)} %` })}</T>
        </View>
        <NumberField kind="qty" label={t("ds.fields.qty")} unit="ft" unitWord={t("ds.fields.qtyWord")} qty={qty} onChange={setQty} testID="showcase-num-qty" />
        <NumberField kind="integer" label={t("ds.fields.integer")} value={days} onChange={setDays} testID="showcase-num-integer" />
        {/* #2455: a field of a totals row hands its screen's total to the iPhone keyboard's bar */}
        <T v="caption" tone="mut">{t("ds.fields.totalBar")}</T>
        <MoneyField unit a11yLabel={t("ds.fields.money")} cents={cents} onChange={setCents} barNote={`${t("ue.total")} ${formatCents(cents)}`} />
        {/* DS А7: a day in a form — the row, «Сегодня · Завтра» and the calendar open under it; the second one may be empty */}
        <DateField label={t("ds.fields.date")} value={date} onChange={setDate} testID="showcase-date" />
        <DateField label={t("ds.fields.due")} value={due} onChange={setDue} optional testID="showcase-due" />
        {/* two narrow fields in one row (#1990): the unit stays inside its own frame on a phone */}
        <T v="caption" tone="mut">{t("ds.fields.narrow")}</T>
        {/* FieldRow (#2350): a pair in one row while each keeps `component.pair.fieldMin`, a column on a narrower screen */}
        <FieldRow testID="showcase-num-narrow">
          <NumberField kind="qty" label={t("ds.fields.ft")} unit="ft" unitWord={t("ds.fields.qtyWord")} qty={ft} onChange={setFt} testID="showcase-num-ft" />
          <NumberField kind="qty" label={t("ds.fields.in")} unit="in" unitWord={t("ds.fields.inWord")} qty={inch} onChange={setInch} testID="showcase-num-in" />
        </FieldRow>
      </FieldGroup>
    </View>
  );
}
