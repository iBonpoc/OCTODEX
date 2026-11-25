import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { InvoiceObject } from "@/features/invoice/InvoiceCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeInvoice } from "@/features/access";
import { VoidInvoiceBody } from "@/features/invoice/VoidInvoice";
import { initialsOf } from "@/features/invoice/moneySummary";
import { ObjectScreen } from "@/ui/templates";

/**
 * «Счёт» — the Object template (prototype v2 #2350; body — features/invoice/InvoiceCard `InvoiceObject`): how much is owed and
 * the one next step pinned at the bottom. A voided invoice opens too (В1-5) — marked, with its reason, no step at all.
 * `?pay=1` (the list's swipe «Принять оплату») opens the payment sheet on arrival.
 */
export default function InvoiceScreen() {
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/invoice"));
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
  if (live) return <InvoiceObject key={live.id} inv={live} back={back} pay={pay === "1"} />;
  const who = db.customers.find((c) => c.id === inv.customerId)?.name;
  return (
    <ObjectScreen
      testID="invoice-screen"
      back={back}
      header={{
        testID: "invoice-head",
        title: who ?? `${t("inv.title")} ${inv.number ?? ""}`.trim(),
        avatar: who ? initialsOf(who) : undefined,
        status: { name: "neutral", label: t("inv.void.status") },
        meta: [{ id: "num", label: t("proto.money.invoiceOf", { num: inv.number ?? "" }).trim() }],
        labels: { expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }) },
      }}
      sections={[]}
      section=""
      onSection={() => {}}
      sectionsLabel={t("proto.money.details")}
      more={[]}
      onMore={() => {}}
    >
      <VoidInvoiceBody inv={inv} />
    </ObjectScreen>
  );
}
