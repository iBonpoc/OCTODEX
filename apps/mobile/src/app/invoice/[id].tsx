import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { InvoiceCardBody } from "@/features/invoice/InvoiceCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeInvoice } from "@/features/access";
import { VoidInvoiceBody, VoidInvoiceMenu } from "@/features/invoice/VoidInvoice";

/** Invoice: amount, paid, balance; take a payment (any part); receipts; send / PDF (body — features/invoice/InvoiceCard). */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  // В1-5: a voided invoice opens too — marked, with its reason, outside every sum
  const live = db.invoices.find((i) => i.id === id);
  const inv = live ?? (db.voidInvoices ?? []).find((i) => i.id === id);
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
    <Screen
      testID="invoice-screen"
      title={`${t("inv.title")} ${inv.number ?? ""}`.trim()}
      back={back}
      subtitle={cust?.name}
      right={live ? <VoidInvoiceMenu inv={live} /> : undefined}
    >
      {live ? <InvoiceCardBody inv={live} /> : <VoidInvoiceBody inv={inv} />}
    </Screen>
  );
}
