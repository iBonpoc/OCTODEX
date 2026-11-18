/**
 * #1835 (the audit's variant Б, 16.11): «Закупка $108.00 — это уже с налогом поставщика (8 %)?» — asked once when a supplier
 * with a tax is picked for a material whose cost was typed with no supplier (features/suppliers supplierTaxAsk). Two rows to
 * choose from, each says what happens to the client's price; no default; closing the sheet attaches no supplier.
 */
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { Supplier } from "@/data/types";
import { useI18n } from "@/i18n";
import { formatBps } from "@/ui/numberInput";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Divider, ListRow } from "@/ui/surfaces";
import type { SupplierTaxAsk as Ask, TaxAnswer } from "./suppliers";

export function SupplierTaxAsk({ ask, supplier, unit, visible, onClose, onExited, onAnswer }: { ask: Ask | null; supplier: Supplier | null; unit: string; visible: boolean; onClose: () => void; onExited: () => void; onAnswer: (a: TaxAnswer) => void }) {
  const { t, money } = useI18n();
  if (!ask || !supplier) return null;
  const pct = `${formatBps(ask.taxBps)}%`;
  const per = (c: number) => `${money(c)} / ${unit}`;
  return (
    <Sheet visible={visible} onClose={onClose} onExited={onExited} title={t("sup.taxAsk.title", { name: supplier.name })}>
      <View testID="sup-tax-ask" style={{ gap: space[3] }}>
        <T v="body">{t("sup.taxAsk.q", { cost: money(ask.costCents), pct })}</T>
        <View>
          <View testID="sup-tax-ask-with">
            <ListRow
              title={t("sup.taxAsk.with")}
              subtitle={
                ask.priceWithTax === ask.priceNow
                  ? t("sup.taxAsk.withHint", { net: money(ask.netCents), price: per(ask.priceWithTax) })
                  : t("sup.taxAsk.withHintCent", { net: money(ask.netCents), price: per(ask.priceWithTax), from: per(ask.priceNow) })
              }
              onPress={() => onAnswer("withTax")}
              lines={2}
            />
          </View>
          <Divider />
          <View testID="sup-tax-ask-without">
            <ListRow
              title={t("sup.taxAsk.without")}
              subtitle={t("sup.taxAsk.withoutHint", { from: per(ask.priceNow), price: per(ask.priceWithoutTax) })}
              onPress={() => onAnswer("withoutTax")}
              lines={2}
            />
          </View>
        </View>
        <T v="caption" tone="mut">{t("sup.taxAsk.close")}</T>
      </View>
    </Sheet>
  );
}
