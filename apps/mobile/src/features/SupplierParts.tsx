/**
 * Suppliers on screens (docs/specs/36 §7): the picker sheet of a price-list item and the «История цен» block.
 * Only who sees suppliers and costs comes here (the screens decide; the server reads none for the others).
 */
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CostHistoryEntry, Supplier } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { catalogCost } from "@octo/estimating-engine";
import { sortedSuppliers, supplierOf, suppliersOf } from "./suppliers";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Card, Divider, ListRow } from "@/ui/surfaces";

/** pick the main supplier of an item: active ones, «Новый поставщик», «Без поставщика» */
export function SupplierPicker({
  visible,
  onClose,
  onPick,
  onNew,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (s: Supplier | null) => void;
  onNew: () => void;
}) {
  const { db } = useStore();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const list = useMemo(
    () => sortedSuppliers(suppliersOf(db).filter((x) => x.active)).filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase())),
    [db, q],
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t("sup.pickTitle")}>
      <View style={{ gap: space[3] }}>
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("sup.search")} icon="search" />
        <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
          {list.map((s, i) => (
            <View key={s.id} testID={`sup-pick-${s.id}`}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={s.name}
                subtitle={[s.phone, s.taxBps !== undefined ? t("sup.taxShort", { pct: (s.taxBps / 100).toString() }) : ""].filter(Boolean).join(" · ") || undefined}
                onPress={() => onPick(s)}
              />
            </View>
          ))}
          {list.length === 0 ? <T v="body" tone="mut">{t("sup.empty")}</T> : null}
        </ScrollView>
        <View testID="sup-pick-new">
          <Button label={t("sup.new")} icon="plus" variant="secondary" full onPress={onNew} />
        </View>
        <View testID="sup-pick-none">
          <Button label={t("sup.none")} variant="ghost" full onPress={() => onPick(null)} />
        </View>
      </View>
    </Sheet>
  );
}

const SOURCE: Record<string, DictKey> = {
  manual: "sup.src.manual", initial: "sup.src.initial", import_file: "sup.src.import_file",
  ai_scan: "sup.src.ai_scan", shelf_tag: "sup.src.shelf_tag", module: "sup.src.module",
};

/** «История цен»: the cost with the supplier's tax, when, from whom; newest first */
export function CostHistory({ entries, showItem, testID }: { entries: CostHistoryEntry[]; showItem?: boolean; testID?: string }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  return (
    <Card>
      <View testID={testID}>
        <T v="heading">{t("sup.history")}</T>
      </View>
      {entries.length === 0 ? (
        <T v="caption" tone="mut">{t("sup.noHistory")}</T>
      ) : (
        entries.map((h, i) => {
          const item = showItem ? db.catalog.find((x) => x.id === h.itemId)?.name : undefined;
          const who = supplierOf(db, h.supplierId)?.name;
          // money only through the engine: the cost with the supplier's tax, as the item card shows it
          const cost = h.costCents === undefined ? "—" : money(catalogCost(h.costCents, h.vendorTaxBps ?? 0));
          return (
            <View key={h.id} style={{ gap: space[1] }} testID={`sup-hist-${i}`}>
              {i > 0 ? <Divider /> : null}
              <T v="body" tabular>{[day(h.at), cost, item].filter(Boolean).join(" · ")}</T>
              <T v="caption" tone="mut">
                {[who, h.vendorTaxBps !== undefined ? t("sup.taxShort", { pct: (h.vendorTaxBps / 100).toString() }) : "", t(SOURCE[h.source] ?? "sup.src.manual")].filter(Boolean).join(" · ")}
              </T>
            </View>
          );
        })
      )}
    </Card>
  );
}
