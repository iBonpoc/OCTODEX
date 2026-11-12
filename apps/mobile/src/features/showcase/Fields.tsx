import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { NumberField } from "@/ui/numberField";
import { formatBps, formatCents } from "@/ui/numberInput";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/** Input fields (DS А6.2): the number field in its four kinds, live. */
export function FieldsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "fields")!;
  const [cents, setCents] = useState(123450);
  const [bps, setBps] = useState(825);
  const [qty, setQty] = useState("2.5");
  const [days, setDays] = useState(12);
  return (
    <View testID="showcase-fields">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="heading">{t("ds.fields.title")}</T>
        <T v="caption" tone="mut">{t("ds.fields.hint")}</T>
        <NumberField kind="money" label={t("ds.fields.money")} unitWord={t("ds.fields.moneyWord")} cents={cents} onChange={setCents} testID="showcase-num-money" />
        <View testID="showcase-num-money-value">
          <T v="caption" tone="mut">{t("ds.fields.value", { v: formatCents(cents) })}</T>
        </View>
        <NumberField kind="percent" label={t("ds.fields.percent")} unitWord={t("ds.fields.pctWord")} bps={bps} onChange={setBps} testID="showcase-num-percent" />
        <View testID="showcase-num-percent-value">
          <T v="caption" tone="mut">{t("ds.fields.value", { v: `${formatBps(bps)} %` })}</T>
        </View>
        <NumberField kind="qty" label={t("ds.fields.qty")} unit="ft" qty={qty} onChange={setQty} testID="showcase-num-qty" />
        <NumberField kind="integer" label={t("ds.fields.integer")} value={days} onChange={setDays} testID="showcase-num-integer" />
      </Card>
    </View>
  );
}
