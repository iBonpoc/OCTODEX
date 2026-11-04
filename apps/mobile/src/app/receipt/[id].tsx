import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { receiptHtml } from "@/features/docPdf";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { openEmail, openSms } from "@/features/sendEstimate";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, Empty, RowView, Screen } from "@/ui/surfaces";

/** Receipt = one payment: number, amount, method, invoice, balance; PDF and send to the client. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const p = db.payments.find((x) => x.id === id);
  if (!p)
    return (
      <Screen title={t("rcpt.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  const cust = db.customers.find((c) => c.id === p.customerId);
  const company = companyForPortal(db, store.companyName ?? "OCTODEX");
  const html = () => receiptHtml(db, p, company, { t, money, day });
  const text = t("rcpt.sendText", { company: company.name, amount: money(p.amountCents), number: p.receiptNumber ?? "", date: day(p.at) });
  const line = (label: string, v: string) => (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <T v="body" tabular style={{ flexShrink: 1, textAlign: "right" }}>
        {v}
      </T>
    </RowView>
  );
  return (
    <Screen title={`${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim()} back={back} subtitle={cust?.name}>
      <Card status="ok">
        <StatusChip status="ok" label={t("rcpt.received")} />
        <T v="display" tabular>
          {money(p.amountCents)}
        </T>
        {line(t("rcpt.date"), day(p.at))}
        {line(t("rcpt.method"), `${t(`pay.${p.method}` as DictKey)}${p.reference ? ` · ${p.reference === "stripe-simulated" ? t("pay.testMode") : p.reference}` : ""}`)}
        {inv ? line(t("rcpt.forInvoice"), [inv.number, inv.title].filter(Boolean).join(" · ")) : null}
        <Divider />
        {inv ? line(t("rcpt.balanceAfter"), money(Math.max(0, inv.totalCents - inv.paidCents))) : null}
        {!p.receiptNumber ? (
          <T v="caption" tone="mut">
            {t("rcpt.pendingNumber")}
          </T>
        ) : null}
      </Card>
      <RowView style={{ flexWrap: "wrap" }}>
        <Button
          label={t("ue.pdf")}
          icon="invoice"
          onPress={() => saveEstimatePdf(html(), `Receipt ${p.receiptNumber ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })))}
        />
        {cust?.phone ? <Button label={t("ue.sendSms")} icon="message" variant="secondary" onPress={() => openSms(cust.phone, text).catch(() => {})} /> : null}
        {cust?.email ? <Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => openEmail(cust.email!, `${t("rcpt.title")} ${p.receiptNumber ?? ""}`, text).catch(() => {})} /> : null}
        {inv ? <Button label={t("inv.title")} icon="chevronRight" variant="ghost" onPress={() => router.push(`/invoice/${inv.id}`)} /> : null}
      </RowView>
    </Screen>
  );
}
