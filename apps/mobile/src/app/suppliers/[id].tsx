/**
 * A supplier (docs/specs/36 §7): contact, account, terms, the purchase tax; its price-list items and the history of
 * their costs; archive with «Отменить» (rule 5). Owner, admin, office only (nav/roles.ts). «new» (or any id
 * not on the phone) — a new supplier.
 */
import { useRequiredForm } from "@/ui/requiredForm";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { catalogCost } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { PaymentTerms, Supplier } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { applyTaxUndo, emailBad, historyOf, itemsOfSupplier, itemsWithOtherTax, PAYMENT_TERMS } from "@/features/suppliers";
import { mailtoHref, telHref } from "@/features/contactLinks";
import { Labeled } from "@/features/fields";
import { parsePctToBps } from "@octo/estimating-engine";
import { CostHistory } from "@/features/SupplierParts";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Empty, FieldGroup, RowView, Screen } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";
import { NotFound } from "@/ui/emptyStates";
import { type GuardedUndo } from "@/data/undo";

type TermsKey = PaymentTerms | "none";

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const found = (store.db.suppliers ?? []).find((x) => x.id === id);
  const [s, setS] = useState<Supplier>(() => found ?? { id: uid(), name: "", active: true });
  const [ask, setAsk] = useState<{ n: number; pct: string } | null>(null);
  const undoRef = useRef<GuardedUndo | null>(null);
  const [taxText, setTaxText] = useState(() => (found?.taxBps === undefined ? "" : String(found.taxBps / 100)));
  const set = (p: Partial<Supplier>) => setS((x) => ({ ...x, ...p }));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/suppliers"));
  const form = useRequiredForm();
  const submit = () =>
    form.submit(
      [
        ...(s.name.trim() !== "" ? [] : [{ id: "name", text: t("form.req.supName") }]),
        ...(emailBad(s.email) ? [{ id: "email", text: t("sup.emailBad") }] : []),
      ],
      save,
    );
  const costs = store.db.costsVisible !== false;
  const items = found ? itemsOfSupplier(store.db, found.id) : [];
  // spec 36: the newest history rows of this supplier from the server, when opened (director's check of #459 Н4)
  const loadHistory = store.loadCostHistory;
  useEffect(() => {
    if (found && costs) loadHistory({ supplierId: found.id });
    // once per supplier: the store's functions are not stable across renders, the read would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id, costs]);

  const save = () => {
    const undoSave = store.saveSupplier(s);
    undoRef.current = undoSave;
    toast.show(t("sup.saved", { name: s.name.trim() }), undoSave);
    // the tax changed and some of its items count with another one: ask before changing their prices
    const other = costs ? itemsWithOtherTax(store.db, { ...s, taxBps: s.taxBps }) : [];
    if (found && s.taxBps !== undefined && s.taxBps !== found.taxBps && other.length) {
      setAsk({ n: other.length, pct: (s.taxBps / 100).toString() });
      return;
    }
    back();
  };
  const apply = () => {
    const n = ask?.n ?? 0;
    const undoApply = store.applySupplierTax(s.id);
    const undoSave = undoRef.current;
    // one «Отменить» for both: the items' tax and the supplier's own (review SUP1 №6 — the second toast replaces the first);
    // the supplier's save already sent — only «Применить» (applyTaxUndo)
    toast.show(t("sup.applied", { n }), applyTaxUndo(store.undoTogether, undoSave, undoApply));
    setAsk(null);
    back();
  };
  const archive = (active: boolean) => {
    toast.show(t(active ? "sup.restoredToast" : "sup.archivedToast", { name: s.name }), store.setSupplierActive(s.id, active));
    back();
  };
  // an address of a supplier that is not on the phone (not loaded yet, another company's, archived elsewhere) is not a
  // new one: a form with a fresh id would make a double (review SUP1 №4)
  if (!found && id !== "new") {
    return (
      <Screen title={t("sup.edit")} back={back}>
        <NotFound testID="sup-not-found" title={t("sup.notFound")} listLabel={t("empty.toSuppliers")} onList={() => router.replace("/suppliers")} />
      </Screen>
    );
  }
  const tel = telHref(s.phone);
  const mail = mailtoHref(s.email);
  const terms: TermsKey = s.terms ?? "none";

  return (
    <Screen title={found ? t("sup.edit") : t("sup.new")} back={back}>
      <FieldGroup>
        <View testID="sup-name">
          <TextField type="company" value={s.name} onChangeText={(v) => set({ name: v })} placeholder={t("sup.name")} label={t("sup.nameLabel")} field={form.field("name")} />
        </View>
        <TextField type="name" value={s.contactName ?? ""} onChangeText={(v) => set({ contactName: v })} placeholder={t("sup.contact")} />
        <View testID="sup-phone">
          <TextField type="phone" value={s.phone ?? ""} onChangeText={(v) => set({ phone: v })} placeholder={t("sup.phone")} />
        </View>
        <TextField type="email" value={s.email ?? ""} onChangeText={(v) => set({ email: v })} placeholder={t("sup.email")} field={form.field("email", (v) => (emailBad(v) ? t("sup.emailBad") : undefined))} />
        <View testID="sup-account">
          <TextField type="identifier" value={s.accountNumber ?? ""} onChangeText={(v) => set({ accountNumber: v })} placeholder={t("sup.account")} />
        </View>
        <TextField type="street" value={s.address ?? ""} onChangeText={(v) => set({ address: v })} placeholder={t("sup.address")} />
        {tel || mail ? (
          <RowView>
            {tel ? <Button label={t("sup.call")} icon="phone" variant="secondary" size="sm" onPress={() => void Linking.openURL(tel).catch(() => undefined)} /> : null}
            {mail ? <Button label={t("sup.write")} icon="mail" variant="secondary" size="sm" onPress={() => void Linking.openURL(mail).catch(() => undefined)} /> : null}
          </RowView>
        ) : null}
      </FieldGroup>

      <FieldGroup>
        <ChoiceChips<TermsKey>
          label={t("sup.terms")}
          testID="supplier-terms"
          value={terms}
          onChange={(k) => set({ terms: k === "none" ? undefined : k })}
          items={[{ key: "none", label: t("sup.terms.none") }, ...PAYMENT_TERMS.map((k) => ({ key: k as TermsKey, label: t(`sup.terms.${k}` as DictKey) }))]}
        />
        {s.terms === "custom" ? (
          <TextField type="text" value={s.termsNote ?? ""} onChangeText={(v) => set({ termsNote: v })} placeholder={t("sup.termsNote")} />
        ) : null}
        <Labeled label={t("sup.tax")}>
          <View testID="sup-tax">
            {/* empty = not set (not 0%): its own text, the engine parses it */}
            <TextField
              type="percent"
              value={taxText}
              onChangeText={(v) => {
                setTaxText(v);
                const b = v.trim() === "" ? null : parsePctToBps(v);
                if (v.trim() === "") set({ taxBps: undefined });
                else if (b !== null) set({ taxBps: Math.min(b, 10000) });
              }}
              placeholder={t("sup.taxNone")}
            />
          </View>
        </Labeled>
        {/* not set ≠ 0%: a supplier without a tax leaves an item's own when picked (spec 36 §1г) */}
        {s.taxBps !== undefined ? (
          <View testID="sup-tax-clear">
            <Button label={t("sup.taxClear")} variant="ghost" size="sm" onPress={() => { set({ taxBps: undefined }); setTaxText(""); }} />
          </View>
        ) : (
          <T v="caption" tone="mut">{t("sup.taxNotSet")}</T>
        )}
        <T v="caption" tone="mut">{t("sup.taxHint")}</T>
        <TextField type="note" value={s.notes ?? ""} onChangeText={(v) => set({ notes: v })} placeholder={t("sup.notes")} multiline />
      </FieldGroup>

      <View testID="sup-save">
        <Button label={t("ue.save")} icon="check" full testID="supplier-save" onPress={submit} />
      </View>

      {found ? (
        <>
          <T v="heading">{t("sup.itemsTitle")}</T>
          {items.length === 0 ? (
            <Empty icon="note" title={t("sup.noItems")} />
          ) : (
            <CardList>
              {items.map((it) => (
                <ListCard
                  key={it.id}
                  density="compact"
                  title={it.name}
                  lead={{ kind: "icon", icon: "box" }}
                  // our cost only for who sees costs (19 §9); the SKU is not money
                  value={costs && it.costCents !== undefined ? `${money(catalogCost(it.costCents, it.vendorTaxBps ?? 0))} / ${it.unit}` : undefined}
                  facts={{ ref: it.supplierSku }}
                  onPress={() => router.push(`/catalog/${it.id}`)}
                />
              ))}
            </CardList>
          )}
          {costs ? <CostHistory entries={historyOf(store.db, { supplierId: found.id }, 10)} showItem testID="sup-history" /> : null}
          <View testID="sup-archive">
            {found.active ? (
              <Button label={t("sup.archive")} icon="trash" variant="ghost" full onPress={() => archive(false)} />
            ) : (
              <Button label={t("sup.restore")} icon="undo" variant="ghost" full onPress={() => archive(true)} />
            )}
          </View>
        </>
      ) : null}

      <Sheet visible={!!ask} onClose={() => { setAsk(null); back(); }} title={t("sup.applyTitle", { pct: ask?.pct ?? "", n: ask?.n ?? 0 })}>
        <View style={{ gap: space[3] }}>
          <T v="body">{t("sup.applyHint")}</T>
          <View testID="sup-apply">
            <Button label={t("sup.apply")} icon="check" full onPress={apply} />
          </View>
          <Button label={t("sup.notNow")} variant="ghost" full onPress={() => { setAsk(null); back(); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
