import { APP_NAME } from "@/config/product";
import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { refundRecord, refundStripe } from "@/cloud/refund";
import { advanceApply } from "@/cloud/advance";
import { applicable, mayApplyAdvance } from "@/features/payments/advance";
import { AdvanceSheet } from "@/features/payments/AdvanceSheet";
import { canSeePayments } from "@/features/moneyLists";
import { mayRefund, refundable, viaStripe } from "@/features/payments/refund";
import { RefundSheet } from "@/features/payments/RefundSheet";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { receiptHtml, receiptMessage } from "@/features/docPdf";
import { docLanguageFor } from "@/data/people";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { openEmail, openSms } from "@/features/sendEstimate";
import { Button, IconButton, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Menu, useToast } from "@/ui/overlays";
import { ActionBar } from "@/ui/actionBar";
import { useDevice } from "@/theme/ThemeProvider";
import { Card, Divider, Empty, RowView, Screen } from "@/ui/surfaces";
import { RelatedBlock } from "@/features/RelatedBlock";

/** Receipt = one payment: number, amount, method, invoice, balance; PDF and send to the client. A client's advance (no
 *  invoice, spec 35 §4г) opens here too: refund it, or apply it to an invoice of the same client. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const auth = useAuth();
  const [refund, setRefund] = useState(false);
  const [apply, setApply] = useState(false);
  const { wide } = useDevice();
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const p = db.payments.find((x) => x.id === id) ?? (db.advances ?? []).find((x) => x.id === id);
  if (!p)
    return (
      <Screen title={t("rcpt.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  const inv = p.invoiceId === null ? undefined : db.invoices.find((i) => i.id === p.invoiceId);
  const advance = p.invoiceId === null ? p : null;
  const canApply = !!advance && mayApplyAdvance(auth.company?.role, store.mode, store.role) && applicable(advance);
  // Stripe's fee is the company's cost: staff who see payments, on the screen only — never on the client's PDF or message
  const fee = canSeePayments(store.role) && p.feeCents ? p.feeCents : undefined;
  const cust = db.customers.find((c) => c.id === p.customerId);
  const company = companyForPortal(db, store.companyName ?? APP_NAME);
  const canRefund = mayRefund(auth.company?.role, store.mode, store.role) && refundable(p) > 0;
  // the client's PDF and message know payments of invoices; an advance goes as one without an invoice (no invoice lines)
  const asPayment = { ...p, invoiceId: p.invoiceId ?? "" };
  const html = () => receiptHtml(db, asPayment, company, { lang: docLanguageFor(db, { customerId: p.customerId }) });
  const msg = receiptMessage(asPayment, company, docLanguageFor(db, { customerId: p.customerId }));
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
  // #1474 (DS §7.3, §8.9, Б4; as the estimate #1412): one main button and «⋯» with the rest — no row of five pills
  const pdf = () => saveEstimatePdf(html(), `Receipt ${p.receiptNumber ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));
  const sms = cust?.phone ? () => void openSms(cust.phone, msg.text).catch(() => {}) : undefined;
  const email = cust?.email ? () => void openEmail(cust.email!, msg.subject, msg.text).catch(() => {}) : undefined;
  const send = sms ?? email;
  // the next step: an advance is applied to an invoice; any other receipt goes to the client (by SMS when there is a phone)
  const applyBtn = (bar: boolean) => (
    <View testID="rcpt-apply">
      <Button label={t("mny.adv.apply")} icon="check" size={bar ? "bar" : undefined} full={bar} onPress={() => setApply(true)} />
    </View>
  );
  const sendBtn = (bar: boolean, second: boolean) => (
    <View testID="rcpt-send">
      <Button label={t("rcpt.send")} icon="send" variant={second ? "secondary" : undefined} size={bar ? "bar" : undefined} full={bar} onPress={send!} />
    </View>
  );
  const mainBtn = (bar: boolean) => (canApply ? applyBtn(bar) : send ? sendBtn(bar, false) : null);
  const secondBtn = (bar: boolean) => (canApply && send ? sendBtn(bar, true) : null);
  const items = [
    { key: "pdf", label: t("ue.pdf"), icon: "invoice" as const, testID: "rcpt-act-pdf" },
    ...(sms ? [{ key: "sms", label: t("ue.sendSms"), icon: "message" as const, testID: "rcpt-act-sms" }] : []),
    ...(email ? [{ key: "email", label: t("ue.sendEmail"), icon: "send" as const, testID: "rcpt-act-email" }] : []),
    // money back: the entry only — the sheet asks how much and why, and confirms (rule 5, unchanged)
    ...(canRefund ? [{ key: "refund", label: t("mny.refund.menu"), icon: "undo" as const, destructive: true, testID: "rcpt-refund" }] : []),
  ];
  const more = (
    <View ref={moreRef} collapsable={false} testID="rcpt-more">
      <IconButton
        icon="more"
        label={`${t("lead.more")}: ${`${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim()}`}
        onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))}
      />
    </View>
  );
  const barMain = !wide ? mainBtn(true) : null;
  return (
    <Screen
      title={`${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim()}
      back={back}
      subtitle={cust?.name}
      right={more}
      footer={barMain ? <ActionBar testID="rcpt-actionbar" main={barMain} second={secondBtn(true) ?? undefined} /> : undefined}
    >
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
        {advance ? <View testID="rcpt-advance">{line(t("rcpt.forInvoice"), t("mny.adv.noInvoice"))}</View> : null}
        {fee ? <View testID="rcpt-fee">{line(t("mny.refund.fee"), money(fee))}</View> : null}
        <Divider />
        {inv ? line(t("rcpt.balanceAfter"), money(Math.max(0, inv.totalCents - inv.paidCents))) : null}
        {p.refundedCents ? <View testID="rcpt-refunded">{line(t("mny.refund.refundedLabel"), money(p.refundedCents))}</View> : null}
        {p.refundPendingCents ? <View testID="rcpt-refund-pending">{line(t("mny.refund.inTransit"), money(p.refundPendingCents))}</View> : null}
        {advance ? (
          <View testID="rcpt-advance-hint" style={{ gap: space[1] }}>
            <StatusChip status="warn" label={t("mny.adv.chip")} />
            <T v="caption" tone="mut">
              {t("mny.adv.hint")}
            </T>
            <T v="caption" tone="mut">
              {t("mny.adv.notCounted")}
            </T>
            {/* why «Зачесть» is not there yet: a refund of it may still come back (t41, 30 days) */}
            {advance.refundOpen ? (
              <View testID="rcpt-advance-wait">
                <T v="caption" tone="mut">
                  {t("mny.adv.err.advance_refund_settling")}
                </T>
              </View>
            ) : null}
          </View>
        ) : null}
        {p.needsReview && !advance ? (
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
      {/* from 820 the same buttons right after the receipt (the same place on every width, #1474) */}
      {wide && (mainBtn(false) || secondBtn(false)) ? (
        <RowView style={{ flexWrap: "wrap" }}>
          {mainBtn(false)}
          {secondBtn(false)}
        </RowView>
      ) : null}
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={`${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim()}
        items={items}
        onSelect={(k) => {
          setMoreAt(null);
          if (k === "pdf") void pdf();
          else if (k === "sms") sms?.();
          else if (k === "email") email?.();
          else if (k === "refund") setRefund(true);
        }}
        onClose={() => setMoreAt(null)}
      />
      {canRefund ? (
        <RefundSheet
          visible={refund}
          onClose={() => setRefund(false)}
          payment={p}
          invoice={inv}
          online={store.mode === "demo" || store.online}
          feeCents={p.feeCents}
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
      {advance && canApply ? (
        <AdvanceSheet
          visible={apply}
          onClose={() => setApply(false)}
          advance={advance}
          db={db}
          online={store.mode === "demo" || store.online}
          send={async (invoiceId) => {
            if (store.mode === "demo") {
              const e = store.applyAdvanceDemo(advance.id, invoiceId);
              return e ? { ok: false, error: e } : { ok: true };
            }
            const r = await advanceApply(advance.id, invoiceId);
            return r.ok ? { ok: true } : r;
          }}
          onDone={(i) => {
            setApply(false);
            if (store.mode === "cloud") void store.refresh();
            const done = t("mny.adv.done", { amount: money(advance.amountCents), number: i.number ?? "" });
            toast.show(store.mode === "demo" ? `${done} · ${t("mny.adv.demo")}` : done);
          }}
        />
      ) : null}
    </Screen>
  );
}
