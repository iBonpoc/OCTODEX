import { useState } from "react";
import { Platform, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { Button, Toggle } from "@/ui/controls";
import { Labeled, RatePctField } from "@/features/fields";
import { haptics } from "@/ui/haptics";
import { T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/** the samples of the estimate editor (DS §8.3–8.5, Б13, §14.6): what is shown now, what comes with its component */
const PLANNED: { id: string; title: DictKey; hint: DictKey }[] = [
  { id: "row", title: "ds.rows.row", hint: "ds.rows.rowHint" },
  { id: "swipe", title: "ds.rows.swipe", hint: "ds.rows.swipeHint" },
  { id: "section", title: "ds.rows.section", hint: "ds.rows.sectionHint" },
  { id: "required", title: "ds.rows.required", hint: "ds.rows.requiredHint" },
  { id: "profit", title: "ds.rows.profit", hint: "ds.rows.profitHint" },
  { id: "catalog", title: "ds.rows.catalog", hint: "ds.rows.catalogHint" },
];

/** the tax sheet of the estimate (DS §8.7): the switch, the rate by hand, «as in the last estimate» (nothing is saved) */
function TaxSample() {
  const { t } = useI18n();
  const [on, setOn] = useState(true);
  const [ppm, setPpm] = useState(0);
  return (
    <Card>
      <View testID="showcase-rows-tax" style={{ gap: space[2] }}>
        <T v="heading">{t("ds.rows.tax")}</T>
        <T v="caption" tone="mut">{t("ds.rows.taxHint")}</T>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body">{t("ue.taxOn")}</T>
          <Toggle label={t("ue.tax")} on={on} onChange={setOn} />
        </RowView>
        {on ? (
          <>
            <Labeled label={t("ue.taxRate")}>
              <RatePctField ppm={ppm} onChange={setPpm} />
            </Labeled>
            {ppm !== 88750 ? <Button label={t("ue.taxLast", { rate: "8.875" })} variant="ghost" onPress={() => setPpm(88750)} /> : null}
          </>
        ) : null}
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">{t("ue.taxOn")}</T>
          <Toggle label={t("ue.tax")} on={false} onChange={() => {}} disabled />
        </RowView>
        <T v="caption" tone="mut">{t("ue.taxExemptClient")}</T>
      </View>
    </Card>
  );
}

/** Estimate rows and lists (DS §8.3): the drag feel is live; the rest are named here and come with their components. */
export function RowsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "rows")!;
  const [last, setLast] = useState<string | null>(null);
  const feel = (id: "light" | "medium" | "selection", label: DictKey) => (
    <View key={id} testID={`showcase-rows-feel-${id}`}>
      <Button
        label={`${t("ds.hap.feel")}: ${t(label)}`}
        variant="secondary"
        onPress={() => {
          haptics[id]();
          setLast(t(label));
        }}
      />
    </View>
  );
  return (
    <View testID="showcase-rows">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="heading">{t("ds.rows.drag")}</T>
        <T v="caption" tone="mut">{Platform.OS === "web" ? t("ds.hap.web") : t("ds.rows.dragHint")}</T>
        {feel("light", "ds.rows.dragLight")}
        {feel("medium", "ds.rows.dragMedium")}
        {feel("selection", "ds.rows.dragBorder")}
        <View testID="showcase-rows-last">
          <T v="caption">{last ? t("ds.hap.last", { name: last }) : t("ds.hap.none")}</T>
        </View>
        <T v="caption" tone="mut">{t("ds.rows.dragNone")}</T>
      </Card>
      <TaxSample />
      {PLANNED.map((p) => (
        <Card key={p.id}>
          <View testID={`showcase-rows-${p.id}`} style={{ gap: space[1] }}>
            <T v="heading">{t(p.title)}</T>
            <T v="caption" tone="mut">{t(p.hint)}</T>
            <View testID={`showcase-rows-${p.id}-soon`}>
              <T v="caption">{t("ds.rows.soon")}</T>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}
