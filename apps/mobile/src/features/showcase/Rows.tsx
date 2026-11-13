import { useState } from "react";
import { Platform, View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n, type DictKey } from "@/i18n";
import type { CustomLine } from "@octo/estimating-engine";
import { SwipeRow } from "@/features/estimate/SwipeRow";
import { SortableList } from "@/features/SortableList";
import { moveLine, sameLayout, viewRows } from "@/features/sectionLayout";
import { Button, Toggle } from "@/ui/controls";
import { Labeled, RatePctField } from "@/features/fields";
import { PhotoStrip } from "@/features/PhotoStrip";
import { haptics } from "@/ui/haptics";
import { Press, T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/** the samples of the estimate editor (DS §8.3–8.5, Б13, §14.6): what is shown now, what comes with its component */
const PLANNED: { id: string; title: DictKey; hint: DictKey }[] = [
  { id: "row", title: "ds.rows.row", hint: "ds.rows.rowHint" },
  { id: "compact", title: "ds.rows.compact", hint: "ds.rows.compactHint" },
  { id: "section", title: "ds.rows.section", hint: "ds.rows.sectionHint" },
  { id: "required", title: "ds.rows.required", hint: "ds.rows.requiredHint" },
  { id: "profit", title: "ds.rows.profit", hint: "ds.rows.profitHint" },
  { id: "catalog", title: "ds.rows.catalog", hint: "ds.rows.catalogHint" },
];

const demoLines = (): CustomLine[] => [1, 2, 3, 4].map((n) => ({ id: `demo${n}`, name: String(n), group: "service", quantity: "1", unit: "ea", unitPriceCents: 0 }));

/** «Заливка» (DS «Выделение выбранного», #1306): the chosen one is a raised neutral fill with a small shadow — never `acc`, never a status colour */
function FillSample() {
  const { t } = useI18n();
  const { c } = useTheme();
  const [sel, setSel] = useState("brief");
  const items = [
    { key: "brief", label: t("ds.rows.fillA") },
    { key: "full", label: t("ds.rows.fillB") },
    { key: "sections", label: t("ds.rows.fillC") },
  ];
  return (
    <Card>
      <View testID="showcase-rows-fill" style={{ gap: space[2] }}>
        <T v="heading">{t("ds.rows.fill")}</T>
        <T v="caption" tone="mut">{t("ds.rows.fillHint")}</T>
        <RowView>
          {items.map((it) => {
            const on = sel === it.key;
            return (
              <Press
                key={it.key}
                testID={`showcase-fill-${it.key}`}
                onPress={() => setSel(it.key)}
                visibleHeight={size.controlLg}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                // web: a radio is read by aria-checked
                {...({ "aria-checked": on } as object)}
                accessibilityLabel={it.label}
                style={[
                  { minHeight: size.controlLg, paddingHorizontal: space[4], borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
                  on
                    ? { backgroundColor: c.surf2, shadowColor: c.shadow.color, shadowOpacity: component.shadowSm.opacity, shadowRadius: component.shadowSm.radius, shadowOffset: { width: 0, height: component.shadowSm.offsetY } }
                    : null,
                ]}
              >
                <T v="body" w={on ? "semibold" : "medium"} tone={on ? "ink" : "mut"}>
                  {it.label}
                </T>
              </Press>
            );
          })}
        </RowView>
        <View testID="showcase-fill-chosen">
          <T v="caption">{t("ds.rows.fillChosen", { name: items.find((x) => x.key === sel)!.label })}</T>
        </View>
      </View>
    </Card>
  );
}

/** the swipe of an estimate row (DS Б13): on a phone — swipe it; the web has no swipe, its actions are in «⋯» of the row */
function SwipeSample() {
  const { t } = useI18n();
  const { c } = useTheme();
  const [last, setLast] = useState<string | null>(null);
  return (
    <Card>
      <View testID="showcase-rows-swipe" style={{ gap: space[1] }}>
        <T v="heading">{t("ds.rows.swipe")}</T>
        <T v="caption" tone="mut">{Platform.OS === "web" ? t("ds.rows.swipeWeb") : t("ds.rows.swipeHint")}</T>
        <SwipeRow
          left={[{ key: "hide", label: t("est.row.hide"), icon: "eye", testID: "showcase-swipe-hide" }]}
          right={[
            { key: "replace", label: t("est.row.replace"), icon: "refresh", testID: "showcase-swipe-replace" },
            { key: "delete", label: t("est.row.delete"), icon: "trash", tone: "bad", testID: "showcase-swipe-delete" },
          ]}
          onAct={setLast}
        >
          <View style={{ minHeight: size.rowMax, justifyContent: "center" }}>
            <T v="body" w="semibold">{t("ds.rows.swipeRow")}</T>
            <T v="caption" tone="mut">120 LF × $8.50</T>
          </View>
        </SwipeRow>
        {/* the row of a swiped list is opaque: its tone must be the card's (`surfSolid` = `surf` over `bg`) */}
        <RowView>
          <Card style={{ flex: 1 }}>
            <T v="caption">{t("ds.rows.swipeToneCard")}</T>
          </Card>
          <View testID="showcase-swipe-solid" style={{ flex: 1, backgroundColor: c.surfSolid, borderRadius: radius.card, padding: space[3] }}>
            <T v="caption">{t("ds.rows.swipeToneSolid")}</T>
          </View>
        </RowView>
        <View testID="showcase-swipe-last">
          <T v="caption">{last ? t("ds.hap.last", { name: last }) : t("ds.hap.none")}</T>
        </View>
      </View>
    </Card>
  );
}

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

/** a small list to drag: the real SortableList on four sample rows (nothing is saved) */
function LiveDrag() {
  const { t } = useI18n();
  const [lines, setLines] = useState(demoLines);
  const rows = viewRows({ lines, sections: [] });
  return (
    <Card>
      <View testID="showcase-rows-live" style={{ gap: space[1] }}>
        <T v="heading">{t("ds.rows.live")}</T>
        <T v="caption" tone="mut">{t("ds.rows.liveHint")}</T>
        <SortableList
          rows={rows}
          onDrop={(d) => {
            if (d.kind !== "line") return "same";
            const r = moveLine({ lines, sections: [] }, d.id, d.to);
            if (!r.ok || sameLayout({ lines, sections: [] }, r.option)) return "same";
            setLines(r.option.lines);
            return "moved";
          }}
          renderRow={(r) => (r.type === "line" ? <View style={{ minHeight: space[8], justifyContent: "center" }}><T v="body">{`${t("ds.rows.liveItem")} ${r.line.name}`}</T></View> : null)}
        />
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
      <Card>
        <View testID="showcase-rows-photoTile" style={{ gap: space[1] }}>
          <T v="heading">{t("ds.rows.photoTile")}</T>
          <T v="caption" tone="mut">{t("ds.rows.photoTileHint")}</T>
          <PhotoStrip photos={[]} onAdd={() => {}} />
        </View>
      </Card>
      <TaxSample />
      <SwipeSample />
      <FillSample />
      <LiveDrag />
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
