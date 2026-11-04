import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { CatalogKind } from "@/data/types";
import { useI18n } from "@/i18n";
import { itemPrice, kindLabel } from "@/features/estimatePickers";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { Card, Divider, Empty, ListRow, Screen } from "@/ui/surfaces";

const KINDS: (CatalogKind | "all")[] = ["all", "service", "labor", "material", "kit"];

/** Company catalog: services, labor, materials and kits used in estimates. */
export default function Catalog() {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CatalogKind | "all">("all");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const items = useMemo(
    () =>
      db.catalog
        .filter((x) => kind === "all" || x.kind === kind)
        .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.catalog, q, kind],
  );
  const canEdit = role !== "tech";
  return (
    <Screen
      title={t("cat.title")}
      back={back}
      help={t("cat.help")}
      hintKey="catalog"
      right={canEdit ? <Button label={t("cat.new")} icon="plus" size="sm" onPress={() => router.push(`/catalog/new${kind !== "all" ? `?kind=${kind}` : ""}`)} /> : undefined}
    >
      <TextField value={q} onChangeText={setQ} placeholder={t("ue.catalogSearch")} icon="search" />
      <ChoiceChips value={kind} onChange={setKind} items={KINDS.map((k) => ({ key: k, label: t(kindLabel(k)) }))} />
      {items.length === 0 ? (
        <Empty icon="note" title={t("cat.empty")} />
      ) : (
        <Card>
          {items.map((it, i) => (
            <View key={it.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={it.name}
                subtitle={`${t(kindLabel(it.kind))} · ${money(itemPrice(it, db.catalog))} / ${it.unit}${it.vendor ? ` · ${it.vendor}` : ""}${it.placeholder ? ` · ${t("cat.placeholder")}` : ""}`}
                onPress={canEdit ? () => router.push(`/catalog/${it.id}`) : undefined}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
