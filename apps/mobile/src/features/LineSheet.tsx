/**
 * Add / edit one estimate line (like Jobber / Housecall Pro): start typing → matches from the company catalog,
 * or keep your own text as a custom item. Then name, description, qty, unit, price, type (for tax), add-on.
 */
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { space, component, size } from "@octo/design-tokens";
import { lineTotal, type CustomLine, type LineGroup } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { lineMarks, linesFromCatalog, newLine } from "./estimateDoc";
import { LineMarks } from "./LineMarks";
import { itemPrice, kindLabel } from "./estimatePickers";
import { Labeled, MoneyField, QtyField } from "./fields";
import { Button, ChoiceChips, IconButton, TextField, Toggle } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Divider, ListRow, RowView } from "@/ui/surfaces";

const GROUPS: LineGroup[] = ["service", "labor", "material"];

export function LineSheet({
  visible,
  line,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  /** null = new line (starts with search) */
  line: CustomLine | null;
  onClose: () => void;
  onSave: (lines: CustomLine[]) => void;
  onRemove?: () => void;
}) {
  const { db } = useStore();
  const { t, money } = useI18n();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<CustomLine | null>(line);
  useEffect(() => {
    if (visible) {
      setDraft(line);
      setQ("");
    }
  }, [visible, line]);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return db.catalog
      .filter((x) => !n || x.name.toLowerCase().includes(n) || (x.description ?? "").toLowerCase().includes(n))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [db.catalog, q]);

  const pick = (it: CatalogItem) => {
    const lines = linesFromCatalog(it, db.catalog);
    if (it.kind === "kit") {
      onSave(lines);
      onClose();
    } else setDraft(lines[0]!);
  };
  const set = (p: Partial<CustomLine>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const ok = !!draft && draft.name.trim().length > 0;

  return (
    <Sheet visible={visible} onClose={onClose} title={line ? t("ue.editLine") : t("ue.addItem")}>
      {!draft ? (
        <View style={{ gap: space[3] }}>
          <View testID="ue-line-search">
            <TextField type="search" value={q} onChangeText={setQ} placeholder={t("ue.searchOrType")} icon="search" />
          </View>
          <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
            <View testID="ue-line-custom">
              <ListRow
                title={q.trim() ? t("ue.customNamed", { name: q.trim() }) : t("ue.custom")}
                subtitle={t("ue.customHint")}
                left={<Icon name="plus" />}
                onPress={() => setDraft(newLine("service", { name: q.trim(), unit: "ea" }))}
              />
            </View>
            {matches.map((it) => (
              <View key={it.id}>
                <Divider />
                <ListRow
                  title={it.name}
                  subtitle={`${t(kindLabel(it.kind))} · ${money(itemPrice(it, db.catalog))} / ${it.unit}${it.placeholder ? ` · ${t("cat.placeholder")}` : ""}`}
                  onPress={() => pick(it)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: component.sheetFormMax }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[3] }}>
          {lineMarks(draft).length ? (
            <View testID="ue-line-source-hint" style={{ gap: space[2] }}>
              <LineMarks marks={lineMarks(draft)} lineId={draft.id} />
              <T v="caption" tone="mut">
                {t("ue.src.hint")}
              </T>
            </View>
          ) : null}
          <TextField type="title" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder={t("ue.lineName")} />
          <TextField type="note" value={draft.description ?? ""} onChangeText={(v) => set({ description: v || undefined })} placeholder={t("ue.lineDesc")} />
          <RowView style={{ alignItems: "flex-end" }}>
            <Labeled label={t("ue.qty")}>
              <QtyField qty={String(draft.quantity)} onChange={(v) => set({ quantity: v })} />
            </Labeled>
            <Labeled label={t("ue.unit")}>
              <TextField type="unit" value={draft.unit} onChangeText={(v) => set({ unit: v })} placeholder="ea" />
            </Labeled>
            <Labeled label={t("ue.price")} flex={1.4}>
              <View testID="ue-line-price">
                <MoneyField cents={draft.unitPriceCents} onChange={(c) => set({ unitPriceCents: c })} />
              </View>
            </Labeled>
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" tone="mut">
              {t("ue.total")}
            </T>
            <T v="title" tabular>
              {money(lineTotal({ name: draft.name, quantity: draft.quantity, unitPriceCents: draft.unitPriceCents }))}
            </T>
          </RowView>
          <Labeled label={t("ue.type")}>
            <ChoiceChips value={draft.group} onChange={(g) => set({ group: g })} items={GROUPS.map((g) => ({ key: g, label: t(`ue.group.${g}` as DictKey) }))} />
          </Labeled>
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("ue.addon")}
            </T>
            <Toggle label={t("ue.addon")} on={!!draft.optional} onChange={(on) => set({ optional: on })} />
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            {line && onRemove ? (
              <View testID="ue-line-remove">
              <IconButton
                icon="trash"
                label={t("ue.removeLine")}
                onPress={() => {
                  onRemove();
                  onClose();
                }}
              />
              </View>
            ) : (
              <Button label={t("ue.backToSearch")} icon="search" variant="ghost" size="sm" onPress={() => setDraft(null)} />
            )}
            <View testID="ue-line-save">
            <Button
              label={t("ue.saveLine")}
              icon="check"
              disabled={!ok}
              onPress={() => {
                onSave([{ ...draft, name: draft.name.trim() }]);
                onClose();
              }}
            />
            </View>
          </RowView>
        </ScrollView>
      )}
    </Sheet>
  );
}

