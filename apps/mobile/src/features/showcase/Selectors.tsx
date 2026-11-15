import { useState } from "react";
import { View } from "react-native";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips, ReadOnly, TextField } from "@/ui/controls";
import { Anchored, useRequiredForm } from "@/ui/requiredForm";
import { SelectField } from "@/ui/selectField";
import { T } from "@/ui/primitives";
import { Card, FieldGroup, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";
import { StatusNote } from "@/ui/statusNote";
import { ViewTabs } from "@/ui/viewTabs";

const UNITS = ["ft", "in", "yd", "m", "cm", "mm"] as const;
const TWENTY = Array.from({ length: 20 }, (_, i) => `n${i + 1}`);
const MANY = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"] as const;
type Unit = (typeof UNITS)[number];
/** a client's eight tabs, with the counts of what waits (DS §9 А1п; the client card, #1343) */
const VTABS: [string, DictKey, number?][] = [
  ["overview", "client.tab.overview"],
  ["estimates", "cl6.tab.estimates", 2],
  ["invoices", "cl6.tab.invoices", 1],
  ["jobs", "cl6.tab.jobs", 1],
  ["tasks", "client.tab.tasks", 1],
  ["notes", "cl6.tab.notes"],
  ["files", "client.tab.files"],
  ["history", "client.tab.history"],
];
type VTab = string;

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
  const [vtab, setVtab] = useState<VTab>("overview");
  const [many, setMany] = useState<Unit>("ft");
  // a required field (DS §11 п.3–4): the button is always on; pressed with the field empty it shows the error under it
  const form = useRequiredForm();
  const [reqName, setReqName] = useState("");
  const [reqKind, setReqKind] = useState<"a" | "b" | null>(null);
  const [reqDone, setReqDone] = useState(false);
  return (
    <View testID="showcase-selectors">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      {/* DS §9 А1п (#1343): the row of view tabs of an object's screen — live: a press opens a tab, the row scrolls */}
      <Card>
        <T v="heading">{t("ds.vtabs.title")}</T>
        <T v="caption" tone="mut">{t("ds.vtabs.hint")}</T>
        <ViewTabs testID="showcase-vtabs" label={t("cl6.tabs")} value={vtab} onChange={setVtab} items={VTABS.map(([k, l, n]) => ({ key: k, label: t(l), count: n }))} />
        <View testID="showcase-vtabs-picked">
          <T v="caption">{t("ds.vtabs.picked", { name: t(VTABS.find(([k]) => k === vtab)![1]) })}</T>
        </View>
      </Card>
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
      <FieldGroup title={t("ds.req.title")}>
        <T v="caption" tone="mut">{t("ds.req.hint")}</T>
        <View testID="showcase-required">
          <TextField type="name" value={reqName} onChangeText={(v) => { setReqName(v); setReqDone(false); }} placeholder={t("ds.req.name")} label={t("ds.req.name")} field={form.field("name")} testID="showcase-required-name" />
          <Anchored field={form.field("kind")}>
            <ChoiceChips label={t("ds.req.kind")} value={reqKind ?? ""} onChange={(k) => { setReqKind(k as "a" | "b"); form.field("kind").clear(); }} items={[{ key: "a", label: t("ds.choice.a") }, { key: "b", label: t("ds.choice.b") }]} />
          </Anchored>
          <Button
            label={t("ds.req.save")}
            testID="showcase-required-save"
            onPress={() =>
              form.submit(
                [
                  ...(reqName.trim() ? [] : [{ id: "name", text: t("ds.req.nameErr") }]),
                  ...(reqKind ? [] : [{ id: "kind", text: t("ds.req.kindErr") }]),
                ],
                () => setReqDone(true),
              )
            }
          />
          {reqDone ? <StatusNote tone="ok">{t("ds.req.ok")}</StatusNote> : null}
        </View>
      </FieldGroup>
    </View>
  );
}
