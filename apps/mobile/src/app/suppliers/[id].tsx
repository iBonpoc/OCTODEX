/**
 * A supplier (docs/specs/36 §7): contact, account, terms, the purchase tax; its price-list items and the history of
 * their costs; archive with «Отменить» (rule 5). Owner, admin, office only (nav/roles.ts). «new» (or any id
 * not on the phone) — a new supplier.
 */
import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { catalogCost } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { PaymentTerms, Supplier } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { emailBad, historyOf, itemsOfSupplier, itemsWithOtherTax, PAYMENT_TERMS } from "@/features/suppliers";
import { mailtoHref, telHref } from "@/features/contactLinks";
import { Labeled, PctField } from "@/features/fields";
import { CostHistory } from "@/features/SupplierParts";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, RowView, Screen } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";

type TermsKey = PaymentTerms | "none";

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const found = (store.db.suppliers ?? []).find((x) => x.id === id);
  const [s, setS] = useState<Supplier>(() => found ?? { id: uid(), name: "", active: true });
  const [ask, setAsk] = useState<{ n: number; pct: string } | null>(null);
  const set = (p: Partial<Supplier>) => setS((x) => ({ ...x, ...p }));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/suppliers"));
  const ok = s.name.trim() !== "" && !emailBad(s.email);
  const costs = store.db.costsVisible !== false;
  const items = found ? itemsOfSupplier(store.db, found.id) : [];

  const save = () => {
    toast.show(t("sup.saved", { name: s.name.trim() }), store.saveSupplier(s));
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
    toast.show(t("sup.applied", { n }), store.applySupplierTax(s.id));
    setAsk(null);
    back();
  };
  const archive = (active: boolean) => {
    toast.show(t(active ? "sup.restoredToast" : "sup.archivedToast", { name: s.name }), store.setSupplierActive(s.id, active));
    back();
  };
  const tel = telHref(s.phone);
  const mail = mailtoHref(s.email);
  const terms: TermsKey = s.terms ?? "none";

  return (
    <Screen title={found ? t("sup.edit") : t("sup.new")} back={back}>
      <Card>
        <View testID="sup-name">
          <TextField type="company" value={s.name} onChangeText={(v) => set({ name: v })} placeholder={t("sup.name")} label={t("sup.nameLabel")} />
        </View>
        <TextField type="name" value={s.contactName ?? ""} onChangeText={(v) => set({ contactName: v })} placeholder={t("sup.contact")} />
        <View testID="sup-phone">
          <TextField type="phone" value={s.phone ?? ""} onChangeText={(v) => set({ phone: v })} placeholder={t("sup.phone")} />
        </View>
        <TextField type="email" value={s.email ?? ""} onChangeText={(v) => set({ email: v })} placeholder={t("sup.email")} />
        {emailBad(s.email) ? <T v="caption" tone="bad">{t("sup.emailBad")}</T> : null}
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
      </Card>

      <Card>
        <T v="caption" tone="mut">{t("sup.terms")}</T>
        <ChoiceChips<TermsKey>
          value={terms}
          onChange={(k) => set({ terms: k === "none" ? undefined : k })}
          items={[{ key: "none", label: t("sup.terms.none") }, ...PAYMENT_TERMS.map((k) => ({ key: k as TermsKey, label: t(`sup.terms.${k}` as DictKey) }))]}
        />
        {s.terms === "custom" ? (
          <TextField type="text" value={s.termsNote ?? ""} onChangeText={(v) => set({ termsNote: v })} placeholder={t("sup.termsNote")} />
        ) : null}
        <Labeled label={t("sup.tax")}>
          <View testID="sup-tax">
            <PctField bps={s.taxBps ?? 0} onChange={(b) => set({ taxBps: Math.min(b, 10000) })} />
          </View>
        </Labeled>
        <T v="caption" tone="mut">{t("sup.taxHint")}</T>
        <TextField type="note" value={s.notes ?? ""} onChangeText={(v) => set({ notes: v })} placeholder={t("sup.notes")} multiline />
      </Card>

      {!ok ? <T v="caption" tone="mut">{t("sup.need")}</T> : null}
      <View testID="sup-save">
        <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
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
