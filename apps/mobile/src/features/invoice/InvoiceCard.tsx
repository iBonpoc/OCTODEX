import { APP_NAME } from "@/config/product";
import { findJob } from "@/data/jobs";
import { useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { canOpen } from "@/nav/roles";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Invoice, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { invoiceChip } from "@/features/ContractStatement";
import { invoiceNext } from "@/features/invoice/invoiceNext";
import { invoiceHtml, invoiceMessage, invoicePageToken, paymentHow } from "@/features/docPdf";
import { docLanguageFor } from "@/data/people";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { Labeled, MoneyField } from "@/features/fields";
import { clientLink, copyText, openEmail, openSms } from "@/features/sendEstimate";
import { invoiceBalance } from "@/features/invoiceStatus";
import { reminderMessage, remindersOf } from "@/features/invoiceRemind";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { RelatedBlock } from "@/features/RelatedBlock";
import { ActionBar } from "@/ui/actionBar";
import { VoidInvoiceMenu } from "@/features/invoice/VoidInvoice";
import { Button, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { ButtonPair, FieldRow } from "@/ui/pairs";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { paymentRight } from "@/features/moneyLists";
import { StatusNote } from "@/ui/statusNote";
import { invoiceTitle } from "@/features/invoiceTitle";

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
export type InvoiceFrame = (parts: { more: ReactNode; bar: ReactNode | null; body: ReactNode; head: ReactNode; summary: ReactNode; rest: ReactNode }) => ReactElement;

/**
 * `inline` — the buttons stand in the content, right after the money (from 820, the panel; the default); off — they go to the pinned
 * bar the frame gets as `bar` (a phone). One place on every width: after the money (#1474 review).
 */
export function InvoiceCardBody({ inv, frame, inline = true }: { inv: Invoice; frame?: InvoiceFrame; inline?: boolean }) {
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
  // one word of status in the list and on the card (#1495): the one source of truth is `invoiceChip`
  const chipLabel = t(chip.l, chip.p);
  const company = companyForPortal(db, store.companyName ?? APP_NAME);
  // #2017: the client sees and pays the invoice on the page of the job's signed estimate (none without an estimate: #2082)
  const pageToken = invoicePageToken(db, inv);
  const link = pageToken ? clientLink(pageToken) : undefined;
  const msg = () => invoiceMessage(db, inv, company, docLanguageFor(db, { customerId: inv.customerId }), link);
  const lang = docLanguageFor(db, { customerId: inv.customerId });
  const reminder = () => reminderMessage(db, inv, company.name, lang, Date.now(), link);
  // #2017: no Zelle / «checks payable to» — the message says nothing of how to pay; the office is told before it sends
  // only the office is told (it sends the messages); only the director can fill the methods in (the screen is read-only to others)
  const noHow = balance > 0 && !paymentHow(db, t) && canOpen(store.role, "/company/documents");
  const howHint = (inSheet: boolean) => noHow ? (
    <View testID={inSheet ? "remind-no-how" : "invoice-no-how"} style={{ gap: space[2] }}>
      <StatusNote tone="warn">{t("invMsg.noHow")}</StatusNote>
      {store.role === "director" ? (
        <View testID={inSheet ? "remind-fill-how" : "invoice-fill-how"}>
          <Button label={t("invMsg.fill")} icon="wallet" variant="secondary" size="sm" onPress={() => { if (inSheet) setRemind(false); router.push("/company/documents"); }} />
        </View>
      ) : null}
    </View>
  ) : null;
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
    saveEstimatePdf(invoiceHtml(db, inv, company, { lang: docLanguageFor(db, { customerId: inv.customerId }) }), `Invoice ${inv.number ?? ""}`.trim()).catch(() => toast.show(t("err.pdfSave")));
  const sendSms = cust?.phone ? () => void openSms(cust.phone, msg().text).catch(() => {}) : undefined;
  const sendEmail = cust?.email ? () => void openEmail(cust.email!, msg().subject, msg().text).catch(() => {}) : undefined;

  // LAYOUT-RULES §3 «Объект» (#2350): шапка (связи, статус, сумма к оплате) → вторичные действия значками в ряд → одна главная
  // кнопка «следующий шаг», закреплённая внизу на телефоне → оплаты списком. «⋯» — только редкое и опасное («Аннулировать…»).
  const payCents = right === "wholeDeposit" ? balance : Math.max(0, balance - pendingCents);
  const takePay = () => {
    // ACH on its way: the rest, not the whole balance (review 20в №7); sales — the whole deposit
    setAmount(payCents);
    setPay(true);
  };
  const canPay = balance > 0 && right !== "none";
  // not sent yet: the next step is to send it (the office; the tech takes the payment on site and does not send, as before)
  const send = sendSms ?? sendEmail;
  const sendFirst = !inv.sentAt && balance > 0 && store.role !== "tech" && !!send;
  const payButton = (bar: boolean, second = false) =>
    canPay ? (
      <View testID="invoice-take-payment">
        <Button
          label={second ? t("inv.takePayment") : `${t("inv.takePayment")} · ${money(payCents)}`}
          icon="dollar"
          variant={second ? "secondary" : undefined}
          size={bar ? "bar" : undefined}
          full={bar}
          onPress={takePay}
        />
      </View>
    ) : null;
  const sendButton = (bar: boolean) =>
    sendFirst ? (
      <View testID="invoice-send">
        <Button label={t("ue.send")} icon="send" size={bar ? "bar" : undefined} full={bar} onPress={send!} />
      </View>
    ) : null;
  const mainButton = (bar: boolean) => sendButton(bar) ?? payButton(bar);
  const secondButton = (bar: boolean) => (sendFirst ? payButton(bar, true) : null);
  // reminders are the office's (S20); the tech takes the payment on site and does not chase debts
  const canRemind = balance > 0 && store.role !== "tech" && !!(cust?.phone || cust?.email);
  // the secondary actions — icons in one row, each with its VoiceOver label (LAYOUT-RULES П6)
  const icons = [
    ...(balance > 0 && sendSms ? [{ key: "sms", label: t("ue.sendSms"), icon: "sms" as const, onPress: sendSms }] : []),
    ...(balance > 0 && sendEmail ? [{ key: "email", label: t("ue.sendEmail"), icon: "mail" as const, onPress: sendEmail }] : []),
    ...(link ? [{ key: "copy", label: t("ue.copyLink"), icon: "link" as const, onPress: () => void copyText(link).then(() => toast.show(t("team.copied"))).catch(() => {}) }] : []),
    { key: "pdf", label: t("ue.pdf"), icon: "invoice" as const, onPress: () => void pdf() },
  ];
  const actions = (
    <View testID="invoice-actions">
    <RowView gap={space[2]}>
      {icons.map((a) => (
        <View key={a.key} testID={`invoice-act-${a.key}`}>
          <IconButton icon={a.icon} label={a.label} onPress={a.onPress} />
        </View>
      ))}
      {canRemind ? (
        <View testID="invoice-remind">
          <IconButton icon="bell" label={t("mny.remind")} onPress={() => setRemind(true)} />
        </View>
      ) : null}
    </RowView>
    </View>
  );
  const more = <VoidInvoiceMenu inv={inv} />;
  const next = invoiceNext(inv, lastReminder ? day(lastReminder.at) : undefined, day(inv.dueDate));
  const nextText = t(next.key, next.params);
  // one status, icon + word (rule 2): the chip's word with what next («Просрочен 9 дн · напоминание не отправлялось»), never twice
  const statusText = next.key === "inv.next.paid" || nextText.startsWith(chipLabel) ? nextText : `${chipLabel} · ${nextText}`;
  // the due day, the sent day and the last reminder — once: the status line already names what it names
  const paid = balance <= 0;
  const dated = paid || next.key === "inv.next.waiting" || next.key === "inv.next.notSent";
  const meta = [
    dated ? undefined : t("money.due", { date: day(inv.dueDate) }),
    inv.sentAt ? t("inv.sentOn", { date: day(inv.sentAt) }) : undefined,
    lastReminder && next.key !== "inv.next.overdueReminded" ? t("mny.remind.last", { date: day(lastReminder.at) }) : undefined,
  ].filter(Boolean).join(" · ");
  const line = (label: string, v: string, testID?: string) => (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="body" tone="mut" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </T>
      <View testID={testID}>
        <T v="body" tabular>
          {v}
        </T>
      </View>
    </RowView>
  );
  // the card's three parts (#1495 Б): `head` — the links and the status; `summary` — the money, the icons, the main action (the side
  // column 360 from 1100, DS §12.3); `rest` — the payments and the sheets
  const head = (
    <>
      {/* the job, the estimate, the client — chips in one row (DS §12.3 п.6), the client by name: not a second time under the title */}
      <RelatedBlock of={{ type: "invoice", id: inv.id }} />
      <View testID="invoice-next" style={{ alignSelf: "flex-start" }}>
        <StatusChip status={chip.s} label={statusText} />
      </View>
    </>
  );
  const summary = (
    <>
      <Card>
        <View testID="invoice-balance" style={{ gap: space[1] }}>
          {/* the large sum is what matters now: owed, or — paid in full — what came in */}
          <T v="caption" tone="mut">
            {t(paid ? "inv.paid" : "inv.balance")}
          </T>
          <T v="display" tabular>
            {money(paid ? inv.paidCents : balance)}
          </T>
          {meta ? (
            <T v="caption" tone="mut">
              {meta}
            </T>
          ) : null}
        </View>
        <Divider />
        {/* the invoice's lines, quiet: what it is for and what came in */}
        {line(invoiceTitle(inv, t), money(inv.totalCents), "invoice-total")}
        {paid ? null : line(t("inv.paid"), money(inv.paidCents), "invoice-paid")}
        {pendingCents > 0 ? (
          <View testID="invoice-ach-pending">
            <StatusChip status="info" label={t("pay.online.pending", { amount: money(pendingCents) })} />
          </View>
        ) : null}
        {howHint(false)}
      </Card>
      {actions}
      {inline && (mainButton(false) || secondButton(false)) ? (
        <RowView style={{ flexWrap: "wrap" }}>
          {mainButton(false)}
          {secondButton(false)}
        </RowView>
      ) : null}
    </>
  );
  const rest = (
    <>
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
        <View testID="invoice-no-receipts"><Empty icon="dollar" title={t("rcpt.none")} hint={canPay ? t("rcpt.noneHint") : undefined} /></View>
      )}

      <Sheet visible={remind} onClose={() => setRemind(false)} title={t("mny.remind.title")}>
        <View style={{ gap: space[3] }}>
          <T v="caption" tone="mut">{t("mny.remind.lang", { lang: DOC_LANG_LABEL[lang] })}</T>
          <Card>
            <View testID="remind-text"><T v="body">{reminder().text}</T></View>
          </Card>
          {howHint(true)}
          {/* SMS and email side by side when both are there (#2350); the one there is — the whole width */}
          {cust?.phone || cust?.email ? (
            <ButtonPair
              main={cust?.phone ? { label: t("mny.remind.sms"), icon: "sms", onPress: () => sendReminder("sms") } : { label: t("mny.remind.email"), icon: "mail", variant: "primary", onPress: () => sendReminder("email") }}
              second={cust?.phone && cust?.email ? { label: t("mny.remind.email"), icon: "mail", variant: "secondary", onPress: () => sendReminder("email") } : null}
            />
          ) : null}
        </View>
      </Sheet>

      {/* taking a payment — LAYOUT-RULES §3 «Редактор»: what is owed large, the way to pay one segmented line, amount · reference in a
          row, one button with the sum */}
      <Sheet visible={pay} onClose={() => setPay(false)} title={t("inv.takePayment")}>
        <View testID="pay-sheet" style={{ gap: space[3] }}>
          <View testID="pay-owed" style={{ gap: space[1] }}>
            <T v="caption" tone="mut">
              {t("inv.balance")}
            </T>
            <T v="display" tabular>
              {money(balance)}
            </T>
          </View>
          <Segmented
            radio
            label={t("rcpt.method")}
            testID="pay-method"
            value={method}
            onChange={setMethod}
            items={METHODS.map((m) => ({ key: m, label: t(`pay.${m}` as DictKey) }))}
          />
          {right === "wholeDeposit" ? null : (
            <FieldRow>
              <Labeled label={t("rcpt.amount")}>
                <MoneyField cents={amount} onChange={setAmount} />
              </Labeled>
              <Labeled label={t("card.fact.num")}>
                <TextField type="identifier" value={ref} onChangeText={setRef} label={t("inv.reference")} />
              </Labeled>
            </FieldRow>
          )}
          {amount > balance ? (
            <StatusNote tone="warn">{t("inv.capped", { max: money(balance) })}</StatusNote>
          ) : null}
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
  const body = (
    <>
      {head}
      {summary}
      {rest}
    </>
  );
  const barMain = inline ? null : mainButton(true);
  const bar = barMain ? <ActionBar testID="invoice-actionbar" main={barMain} second={secondButton(true) ?? undefined} /> : null;
  if (frame) return frame({ more, bar, body, head, summary, rest });
  return (
    <>
      <RowView style={{ justifyContent: "flex-end" }}>{more}</RowView>
      {body}
    </>
  );
}
