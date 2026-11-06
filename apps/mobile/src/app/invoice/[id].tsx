import { findJob } from "@/data/jobs";
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { PaymentMethod } from "@/data/types";
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
import { Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const METHODS: PaymentMethod[] = ["card", "cash", "check", "zelle"];

/** Invoice: amount, paid, balance; take a payment (any part); receipts; send / PDF. */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("zelle");
  const [ref, setRef] = useState("");
  const [remind, setRemind] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv)
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  const cust = db.customers.find((c) => c.id === inv.customerId);
  // a cancelled job keeps its invoices (wave П-1): look in both lists
  const job = findJob(db, inv.jobId);
  const balance = invoiceBalance(inv).owesCents;
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  const chip = invoiceChip(inv);
  const company = companyForPortal(db, store.companyName ?? "OCTODEX");
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

  return (
    <Screen title={`${t("inv.title")} ${inv.number ?? ""}`.trim()} back={back} subtitle={cust?.name}>
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

      <RowView style={{ flexWrap: "wrap" }}>
        {balance > 0 ? (
          <Button
            label={t("inv.takePayment")}
            icon="dollar"
            onPress={() => {
              setAmount(balance);
              setPay(true);
            }}
          />
        ) : null}
        {/* reminders are the office's (S20); the tech takes the payment on site and does not chase debts */}
        {balance > 0 && store.role !== "tech" && (cust?.phone || cust?.email) ? <Button label={t("mny.remind")} icon="bell" variant="secondary" onPress={() => setRemind(true)} /> : null}
        {balance > 0 && cust?.phone ? <Button label={t("ue.sendSms")} icon="message" variant="secondary" onPress={() => openSms(cust.phone, msg().text).catch(() => {})} /> : null}
        {balance > 0 && cust?.email ? (
          <Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => openEmail(cust.email!, msg().subject, msg().text).catch(() => {})} />
        ) : null}
        <Button label={t("ue.pdf")} icon="invoice" variant="secondary" onPress={pdf} />
      </RowView>

      <SectionTitle title={t("rcpt.list")} right={pays.length ? <T v="caption" tone="mut">{pays.length}</T> : undefined} />
      {pays.length ? (
        <CardList>
          {pays.map((p, n) => (
            <View key={p.id}>
              <ItemCard
                title={`${money(p.amountCents)} · ${t(`pay.${p.method}` as DictKey)}`}
                subtitle={`${p.receiptNumber ?? t("rcpt.pendingNumber")} · ${day(p.at)}${p.reference ? ` · ${p.reference === "stripe-simulated" ? t("pay.testMode") : p.reference}` : ""}`}
                onPress={() => router.push(`/receipt/${p.id}`)}
              />
            </View>
          ))}
        </CardList>
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
          <Labeled label={t("inv.payAmount", { max: money(balance) })}>
            <MoneyField cents={amount} onChange={setAmount} />
          </Labeled>
          {amount > balance ? (
            <T v="caption" tone="warn">
              {t("inv.capped", { max: money(balance) })}
            </T>
          ) : null}
          <ChoiceChips value={method} onChange={setMethod} items={METHODS.map((m) => ({ key: m, label: t(`pay.${m}` as DictKey) }))} />
          <TextField type="identifier" value={ref} onChangeText={setRef} placeholder={t("inv.reference")} />
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
    </Screen>
  );
}
