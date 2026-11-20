/**
 * «Цена» — one catalog item's price in a sheet (spec 53 §6.3, wave 53-1): the card, then «Сохранить» — two taps.
 * A material whose cost this person sees: the cost and the markup, the client price counted live by the engine; labor,
 * a service and who does not see costs: the client price. Saved by the store's own item save (by field, wave 53-0),
 * with «Отменить». The rules are pure in features/quickPrice.ts. A kit is never priced here (the full editor).
 */
import { seeCosts } from "./access";
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CatalogItem } from "@/data/types";
import { useI18n } from "@/i18n";
import { formatBps } from "@/ui/numberInput";
import { Button, ReadOnly, useReadOnly } from "@/ui/controls";
import { NumberField } from "@/ui/numberField";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { StatusNote } from "@/ui/statusNote";
import { priceLocked } from "./catalogEdit";
import { quickAsksCost, quickChanged, quickNeed, quickNoMarkup, quickPack, quickPriceItem, type QuickPriceInput } from "./quickPrice";

/** a rate as the US writes it (rule 7: numbers en-US in every language) */
const pctText = (bps: number) => `${formatBps(bps)}%`;

/**
 * `item` — the item while the sheet is open and the last one while it goes out (the owner holds it: `useHeldSheet`, DS Б1
 * #1163); `visible` — open; `onExited` — it has left. The owner keys it by the opening, so each opening starts fresh.
 */
export function QuickPriceSheet({ item, visible, onClose, onExited }: { item: CatalogItem | null; visible: boolean; onClose: () => void; onExited: () => void }) {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const [input, setInput] = useState<QuickPriceInput>({});
  /** «Сохранить» was pressed with something missing: the hint under the field (the button is never pale, DS §11 п.3) */
  const [need, setNeed] = useState(false);
  const outerRo = useReadOnly();
  if (!item) return null;

  const noCosts = !seeCosts(store.db, store.role, store.mode);
  const asksCost = quickAsksCost(item, noCosts);
  const locked = priceLocked(item, noCosts, store.db.catalog);
  const next = quickPriceItem(item, input, store.db.catalog, noCosts);
  const changed = quickChanged(item, input, noCosts, store.db.catalog);
  const missing = quickNeed(item, input, noCosts);
  const pack = asksCost ? quickPack(item) : null;
  const unit = item.unit;
  const set = (p: QuickPriceInput) => {
    setNeed(false);
    setInput((x) => ({ ...x, ...p }));
  };
  const save = () => {
    if (missing) return setNeed(true);
    onClose();
    if (!changed) return;
    const undo = store.saveCatalogItem(next);
    toast.show(store.online ? t("price.quick.saved") : t("offline.queued"), undo);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={t("price.quick.title")}
      dirty={changed}
      onSave={missing ? undefined : save}
      footer={
        <View style={{ gap: space[1] }}>
          <View testID="qp-save">
            <Button label={t("price.quick.save")} icon="check" full onPress={save} />
          </View>
          {/* the full editor; once something is typed it is saved here first (no way to lose it unasked) */}
          {changed ? null : (
            <View testID="qp-open">
              <Button
                label={t("price.quick.open")}
                variant="ghost"
                full
                onPress={() => {
                  onClose();
                  router.push(`/catalog/${item.id}`);
                }}
              />
            </View>
          )}
        </View>
      }
    >
      <View testID="qp-sheet" style={{ gap: space[3] }}>
        {/* the item's whole name: its properties are what tells one price from the next (design review 53-1) */}
        <View testID="qp-name">
          <T v="heading">{item.name}</T>
        </View>
        {asksCost ? (
          <>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <View style={{ flex: 3 }} testID="qp-cost">
                <NumberField kind="money" label={t("price.quick.cost", { unit })} unitWord={t("est.row.dollars")} cents={input.costCents ?? item.costCents ?? 0} onChange={(c) => set({ costCents: c })} />
              </View>
              <View style={{ flex: 2 }} testID="qp-markup">
                <NumberField kind="percent" label={t("price.quick.markup")} bps={input.markupBps ?? item.markupBps ?? 0} onChange={(b) => set({ markupBps: b })} />
              </View>
            </View>
            {pack ? (
              <View testID="qp-pack">
                <T v="caption" tone="mut">
                  {pack.n ? t("price.quick.packN", { buy: pack.buy, n: pack.n, unit }) : t("price.quick.pack", { buy: pack.buy, unit })}
                </T>
              </View>
            ) : null}
            {need && missing === "cost" ? <StatusNote tone="warn" testID="qp-need">{t("price.quick.needCost")}</StatusNote> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }} testID="qp-client">
              <T v="body" tone="mut">
                {t("price.quick.client")}
                {item.vendorTaxBps ? ` · ${t("price.quick.withTax", { pct: pctText(item.vendorTaxBps) })}` : ""}
              </T>
              <T v="body" w="semibold">{`${money(next.priceCents)} / ${unit}`}</T>
            </View>
            {/* a hint, not a problem (design review 53-1): no status colour */}
            {quickNoMarkup(item, input, noCosts) ? (
              <View testID="qp-nomarkup">
                <T v="caption" tone="mut">{t("price.quick.noMarkup")}</T>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View testID="qp-price">
              {/* #1807: counted by the server from a cost this person does not see — shown, not changed */}
              <ReadOnly value={locked || outerRo}>
                <NumberField kind="money" label={t("price.quick.price", { unit })} unitWord={t("est.row.dollars")} cents={input.priceCents ?? item.priceCents} onChange={(c) => set({ priceCents: c })} />
              </ReadOnly>
            </View>
            {locked ? (
              <View testID="qp-price-locked">
                <T v="caption" tone="mut">{t("price.fromCost.locked")}</T>
              </View>
            ) : null}
            {need && missing === "price" ? <StatusNote tone="warn" testID="qp-need">{t("price.quick.needPrice")}</StatusNote> : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
