import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { ChoiceChips, ReadOnly } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

const UNITS = ["ft", "in", "yd", "m", "cm", "mm"] as const;
const TWENTY = Array.from({ length: 20 }, (_, i) => `n${i + 1}`);
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
  const [tenth, setTenth] = useState<(typeof MANY)[number] | null>("a10");
  const [twenty, setTwenty] = useState<string | null>(null);
  const items = UNITS.map((u) => ({ key: u, label: u }));
  const [few, setFew] = useState<"a" | "b" | "c">("a");
  const [many, setMany] = useState<Unit>("ft");
  return (
    <View testID="showcase-selectors">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="heading">{t("ds.select.title")}</T>
        <T v="caption" tone="mut">{t("ds.select.hint")}</T>
        <SelectField testID="showcase-select-chosen" label={t("ds.select.unit")} value={unit} items={items} onChange={setUnit} />
        <SelectField testID="showcase-select-empty" label={t("ds.select.unit")} value={none} items={items} onChange={setNone} />
        <SelectField testID="showcase-select-error" label={t("ds.select.unit")} value={err} items={items} onChange={setErr} error={err ? undefined : t("ds.select.error")} />
        <ReadOnly value>
          <SelectField testID="showcase-select-readonly" label={t("ds.select.readonly")} value="ft" items={items} onChange={() => {}} />
        </ReadOnly>
        <SelectField testID="showcase-select-long" label={t("ds.select.twelve")} value={long} items={MANY.map((m) => ({ key: m, label: m }))} onChange={setLong} />
        <SelectField testID="showcase-select-tenth" label={t("ds.select.tenth")} value={tenth} items={MANY.map((m) => ({ key: m, label: m }))} onChange={setTenth} />
        <SelectField testID="showcase-select-search" label={t("ds.select.twenty")} value={twenty} items={TWENTY.map((m) => ({ key: m, label: m }))} onChange={setTwenty} />
      </Card>
      <Card>
        <T v="heading">{t("ds.choice.title")}</T>
        <T v="caption" tone="mut">{t("ds.choice.hint")}</T>
        <View testID="showcase-choice-few">
          <ChoiceChips label={t("ds.choice.few")} value={few} onChange={setFew} items={[{ key: "a", label: t("ds.choice.a") }, { key: "b", label: t("ds.choice.b") }, { key: "c", label: t("ds.choice.c") }]} />
        </View>
        <View testID="showcase-choice-many">
          <ChoiceChips label={t("ds.choice.many")} value={many} onChange={setMany} items={items} />
        </View>
      </Card>
    </View>
  );
}
