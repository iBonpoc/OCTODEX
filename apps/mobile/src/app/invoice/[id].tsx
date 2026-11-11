import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { InvoiceCardBody } from "@/features/invoice/InvoiceCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeInvoice } from "@/features/access";

/** Invoice: amount, paid, balance; take a payment (any part); receipts; send / PDF (body — features/invoice/InvoiceCard). */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv)
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  // not the tech's (#868): no access, as the server would answer
  if (!canSeeInvoice(db, { role, mode, me: db.me }, inv.id))
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );
  const cust = db.customers.find((c) => c.id === inv.customerId);
  return (
    <Screen title={`${t("inv.title")} ${inv.number ?? ""}`.trim()} back={back} subtitle={cust?.name}>
      <InvoiceCardBody inv={inv} />
    </Screen>
  );
}
