import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { SelectField } from "@/ui/selectField";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

const UNITS = ["ft", "in", "yd", "m", "cm", "mm"] as const;
const MANY = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"] as const;
type Unit = (typeof UNITS)[number];

/** Selectors (DS §9): one of 5–12 in a form row — SelectField with the menu at the row. */
export function SelectorsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "selectors")!;
  const [unit, setUnit] = useState<Unit | null>("ft");
  const [none, setNone] = useState<Unit | null>(null);
  const [err, setErr] = useState<Unit | null>(null);
  const [long, setLong] = useState<(typeof MANY)[number] | null>(null);
  const items = UNITS.map((u) => ({ key: u, label: u }));
  return (
    <View testID="showcase-selectors">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="heading">{t("ds.select.title")}</T>
        <T v="caption" tone="mut">{t("ds.select.hint")}</T>
        <SelectField testID="showcase-select-chosen" label={t("ds.select.unit")} value={unit} items={items} onChange={setUnit} />
        <SelectField testID="showcase-select-empty" label={t("ds.select.unit")} value={none} items={items} onChange={setNone} />
        <SelectField testID="showcase-select-error" label={t("ds.select.unit")} value={err} items={items} onChange={setErr} error={err ? undefined : t("ds.select.error")} />
        <SelectField testID="showcase-select-long" label={t("ds.select.twelve")} value={long} items={MANY.map((m) => ({ key: m, label: m }))} onChange={setLong} />
      </Card>
    </View>
  );
}
