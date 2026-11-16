/**
 * «Цена» — one catalog item's price in a sheet (spec 53 §6.3, wave 53-1): the card, then «Сохранить» — two taps.
 * A material whose cost this person sees: the cost and the markup, the client price counted live by the engine; labor,
 * a service and who does not see costs: the client price. Saved by the store's own item save (by field, wave 53-0),
 * with «Отменить». The rules are pure in features/quickPrice.ts. A kit is never priced here (the full editor).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CatalogItem } from "@/data/types";
import { useI18n } from "@/i18n";
import { Labeled, MoneyField, PctField } from "@/features/fields";
import { Button } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { StatusNote } from "@/ui/statusNote";
import { quickAsksCost, quickChanged, quickNeed, quickNoMarkup, quickPack, quickPriceItem, type QuickPriceInput } from "./quickPrice";

const pctText = (bps: number) => `${bps / 100}%`;

export function QuickPriceSheet({ item, onClose }: { item: CatalogItem | null; onClose: () => void }) {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const [input, setInput] = useState<QuickPriceInput>({});
  /** «Сохранить» was pressed with something missing: the hint under the field (the button is never pale, DS §11 п.3) */
  const [need, setNeed] = useState(false);
  useEffect(() => {
    setInput({});
    setNeed(false);
  }, [item?.id]);
  if (!item) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const noCosts = store.db.costsVisible === false;
  const asksCost = quickAsksCost(item, noCosts);
  const next = quickPriceItem(item, input, store.db.catalog, noCosts);
  const changed = quickChanged(item, input, noCosts);
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
      visible
      onClose={onClose}
      title={item.name}
      dirty={changed}
      onSave={missing ? undefined : save}
      footer={
        <View testID="qp-save">
          <Button label={t("ue.save")} icon="check" full onPress={save} />
        </View>
      }
    >
      <View testID="qp-sheet" style={{ gap: space[3] }}>
        {item.placeholder ? <StatusNote tone="warn" testID="qp-test">{t("price.quick.test")}</StatusNote> : null}
        {asksCost ? (
          <>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <Labeled label={t("price.quick.cost", { unit })} flex={3}>
                <View testID="qp-cost">
                  <MoneyField cents={input.costCents ?? item.costCents ?? 0} onChange={(c) => set({ costCents: c })} />
                </View>
              </Labeled>
              <Labeled label={t("price.quick.markup")} flex={2}>
                <View testID="qp-markup">
                  <PctField bps={input.markupBps ?? item.markupBps ?? 0} onChange={(b) => set({ markupBps: b })} />
                </View>
              </Labeled>
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
            {quickNoMarkup(item, input, noCosts) ? <StatusNote tone="warn" testID="qp-nomarkup">{t("price.quick.noMarkup")}</StatusNote> : null}
          </>
        ) : (
          <>
            <Labeled label={t("price.quick.price", { unit })}>
              <View testID="qp-price">
                <MoneyField cents={input.priceCents ?? item.priceCents} onChange={(c) => set({ priceCents: c })} />
              </View>
            </Labeled>
            {need && missing === "price" ? <StatusNote tone="warn" testID="qp-need">{t("price.quick.needPrice")}</StatusNote> : null}
          </>
        )}
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
    </Sheet>
  );
}
