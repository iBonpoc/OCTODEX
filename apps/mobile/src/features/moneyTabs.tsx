import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Segmented } from "@/ui/controls";
import { canSeeInvoiceList, canSeePayments } from "@/features/moneyLists";

export type MoneyTab = "estimates" | "invoices" | "payments";

const HREF: Record<MoneyTab, "/estimates" | "/invoice" | "/payments"> = {
  estimates: "/estimates",
  invoices: "/invoice",
  payments: "/payments",
};

/**
 * «Деньги» (redesign #2348, decision 20.11 п.2): one tab, its parts switched by a segment at the top — «Сметы · Счета ·
 * Оплаты». A part the role may not see is not offered (tech — estimates only, so no segment at all; sales — no payments).
 * Switching replaces the screen (a tab, not a step deeper: no «back» to the part before).
 */
export function MoneyTabs({ value }: { value: MoneyTab }) {
  const { t } = useI18n();
  const { role } = useStore();
  const items: { key: MoneyTab; label: string }[] = [{ key: "estimates", label: t("sales.estimates") }];
  if (canSeeInvoiceList(role)) items.push({ key: "invoices", label: t("nav.invoices") });
  if (canSeePayments(role)) items.push({ key: "payments", label: t("mny.payments.title") });
  if (items.length < 2) return null;
  return (
    <Segmented<MoneyTab>
      full
      equal
      testID="money-tabs"
      label={t("nav.money")}
      value={value}
      onChange={(k) => {
        if (k !== value) router.replace(HREF[k]);
      }}
      items={items}
    />
  );
}
