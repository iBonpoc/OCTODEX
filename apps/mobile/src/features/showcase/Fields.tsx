import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { TextField } from "@/ui/controls";
import { formatPhoneUS } from "@/ui/inputFormat";
import { NumberField } from "@/ui/numberField";
import { formatBps, formatCents } from "@/ui/numberInput";
import { T } from "@/ui/primitives";
import { FieldGroup, SectionTitle } from "@/ui/surfaces";
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
  const [days, setDays] = useState(12);
  const paste = async () => {
    const v = await Clipboard.getStringAsync().catch(() => "");
    if (v) setPhone(formatPhoneUS(v));
  };
  return (
    <View testID="showcase-fields">
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
      </FieldGroup>
    </View>
  );
}
