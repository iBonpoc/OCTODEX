import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, component } from "@octo/design-tokens";
import { catalogCost } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind, Supplier } from "@/data/types";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { countsFromCost, editClean, editOk, editPrice, priceLocked } from "@/features/catalogEdit";
import { CatalogPicker, kindLabel } from "@/features/estimatePickers";
import { attributesLine } from "@/features/catalogMatch";
import { Labeled, MoneyField, PctField, QtyField } from "@/features/fields";
import { Button, IconButton, ReadOnly, TextField, useReadOnly } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { usePersistentState } from "@/data/persist";
import { UNITS } from "@/features/estimate/LineRow";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { StatusNote } from "@/ui/statusNote";
import { Card, Divider, Empty, FieldGroup, ListRow, RowView, Screen } from "@/ui/surfaces";
import { canSeeSuppliers, historyOf, pickSupplier, supplierOf, supplierTaxAsk, type SupplierTaxAsk as SupplierTaxAskData } from "@/features/suppliers";
import { SupplierTaxAsk } from "@/features/SupplierTaxAsk";
import { useHeldSheet } from "@/ui/heldSheet";
import { CostHistory, SupplierPicker } from "@/features/SupplierParts";
import { canEditCatalog } from "@/features/access";

const KINDS: CatalogKind[] = ["service", "labor", "material", "kit"];
/** the id of the choice «Своя…» in the unit list (as on an estimate line) */
const OWN = "__own__";
/** the kind a new item starts with: the last one chosen on this device (spec 56 §3а.4) */
const LAST_KIND = "octo.catalog.lastKind.v1";

/**
 * Catalog item. Material: supplier price + supplier tax (per supplier: 0, 10%, 10.25%…) + your markup
 * = the price that goes into estimates ($10 + 10.25% = $11.03; +10% = $12.13).
 */
export default function CatalogItemScreen() {
  const { id, kind: kind0 } = useLocalSearchParams<{ id: string; kind?: CatalogKind }>();
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  /** «Сохранить» was pressed with something missing (the button is never pale, DS §11 п.3) */
  const [need, setNeed] = useState(false);
  const found = store.db.catalog.find((x) => x.id === id);
  const [it, setIt] = useState<CatalogItem>(
    () => found ?? { id: uid(), kind: kind0 && KINDS.includes(kind0) ? kind0 : "service", name: "", unit: "ea", priceCents: 0 },
  );
  const [pick, setPick] = useState(false);
  const [pickSup, setPickSup] = useState(false);
  /** #1835: a supplier with a tax picked for a cost typed without one — the question first, then the supplier */
  const [taxFor, setTaxFor] = useState<{ s: Supplier; ask: SupplierTaxAskData } | null>(null);
  const taxAsk = useHeldSheet(taxFor);
  const afterSupPick = useRef<(() => void) | null>(null);
  const set = (p: Partial<CatalogItem>) => setIt((x) => ({ ...x, ...p, placeholder: false }));
  // a new item starts with the kind chosen last on this device, unless the list was filtered by a kind (spec 56 §3а.4)
  const [lastKind, setLastKind, lastReady] = usePersistentState<CatalogKind | null>(LAST_KIND, null, { validate: (v) => v === null || KINDS.includes(v) });
  const kindTouched = useRef(false);
  useEffect(() => {
    if (found || kindTouched.current || !lastReady || !lastKind || (kind0 && KINDS.includes(kind0))) return;
    setIt((x) => ({ ...x, kind: lastKind }));
    // once, when the device's value has been read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastReady]);
  // «Своя…»: the unit is written by hand — chosen so, or not one of the list
  const knownUnit = (UNITS as readonly string[]).includes(it.unit);
  const [pickedOwn, setPickedOwn] = useState(false);
  const ownUnit = pickedOwn || !knownUnit;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/catalog"));
  // 19 §9: who does not get our costs (sales without view_costs) edits a material's price as it is — counting it from
  // a cost the phone does not have would overwrite the real price
  const noCosts = store.db.costsVisible === false;
  const isMat = countsFromCost(it, noCosts);
  // by the stored item: switching the kind on this screen does not unlock its price (the store keeps the kind too)
  const locked = priceLocked(found ?? it, noCosts, store.db.catalog);
  const outerRo = useReadOnly();
  const price = editPrice(it, store.db.catalog, noCosts);
  const ok = editOk(it, noCosts);
  // spec 36: who sees suppliers picks one (the server reads none for sales and the tech)
  const supPick = canSeeSuppliers(store.role) && !store.db.suppliersLegacy;
  const sup = supplierOf(store.db, it.supplierId);
  // spec 36: the item's newest history rows from the server, when opened (only who sees costs)
  const loadHistory = store.loadCostHistory;
  useEffect(() => {
    if (found && !noCosts && found.kind === "material") loadHistory({ itemId: found.id });
    // once per item: the store's functions are not stable across renders, the read would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id, noCosts]);

  const save = () => {
    const clean = editClean(it, store.db.catalog, noCosts);
    if (!found) setLastKind(clean.kind);
    toast.show(t("cat.saved", { name: clean.name }), store.saveCatalogItem(clean));
    back();
  };
  const remove = () => {
    toast.show(t("cat.removed", { name: it.name }), store.removeCatalogItem(it.id));
    back();
  };
  const comps = it.components ?? [];

  // the price list is the office's (#868; catalog_items_update — staff): the tech neither changes nor opens an item —
  // the list does not open it for him either (canEdit in catalog/index.tsx)
  if (!canEditCatalog(store.role))
    return (
      <Screen title={t("cat.edit")} back={back}>
        <Empty icon="alert" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );

  return (
    <Screen title={found ? t("cat.edit") : t("cat.new")} back={back}>
      <FieldGroup>
        {/* «Тип ⌄» — a value of the form, a row with a menu (spec 56 §3 row 4), not a tab bar; who may not change the price of
            a material counted from its cost may not change its kind either (the server refuses it, #1971) */}
        <ReadOnly value={locked || outerRo}>
          <SelectField<CatalogKind>
            testID="catalog-kind"
            label={t("cat.kindLabel")}
            value={it.kind}
            items={KINDS.map((k) => ({ key: k, label: t(kindLabel(k)) }))}
            onChange={(k) => {
              kindTouched.current = true;
              set({ kind: k });
            }}
          />
        </ReadOnly>
        {locked ? (
          <View testID="catalog-kind-locked">
            <T v="caption" tone="mut">{t("cat.kind.locked")}</T>
          </View>
        ) : null}
        {/* the name: its label over the field (spec 56 §3а.4), as the price and the cost below */}
        <View testID="catalog-name">
          <Labeled label={t("cat.name")}>
            <TextField type="title" value={it.name} onChangeText={(v) => set({ name: v })} placeholder={t("cat.name")} label={t("cat.name")} />
          </Labeled>
        </View>
        <SelectField<string>
          testID="catalog-unit"
          label={t("cat.unitLabel")}
          value={ownUnit ? OWN : it.unit}
          items={[...UNITS.map((u) => ({ key: u as string, label: u })), { key: OWN, label: t("est.row.unitOwn") }]}
          onChange={(u) => (u === OWN ? setPickedOwn(true) : (setPickedOwn(false), set({ unit: u })))}
        />
        {ownUnit ? <TextField type="unit" value={it.unit} onChangeText={(v) => set({ unit: v })} placeholder="ea" label={t("est.row.unitOwn")} testID="catalog-unit-own" /> : null}
        {/* properties a trade module set (docs/specs/33 П16): read here, changed in the module */}
        {it.attributes && Object.keys(it.attributes).length ? (
          <View testID="catalog-attributes">
            <T v="caption" tone="mut">{t("cat.attributes", { list: attributesLine(it.attributes) })}</T>
          </View>
        ) : null}
      </FieldGroup>

      {it.kind === "service" || it.kind === "labor" || (it.kind === "material" && noCosts) ? (
        <FieldGroup>
          <Labeled label={t("cat.price")}>
            <View testID="catalog-price">
              {/* #1807: counted by the server from a cost this person does not see — shown, not changed */}
              <ReadOnly value={locked || outerRo}>
                <MoneyField cents={it.priceCents} onChange={(c) => set({ priceCents: c })} />
              </ReadOnly>
            </View>
          </Labeled>
          {locked ? (
            <View testID="catalog-price-locked">
              <T v="caption" tone="mut">{t("price.fromCost.locked")}</T>
            </View>
          ) : null}
        </FieldGroup>
      ) : null}

      {isMat ? (
        <FieldGroup>
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
        </FieldGroup>
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

      {/* what is missing: a quiet line until «Сохранить» is pressed, then the warning at the button — one place, as on the other forms
          (design review of #1728: not a line and a toast) */}
      {!ok ? (
        need ? (
          <StatusNote tone="warn" testID="catalog-need">{t("cat.need")}</StatusNote>
        ) : (
          <T v="caption" tone="mut">
            {t("cat.need")}
          </T>
        )
      ) : null}
      <View testID="catalog-save">
        {/* always there to press (DS §11 п.3, #1728): an item without a name or a price says so */}
        <Button label={t("ue.save")} icon="check" full onPress={() => (ok ? save() : setNeed(true))} />
      </View>
      {found ? <Button label={t("cat.remove")} icon="trash" variant="ghost" full onPress={remove} /> : null}
      <SupplierPicker
        visible={pickSup}
        onClose={() => setPickSup(false)}
        onPick={(s) => {
          setPickSup(false);
          // the question when the cost may already have the supplier's tax in it (#1835); else picked at once
          const ask = s ? supplierTaxAsk(it, s) : null;
          // the question opens once the picker has left (review #1904 №4: never two sheets at once)
          if (s && ask) return void (afterSupPick.current = () => setTaxFor({ s, ask }));
          setIt((x) => ({ ...pickSupplier(x, s), placeholder: false }));
        }}
        onExited={() => {
          const next = afterSupPick.current;
          afterSupPick.current = null;
          next?.();
        }}
        onNew={() => {
          setPickSup(false);
          router.push("/suppliers/new");
        }}
      />
      <SupplierTaxAsk
        ask={taxAsk.value?.ask ?? null}
        supplier={taxAsk.value?.s ?? null}
        unit={it.unit}
        visible={taxAsk.visible}
        onExited={taxAsk.onExited}
        // closed without an answer: no supplier is attached (no default)
        onClose={() => setTaxFor(null)}
        onAnswer={(a) => {
          const f = taxFor;
          setTaxFor(null);
          if (f) setIt((x) => ({ ...pickSupplier(x, f.s, a, f.ask), placeholder: false }));
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
