import { APP_NAME } from "@/config/product";
import { findJob } from "@/data/jobs";
import { useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Invoice, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { invoiceChip } from "@/features/ContractStatement";
import { invoiceHtml, invoiceMessage } from "@/features/docPdf";
import { docLanguageFor } from "@/data/people";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { Labeled, MoneyField } from "@/features/fields";
import { openEmail, openSms } from "@/features/sendEstimate";
import { invoiceBalance } from "@/features/invoiceStatus";
import { reminderMessage, remindersOf } from "@/features/invoiceRemind";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { RelatedBlock } from "@/features/RelatedBlock";
import { VoidInvoiceMenu, type InvoiceMoreItem } from "@/features/invoice/VoidInvoice";
import { Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { paymentRight } from "@/features/moneyLists";
import { StatusNote } from "@/ui/statusNote";

const METHODS: PaymentMethod[] = ["card", "cash", "check", "zelle"];

/**
 * The invoice card's body: «Связано», amount / paid / balance, take a payment, reminders, receipts, send / PDF.
 * The same body on the invoice's own screen (`/invoice/<id>`) and in the panel beside the list on 1280
 * (`/invoice?open=<id>`, docs/specs/06-list-cards.md «Панель 1280»).
 */
/**
 * Where the card's actions stand (#1474, DS §7.3, §8.9, Б4; as the estimate, #1412): `more` — «⋯» with the other actions, `main` —
 * «Принять оплату» at the top of the content (from 820, the panel), `mainBar` — the same for the pinned bar on a phone, `body` — the rest.
 */
export type InvoiceFrame = (parts: { more: ReactNode; main: ReactNode | null; mainBar: ReactNode | null; body: ReactNode }) => ReactElement;

export function InvoiceCardBody({ inv, frame }: { inv: Invoice; frame?: InvoiceFrame }) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("zelle");
  const [ref, setRef] = useState("");
  const [remind, setRemind] = useState(false);
  const cust = db.customers.find((c) => c.id === inv.customerId);
  // a cancelled job keeps its invoices (wave П-1): look in both lists
  const job = findJob(db, inv.jobId);
  const balance = invoiceBalance(inv).owesCents;
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  // 20в: ACH on its way (Stripe has not settled it): shown, never counted as paid
  const pendingCents = (db.pendingPayments ?? []).filter((p) => p.invoiceId === inv.id).reduce((a, p) => a + p.amountCents, 0);
  // sales: only the whole deposit of an estimate, none while a payment of it is on its way (#868, 17; review of #1061 Б1) —
  // no part, no reference (the server's deposit function takes neither)
  const right = paymentRight(store.role, inv, { fromEstimate: !!job?.estimateId, pendingCents });
  const chip = invoiceChip(inv);
  const company = companyForPortal(db, store.companyName ?? APP_NAME);
  const msg = () => invoiceMessage(db, inv, company, docLanguageFor(db, { customerId: inv.customerId }));
  const lang = docLanguageFor(db, { customerId: inv.customerId });
  const reminder = () => reminderMessage(db, inv, company.name, lang);
  const lastReminder = remindersOf(db, inv.id)[0];
  /** S20: open the phone's SMS / mail with the text in the client's language, and log it in the client's feed (undo 5 s) */
  const sendReminder = (channel: "sms" | "email") => {
    const m = reminder();
    (channel === "sms" ? openSms(cust!.phone, m.text) : openEmail(cust!.email!, m.subject, m.text)).catch(() => {});
    const undo = store.remindInvoice(inv.id, channel);
    toast.show(store.online ? t("mny.remind.done") : t("offline.queued"), undo);
    setRemind(false);
  };
  const pdf = () =>
    saveEstimatePdf(invoiceHtml(db, inv, company, { lang: docLanguageFor(db, { customerId: inv.customerId }) }), `Invoice ${inv.number ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));

  // #1412/#1474: one main button — take the payment — and «⋯» with the rest; no row of pills under the card
  const takePay = () => {
    // ACH on its way: the rest, not the whole balance (review 20в №7); sales — the whole deposit
    setAmount(right === "wholeDeposit" ? balance : Math.max(0, balance - pendingCents));
    setPay(true);
  };
  const payButton = (bar: boolean) =>
    balance > 0 && right !== "none" ? (
      <View testID="invoice-take-payment" style={bar ? undefined : { alignSelf: "flex-start" }}>
        <Button label={t("inv.takePayment")} icon="dollar" size={bar ? "bar" : undefined} full={bar} onPress={takePay} />
      </View>
    ) : null;
  const items: InvoiceMoreItem[] = [
    // Б4: PDF first, then the ways to send it; «Аннулировать…» last (VoidInvoiceMenu)
    { key: "pdf", label: t("ue.pdf"), icon: "invoice" as const, testID: "invoice-act-pdf", onPress: pdf },
    // reminders are the office's (S20); the tech takes the payment on site and does not chase debts
    ...(balance > 0 && store.role !== "tech" && (cust?.phone || cust?.email) ? [{ key: "remind", label: t("mny.remind"), icon: "bell" as const, testID: "invoice-act-remind", onPress: () => setRemind(true) }] : []),
    ...(balance > 0 && cust?.phone ? [{ key: "sms", label: t("ue.sendSms"), icon: "message" as const, testID: "invoice-act-sms", onPress: () => void openSms(cust.phone, msg().text).catch(() => {}) }] : []),
    ...(balance > 0 && cust?.email ? [{ key: "email", label: t("ue.sendEmail"), icon: "send" as const, testID: "invoice-act-email", onPress: () => void openEmail(cust.email!, msg().subject, msg().text).catch(() => {}) }] : []),
  ];
  const more = <VoidInvoiceMenu inv={inv} items={items} />;
  const body = (
    <>
      {/* «Связано» (13 §2.7, 15-flows §2): job, estimate, client — the parents of the invoice */}
      <RelatedBlock of={{ type: "invoice", id: inv.id }} />
      <Card status={chip.s}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }}>
            {inv.title || t(`inv.kind.${inv.kind ?? "final"}` as DictKey)}
          </T>
          <StatusChip status={chip.s} label={t(chip.l)} />
        </RowView>
        {job ? (
          <T v="caption" tone="mut">
            {job.title}
          </T>
        ) : null}
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("inv.amount")}
          </T>
          <T v="body" tabular>
            {money(inv.totalCents)}
          </T>
        </RowView>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("inv.paid")}
          </T>
          <T v="body" tabular>
            {money(inv.paidCents)}
          </T>
        </RowView>
        {pendingCents > 0 ? (
          <View testID="invoice-ach-pending">
            <StatusChip status="info" label={t("pay.online.pending", { amount: money(pendingCents) })} />
          </View>
        ) : null}
        <Divider />
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="title">{t("inv.balance")}</T>
          <T v="display" tabular>
            {money(balance)}
          </T>
        </RowView>
        <T v="caption" tone="mut">
          {t("money.due", { date: day(inv.dueDate) })}
          {inv.sentAt ? ` · ${t("st.sent")} ${day(inv.sentAt)}` : ""}
          {lastReminder ? ` · ${t("mny.remind.last", { date: day(lastReminder.at) })}` : ""}
        </T>
      </Card>


      <SectionTitle title={t("rcpt.list")} right={pays.length ? <T v="caption" tone="mut">{pays.length}</T> : undefined} />
      {pays.length ? (
        <CardGrid>
          {pays.map((p) => (
            // a receipt of this invoice (as the client's receipts, B1): how it was paid, number · date · reference, the sum on the right
            <ListCard
              key={p.id}
              density="compact"
              testID={`invoice-receipt-${p.id}`}
              lead={{ kind: "icon", icon: "dollar" }}
              title={t(`pay.${p.method}` as DictKey)}
              when={[p.receiptNumber ?? t("rcpt.pendingNumber"), day(p.at), p.reference ? (p.reference === "stripe-simulated" ? t("pay.testMode") : p.reference) : undefined].filter(Boolean).join(" · ")}
              value={money(p.amountCents)}
              valueTone="ok"
              onPress={() => router.push(`/receipt/${p.id}`)}
            />
          ))}
        </CardGrid>
      ) : (
        <T v="caption" tone="mut">
          {t("rcpt.none")}
        </T>
      )}

      <Sheet visible={remind} onClose={() => setRemind(false)} title={t("mny.remind.title")}>
        <View style={{ gap: space[3] }}>
          <T v="caption" tone="mut">{t("mny.remind.lang", { lang: DOC_LANG_LABEL[lang] })}</T>
          <Card>
            <T v="body">{reminder().text}</T>
          </Card>
          {cust?.phone ? <Button label={t("mny.remind.sms")} icon="sms" full onPress={() => sendReminder("sms")} /> : null}
          {cust?.email ? <Button label={t("mny.remind.email")} icon="mail" variant={cust?.phone ? "secondary" : "primary"} full onPress={() => sendReminder("email")} /> : null}
        </View>
      </Sheet>

      <Sheet visible={pay} onClose={() => setPay(false)} title={t("inv.takePayment")}>
        <View style={{ gap: space[3] }}>
          {right === "wholeDeposit" ? null : (
            <Labeled label={t("inv.payAmount", { max: money(balance) })}>
              <MoneyField cents={amount} onChange={setAmount} />
            </Labeled>
          )}
          {amount > balance ? (
            <StatusNote tone="warn">{t("inv.capped", { max: money(balance) })}</StatusNote>
          ) : null}
          <ChoiceChips value={method} onChange={setMethod} items={METHODS.map((m) => ({ key: m, label: t(`pay.${m}` as DictKey) }))} />
          {right === "wholeDeposit" ? null : <TextField type="identifier" value={ref} onChangeText={setRef} placeholder={t("inv.reference")} />}
          <Button
            label={t("inv.record", { amount: money(Math.min(amount, balance)) })}
            icon="check"
            full
            disabled={amount <= 0}
            onPress={() => {
              const undo = store.recordPayment(inv.id, amount, method, ref);
              toast.show(store.online ? t("toast.paid", { amount: money(Math.min(amount, balance)) }) : t("offline.queued"), undo);
              setPay(false);
              setRef("");
            }}
          />
        </View>
      </Sheet>
    </>
  );
  const main = payButton(false);
  const mainBar = payButton(true);
  if (frame) return frame({ more, main, mainBar, body });
  return (
    <>
      {more || main ? (
        <RowView style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>{main}</View>
          {more}
        </RowView>
      ) : null}
      {body}
    </>
  );
}
