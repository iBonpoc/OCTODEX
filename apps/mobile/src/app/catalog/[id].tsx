import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, component } from "@octo/design-tokens";
import { catalogCost, catalogPrice } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind } from "@/data/types";
import { useI18n } from "@/i18n";
import { uid, kitPrice } from "@/features/estimateDoc";
import { CatalogPicker, kindLabel } from "@/features/estimatePickers";
import { Labeled, MoneyField, PctField, QtyField } from "@/features/fields";
import { Button, ChoiceChips, IconButton, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, RowView, Screen } from "@/ui/surfaces";

const KINDS: CatalogKind[] = ["service", "labor", "material", "kit"];

/**
 * Catalog item. Material: supplier price + supplier tax (per supplier: 0, 10%, 10.25%…) + your markup
 * = the price that goes into estimates ($10 + 10.25% = $11.03; +10% = $12.13).
 */
export default function CatalogItemScreen() {
  const { id, kind: kind0 } = useLocalSearchParams<{ id: string; kind?: CatalogKind }>();
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const found = store.db.catalog.find((x) => x.id === id);
  const [it, setIt] = useState<CatalogItem>(
    () => found ?? { id: uid(), kind: kind0 && KINDS.includes(kind0) ? kind0 : "service", name: "", unit: "ea", priceCents: 0 },
  );
  const [pick, setPick] = useState(false);
  const set = (p: Partial<CatalogItem>) => setIt((x) => ({ ...x, ...p, placeholder: false }));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/catalog"));
  const isMat = it.kind === "material";
  const price = isMat ? catalogPrice(it.costCents ?? 0, it.vendorTaxBps ?? 0, it.markupBps ?? 0) : it.kind === "kit" ? kitPrice(it, store.db.catalog) : it.priceCents;
  const ok = it.name.trim().length > 0 && (it.kind === "kit" ? (it.components ?? []).length > 0 : isMat ? (it.costCents ?? 0) > 0 : it.priceCents >= 0);

  const save = () => {
    const clean: CatalogItem = {
      ...it,
      name: it.name.trim(),
      unit: it.unit.trim() || "ea",
      priceCents: isMat ? price : it.kind === "kit" ? 0 : it.priceCents,
      costCents: isMat ? it.costCents : it.kind === "kit" ? undefined : it.costCents,
    };
    toast.show(t("cat.saved", { name: clean.name }), store.saveCatalogItem(clean));
    back();
  };
  const remove = () => {
    toast.show(t("cat.removed", { name: it.name }), store.removeCatalogItem(it.id));
    back();
  };
  const comps = it.components ?? [];

  return (
    <Screen title={found ? t("cat.edit") : t("cat.new")} back={back}>
      <Card>
        <ChoiceChips value={it.kind} onChange={(k) => set({ kind: k })} items={KINDS.map((k) => ({ key: k, label: t(kindLabel(k)) }))} />
        <TextField value={it.name} onChangeText={(v) => set({ name: v })} placeholder={t("cat.name")} />
        <TextField value={it.unit} onChangeText={(v) => set({ unit: v })} placeholder={t("cat.unit")} />
        {found?.placeholder ? <StatusChip status="warn" label={t("cat.placeholder")} /> : null}
      </Card>

      {it.kind === "service" || it.kind === "labor" ? (
        <Card>
          <Labeled label={t("cat.price")}>
            <MoneyField cents={it.priceCents} onChange={(c) => set({ priceCents: c })} />
          </Labeled>
        </Card>
      ) : null}

      {isMat ? (
        <Card>
          <TextField value={it.vendor ?? ""} onChangeText={(v) => set({ vendor: v })} placeholder={t("cat.vendor")} />
          <RowView style={{ alignItems: "flex-end" }}>
            <Labeled label={t("cat.cost")}>
              <MoneyField cents={it.costCents ?? 0} onChange={(c) => set({ costCents: c })} />
            </Labeled>
            <Labeled label={t("cat.vendorTax")}>
              <PctField bps={it.vendorTaxBps ?? 0} onChange={(b) => set({ vendorTaxBps: Math.min(b, 10000) })} />
            </Labeled>
            <Labeled label={t("cat.markup")}>
              <PctField bps={it.markupBps ?? 0} onChange={(b) => set({ markupBps: b })} />
            </Labeled>
          </RowView>
          <T v="caption" tone="mut">
            {t("cat.costWithTax", { amount: money(catalogCost(it.costCents ?? 0, it.vendorTaxBps ?? 0)) })}
          </T>
          <T v="heading" tabular>
            {t("cat.clientPrice", { amount: money(price) })}
          </T>
        </Card>
      ) : null}

      {it.kind === "kit" ? (
        <Card>
          <T v="heading">{t("cat.components")}</T>
          {comps.map((c, i) => {
            const sub = store.db.catalog.find((x) => x.id === c.itemId);
            return (
              <View key={`${c.itemId}-${i}`} style={{ gap: space[2] }}>
                {i > 0 ? <Divider /> : null}
                <RowView>
                  <T v="body" style={{ flex: 1 }} numberOfLines={2}>
                    {sub?.name ?? "—"}
                  </T>
                  <View style={{ width: component.qtyFieldW }}>
                    <QtyField qty={c.qty} onChange={(q) => set({ components: comps.map((x, j) => (j === i ? { ...x, qty: q } : x)) })} />
                  </View>
                  <IconButton icon="trash" label={t("ue.removeLine")} onPress={() => set({ components: comps.filter((_, j) => j !== i) })} />
                </RowView>
              </View>
            );
          })}
          <Button label={t("cat.addComponent")} icon="plus" variant="ghost" size="sm" onPress={() => setPick(true)} />
          <T v="heading" tabular>
            {t("cat.clientPrice", { amount: money(price) })}
          </T>
        </Card>
      ) : null}

      {!ok ? (
        <T v="caption" tone="mut">
          {t("cat.need")}
        </T>
      ) : null}
      <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
      {found ? <Button label={t("cat.remove")} icon="trash" variant="ghost" full onPress={remove} /> : null}
      <CatalogPicker
        visible={pick}
        exclude={["kit"]}
        onClose={() => setPick(false)}
        onPick={(x) => {
          set({ components: [...comps, { itemId: x.id, qty: "1" }] });
          setPick(false);
        }}
      />
    </Screen>
  );
}
