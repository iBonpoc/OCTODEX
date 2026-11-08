import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, component } from "@octo/design-tokens";
import { catalogCost } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind } from "@/data/types";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { countsFromCost, editClean, editOk, editPrice } from "@/features/catalogEdit";
import { CatalogPicker, kindLabel } from "@/features/estimatePickers";
import { attributesLine } from "@/features/catalogMatch";
import { Labeled, MoneyField, PctField, QtyField } from "@/features/fields";
import { Button, ChoiceChips, IconButton, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView, Screen } from "@/ui/surfaces";
import { canSeeSuppliers, historyOf, pickSupplier, supplierOf } from "@/features/suppliers";
import { CostHistory, SupplierPicker } from "@/features/SupplierParts";

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
  const [pickSup, setPickSup] = useState(false);
  const set = (p: Partial<CatalogItem>) => setIt((x) => ({ ...x, ...p, placeholder: false }));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/catalog"));
  // 19 §9: who does not get our costs (sales without view_costs) edits a material's price as it is — counting it from
  // a cost the phone does not have would overwrite the real price
  const noCosts = store.db.costsVisible === false;
  const isMat = countsFromCost(it, noCosts);
  const price = editPrice(it, store.db.catalog, noCosts);
  const ok = editOk(it, noCosts);
  // spec 36: who sees suppliers picks one (the server reads none for sales and the tech)
  const supPick = canSeeSuppliers(store.role) && !store.db.suppliersLegacy;
  const sup = supplierOf(store.db, it.supplierId);

  const save = () => {
    const clean = editClean(it, store.db.catalog, noCosts);
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
        <View testID="catalog-name">
          <TextField type="title" value={it.name} onChangeText={(v) => set({ name: v })} placeholder={t("cat.name")} />
        </View>
        <TextField type="unit" value={it.unit} onChangeText={(v) => set({ unit: v })} placeholder={t("cat.unit")} />
        {found?.placeholder ? <StatusChip status="warn" label={t("cat.placeholder")} /> : null}
        {/* properties a trade module set (docs/specs/33 П16): read here, changed in the module */}
        {it.attributes && Object.keys(it.attributes).length ? (
          <View testID="catalog-attributes">
            <T v="caption" tone="mut">{t("cat.attributes", { list: attributesLine(it.attributes) })}</T>
          </View>
        ) : null}
      </Card>

      {it.kind === "service" || it.kind === "labor" || (it.kind === "material" && noCosts) ? (
        <Card>
          <Labeled label={t("cat.price")}>
            <View testID="catalog-price">
              <MoneyField cents={it.priceCents} onChange={(c) => set({ priceCents: c })} />
            </View>
          </Labeled>
        </Card>
      ) : null}

      {isMat ? (
        <Card>
          {/* spec 36 (S0c): the main supplier from the company's list — owner, admin, office; others keep the old text */}
          {supPick ? (
            <View testID="catalog-supplier">
              <ListRow
                title={sup ? (sup.active ? sup.name : t("sup.inArchive", { name: sup.name })) : t("sup.pick")}
                subtitle={sup ? t("sup.pick") : it.vendor?.trim() ? t("sup.oldVendor", { name: it.vendor.trim() }) : t("sup.noneSet")}
                onPress={() => setPickSup(true)}
              />
            </View>
          ) : it.supplierId ? (
            // linked by the office: the name follows the supplier (a typed one would disagree with it — review SUP1 №3)
            <View testID="catalog-vendor-locked">
              <T v="caption" tone="mut">{t("sup.vendorLocked", { name: it.vendor ?? "—" })}</T>
            </View>
          ) : (
            <TextField type="company" value={it.vendor ?? ""} onChangeText={(v) => set({ vendor: v })} placeholder={t("cat.vendor")} />
          )}
          {supPick && sup ? (
            <View testID="catalog-sku">
              <TextField type="identifier" value={it.supplierSku ?? ""} onChangeText={(v) => set({ supplierSku: v })} placeholder={t("sup.sku")} />
            </View>
          ) : null}
          <RowView style={{ alignItems: "flex-end" }}>
            <Labeled label={t("cat.cost")}>
              <View testID="catalog-cost">
                <MoneyField cents={it.costCents ?? 0} onChange={(c) => set({ costCents: c })} />
              </View>
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

      {isMat && found && !noCosts ? <CostHistory entries={historyOf(store.db, { itemId: it.id }, 5)} testID="catalog-history" /> : null}

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
      <View testID="catalog-save">
        <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
      </View>
      {found ? <Button label={t("cat.remove")} icon="trash" variant="ghost" full onPress={remove} /> : null}
      <SupplierPicker
        visible={pickSup}
        onClose={() => setPickSup(false)}
        onPick={(s) => {
          setIt((x) => ({ ...pickSupplier(x, s), placeholder: false }));
          setPickSup(false);
        }}
        onNew={() => {
          setPickSup(false);
          router.push("/suppliers/new");
        }}
      />
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
