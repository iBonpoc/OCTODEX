import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { invoiceChip } from "@/features/ContractStatement";
import { invoiceHtml } from "@/features/docPdf";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { Labeled, MoneyField } from "@/features/fields";
import { openEmail, openSms } from "@/features/sendEstimate";
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
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv)
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const job = db.jobs.find((j) => j.id === inv.jobId);
  const balance = Math.max(0, inv.totalCents - inv.paidCents);
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  const chip = invoiceChip(inv);
  const company = companyForPortal(db, store.companyName ?? "OCTODEX");
  const fmt = { t, money, day };
  const sendText = () => {
    const p = db.company?.payment;
    const how = [p?.zelle ? `Zelle ${p.zelle}` : "", p?.checkPayableTo ? `${t("inv.checkTo")} ${p.checkPayableTo}` : ""].filter(Boolean).join(", ");
    return t("inv.sendText", { company: company.name, number: inv.number ?? "", amount: money(balance), date: day(inv.dueDate), how: how || "—" });
  };
  const pdf = () =>
    saveEstimatePdf(invoiceHtml(db, inv, company, fmt), `Invoice ${inv.number ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));

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
        {balance > 0 && cust?.phone ? <Button label={t("ue.sendSms")} icon="message" variant="secondary" onPress={() => openSms(cust.phone, sendText()).catch(() => {})} /> : null}
        {balance > 0 && cust?.email ? (
          <Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => openEmail(cust.email!, `${t("inv.title")} ${inv.number ?? ""}`, sendText()).catch(() => {})} />
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
