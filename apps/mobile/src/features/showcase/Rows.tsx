import { useState } from "react";
import { Platform, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import type { CustomLine } from "@octo/estimating-engine";
import { SortableList } from "@/features/SortableList";
import { moveLine, sameLayout, viewRows } from "@/features/sectionLayout";
import { Button } from "@/ui/controls";
import { PhotoStrip } from "@/features/PhotoStrip";
import { haptics } from "@/ui/haptics";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
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

const demoLines = (): CustomLine[] => [1, 2, 3, 4].map((n) => ({ id: `demo${n}`, name: String(n), group: "service", quantity: "1", unit: "ea", unitPriceCents: 0 }));

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
