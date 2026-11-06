import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { space, component } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { catalogUnitPrice, kitPrice } from "./estimateDoc";
import { ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";
import { canServe } from "@/features/clients";

const KINDS: (CatalogKind | "all")[] = ["all", "service", "labor", "material", "kit"];
export const kindLabel = (k: CatalogKind | "all"): DictKey => (k === "all" ? "cat.all" : (`cat.kind.${k}` as DictKey));

export function itemPrice(it: CatalogItem, catalog: CatalogItem[]) {
  return it.kind === "kit" ? kitPrice(it, catalog) : catalogUnitPrice(it);
}

/** Search the company catalog; a kit adds all its lines. */
export function CatalogPicker({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (it: CatalogItem) => void; exclude?: CatalogKind[] }) {
  const { db } = useStore();
  const { t, money } = useI18n();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CatalogKind | "all">("all");
  const items = useMemo(
    () =>
      db.catalog
        .filter((x) => !exclude?.includes(x.kind))
        .filter((x) => kind === "all" || x.kind === kind)
        .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.catalog, q, kind, exclude],
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t("ue.fromCatalog")}>
      <View style={{ gap: space[3] }}>
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("ue.catalogSearch")} icon="search" />
        <ChoiceChips value={kind} onChange={setKind} items={KINDS.filter((k) => k === "all" || !exclude?.includes(k)).map((k) => ({ key: k, label: t(kindLabel(k)) }))} />
        <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <T v="body" tone="mut">
              {t("cat.empty")}
            </T>
          ) : (
            items.map((it, i) => (
              <View key={it.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={it.name}
                  subtitle={`${t(kindLabel(it.kind))} · ${money(itemPrice(it, db.catalog))} / ${it.unit}${it.placeholder ? ` · ${t("cat.placeholder")}` : ""}`}
                  onPress={() => onPick(it)}
                />
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Sheet>
  );
}

/** Pick a client and one of their properties. */
export function ClientPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (customerId: string, propertyId: string) => void }) {
  const { db } = useStore();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const rows = db.properties
    .map((p) => ({ p, c: db.customers.find((c) => c.id === p.customerId) }))
    .filter((r) => r.c && canServe(db, r.c.id) && (!q.trim() || `${r.c.name} ${r.p.address}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Sheet visible={visible} onClose={onClose} title={t("est.for")}>
      <View style={{ gap: space[3] }}>
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("clients.title")} icon="search" />
        <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? <StatusChip status="neutral" label={t("clients.empty")} /> : null}
          {rows.map(({ p, c }, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow title={c!.name} subtitle={`${p.address}, ${p.city}`} onPress={() => onPick(c!.id, p.id)} />
            </View>
          ))}
        </ScrollView>
      </View>
    </Sheet>
  );
}
