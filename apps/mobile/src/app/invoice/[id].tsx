import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { InvoiceCardBody } from "@/features/invoice/InvoiceCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeInvoice } from "@/features/access";
import { VoidInvoiceBody } from "@/features/invoice/VoidInvoice";
import { useDevice } from "@/theme/ThemeProvider";

/** Invoice: amount, paid, balance; take a payment (any part); receipts; send / PDF (body — features/invoice/InvoiceCard). */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const { wide } = useDevice();
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
  const title = `${t("inv.title")} ${inv.number ?? ""}`.trim();
  if (!live)
    return (
      <Screen testID="invoice-screen" title={title} back={back} subtitle={cust?.name}>
        <VoidInvoiceBody inv={inv} />
      </Screen>
    );
  // #1474 (DS §7.3, §8.9, Б4): «⋯» in the header, «Принять оплату» pinned at the bottom on a phone, at the top of the content from 820
  return (
    <InvoiceCardBody
      inv={live}
      inline={wide}
      frame={({ more, bar, body }) => (
        <Screen testID="invoice-screen" title={title} back={back} subtitle={cust?.name} right={more} footer={bar ?? undefined}>
          {body}
        </Screen>
      )}
    />
  );
}
