import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { refundRecord, refundStripe } from "@/cloud/refund";
import { mayRefund, refundable, viaStripe } from "@/features/payments/refund";
import { RefundSheet } from "@/features/payments/RefundSheet";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { receiptHtml, receiptMessage } from "@/features/docPdf";
import { docLanguageFor } from "@/data/people";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { openEmail, openSms } from "@/features/sendEstimate";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, Empty, RowView, Screen } from "@/ui/surfaces";
import { RelatedBlock } from "@/features/RelatedBlock";

/** Receipt = one payment: number, amount, method, invoice, balance; PDF and send to the client. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const auth = useAuth();
  const [refund, setRefund] = useState(false);
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
  const canRefund = mayRefund(auth.company?.role, store.mode, store.role) && refundable(p) > 0;
  const html = () => receiptHtml(db, p, company, { lang: docLanguageFor(db, { customerId: p.customerId }) });
  const msg = receiptMessage(p, company, docLanguageFor(db, { customerId: p.customerId }));
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
      {/* «Связано»: invoice, job, client (15-flows §2 «квитанция → счёт → работа → клиент») */}
      <RelatedBlock of={{ type: "receipt", id: p.id }} />
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
        {p.refundedCents ? <View testID="rcpt-refunded">{line(t("mny.refund.refundedLabel"), money(p.refundedCents))}</View> : null}
        {p.needsReview ? (
          <View testID="rcpt-review" style={{ gap: space[1] }}>
            <StatusChip status="warn" label={t("mny.refund.review")} />
            <T v="caption" tone="mut">
              {t("mny.refund.reviewHint")}
            </T>
          </View>
        ) : null}
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
        {cust?.phone ? <Button label={t("ue.sendSms")} icon="message" variant="secondary" onPress={() => openSms(cust.phone, msg.text).catch(() => {})} /> : null}
        {cust?.email ? <Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => openEmail(cust.email!, msg.subject, msg.text).catch(() => {})} /> : null}
        {canRefund ? (
          <View testID="rcpt-refund">
            <Button label={t("mny.refund.action")} variant="secondary" onPress={() => setRefund(true)} />
          </View>
        ) : null}
      </RowView>
      {canRefund ? (
        <RefundSheet
          visible={refund}
          onClose={() => setRefund(false)}
          payment={p}
          invoice={inv}
          online={store.mode === "demo" || store.online}
          send={async (a) => {
            if (store.mode === "demo") {
              const e = store.refundPaymentDemo(p.id, a.amountCents);
              return e ? { ok: false, error: e } : { ok: true, status: "succeeded" };
            }
            const ask = { paymentId: p.id, ...a };
            return viaStripe(p) ? refundStripe(ask) : refundRecord(ask);
          }}
          onDone={(d, amount) => {
            setRefund(false);
            if (store.mode === "cloud") void store.refresh();
            toast.show(
              store.mode === "demo" ? `${t("mny.refund.done", { amount: money(amount) })} · ${t("mny.refund.demo")}`
                : d.status === "pending" ? t("mny.refund.pending", { amount: money(amount) }) : t("mny.refund.done", { amount: money(amount) }),
            );
            if (amount >= refundable(p)) back();   // fully refunded: the receipt leaves the list, as in the cloud
          }}
        />
      ) : null}
    </Screen>
  );
}
