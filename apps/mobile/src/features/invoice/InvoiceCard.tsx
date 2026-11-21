import { APP_NAME } from "@/config/product";
import { findJob } from "@/data/jobs";
import { useEffect, useState } from "react";
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
import { remindersOf } from "@/features/invoiceRemind";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { RelatedBlock } from "@/features/RelatedBlock";
import { useVoidInvoice } from "@/features/invoice/VoidInvoice";
import { initialsOf, invoiceStep } from "@/features/invoice/moneySummary";
import { useInvoiceRemind } from "@/features/invoice/useRemind";
import { Button, Segmented, TextField } from "@/ui/controls";
import { GroupRow, GroupedList, ListGroup } from "@/ui/groupedList";
import { ButtonPair } from "@/ui/pairs";
import { Icon, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";
import { ToggleRow } from "@/ui/toggleRow";
import type { IconRowItem } from "@/ui/iconRow";
import { ObjectScreen, type MainAction } from "@/ui/templates";
import { paymentRight } from "@/features/moneyLists";
import { StatusNote } from "@/ui/statusNote";
import { invoiceTitle } from "@/features/invoiceTitle";
import { useToast } from "@/ui/overlays";

/** the ways of the payment sheet: Tap to Pay first (as Collect Payment of Jobber; prototype — recorded as a card payment) */
type Way = "tap" | Exclude<PaymentMethod, "card" | "ach">;
const WAYS: Way[] = ["tap", "cash", "check", "zelle"];
const WAY_LABEL: Record<Exclude<Way, "tap">, DictKey> = { cash: "pay.cash", check: "pay.check", zelle: "pay.zelle" };

/**
 * «Счёт» — the Object template (prototype v2 #2350, LAYOUT-RULES §3, BUILD-SPEC §2.10, object-cards «Счёт»).
 * The screen's one job: how much is owed — and get the money.
 * ObjectHeader (the client, «Счёт INV-0101 · работа ›», the status once) → IconRow: Оплата · Напомнить · Ссылка · PDF · Почта →
 * «К оплате» large, the sum once → the lines 40 → the payments (none — one quiet line) → «Автонапоминания» (prototype).
 * ONE main step pinned at the bottom by the state (`invoiceStep`): not sent → «Отправить клиенту» («Принять»); sent → «Принять
 * оплату · $X»; overdue → «Напомнить» («Принять»); paid → none. «⋯» — only «Аннулировать…», red, last.
 * `pay` — open the payment sheet at once (a swipe «Принять оплату» in the list: `/invoice/<id>?pay=1`).
 */
export function InvoiceObject({ inv, back, pay: payNow }: { inv: Invoice; back: () => void; pay?: boolean }) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const remind = useInvoiceRemind();
  const voiding = useVoidInvoice(inv);
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(0);
  const [way, setWay] = useState<Way>("tap");
  const [ref, setRef] = useState("");
  const [remindOpen, setRemindOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const cust = db.customers.find((c) => c.id === inv.customerId);
  // a cancelled job keeps its invoices (wave П-1): look in both lists
  const job = findJob(db, inv.jobId);
  const balance = invoiceBalance(inv).owesCents;
  const paid = balance <= 0;
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  // 20в: ACH on its way (Stripe has not settled it): shown, never counted as paid
  const pendingCents = (db.pendingPayments ?? []).filter((p) => p.invoiceId === inv.id).reduce((a, p) => a + p.amountCents, 0);
  // sales: only the whole deposit of an estimate, none while a payment of it is on its way (#868, 17; review of #1061 Б1)
  const right = paymentRight(store.role, inv, { fromEstimate: !!job?.estimateId, pendingCents });
  const payCents = right === "wholeDeposit" ? balance : Math.max(0, balance - pendingCents);
  const canPay = balance > 0 && right !== "none";
  const chip = invoiceChip(inv);
  const company = companyForPortal(db, store.companyName ?? APP_NAME);
  // #2017: the client sees and pays the invoice on the page of the job's signed estimate (none without an estimate: #2082)
  const pageToken = invoicePageToken(db, inv);
  const link = pageToken ? clientLink(pageToken) : undefined;
  const lang = docLanguageFor(db, { customerId: inv.customerId });
  const msg = () => invoiceMessage(db, inv, company, lang, link);
  const sendSms = cust?.phone ? () => void openSms(cust.phone, msg().text).catch(() => {}) : undefined;
  const sendEmail = cust?.email ? () => void openEmail(cust.email!, msg().subject, msg().text).catch(() => {}) : undefined;
  const pdf = () => saveEstimatePdf(invoiceHtml(db, inv, company, { lang }), `Invoice ${inv.number ?? ""}`.trim()).catch(() => toast.show(t("err.pdfSave")));
  // #2017: no way to pay filled in — the office is told before it sends; only the director can fill them in
  const noHow = balance > 0 && !paymentHow(db, t) && canOpen(store.role, "/company/documents");
  const howHint = (inSheet: boolean) =>
    noHow ? (
      <View testID={inSheet ? "remind-no-how" : "invoice-no-how"} style={{ gap: space[2] }}>
        <StatusNote tone="warn">{t("invMsg.noHow")}</StatusNote>
        {store.role === "director" ? (
          <View testID={inSheet ? "remind-fill-how" : "invoice-fill-how"}>
            <Button label={t("invMsg.fill")} icon="wallet" variant="secondary" size="sm" onPress={() => { if (inSheet) setRemindOpen(false); router.push("/company/documents"); }} />
          </View>
        ) : null}
      </View>
    ) : null;
  const lastReminder = remindersOf(db, inv.id)[0];
  // reminders and sending are the office's (S20); the tech takes the payment on site and does not chase debts
  const canRemind = balance > 0 && store.role !== "tech" && remind.reachable(inv.customerId);
  const send = sendSms ?? sendEmail;
  const step = invoiceStep(inv, { send: store.role !== "tech" && !!send, remind: canRemind, pay: canPay });
  const takePay = () => {
    // ACH on its way: the rest, not the whole balance (review 20в №7); sales — the whole deposit
    setAmount(payCents);
    setPay(true);
  };
  useEffect(() => {
    if (payNow && canPay) takePay();
    // the list's swipe opens it once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = invoiceNext(inv, lastReminder ? day(lastReminder.at) : undefined, day(inv.dueDate));
  const sent = inv.sentAt ? t("inv.sentOn", { date: day(inv.sentAt) }) : undefined;
  const reminded = lastReminder ? t("proto.money.reason.reminded", { date: day(lastReminder.at) }) : t("proto.money.reason.noReminder");
  // the reason under the main step says why this step, once (the status is the header's)
  const reason =
    step === "send" ? t("proto.money.reason.send") : step === "remind" ? [sent, reminded].filter(Boolean).join(" · ") : step === "pay" ? t("proto.money.reason.due", { date: day(inv.dueDate) }) : undefined;
  const who = cust?.name ?? "";
  const of = (what: string) => (who ? t("proto.money.actOf", { what, who }) : what);
  const payStep: MainAction = { label: t("proto.money.main.pay", { amount: money(payCents) }), onPress: takePay, reason, testID: "invoice-take-payment" };
  const main: MainAction | undefined =
    step === "send"
      ? { label: t("proto.money.main.send"), onPress: send!, reason, testID: "invoice-send" }
      : step === "remind"
        ? { label: t("proto.money.main.remind"), onPress: () => setRemindOpen(true), reason, testID: "invoice-remind-main" }
        : step === "pay"
          ? payStep
          : undefined;
  const second: MainAction | undefined = (step === "send" || step === "remind") && canPay ? { label: t("proto.money.second.pay"), onPress: takePay, testID: "invoice-take-payment-second" } : undefined;

  // QuickActions — the icon and its word (П6), what the main step is not: Оплата · Напомнить · Ссылка · PDF · Почта (≤ 5)
  const actions: IconRowItem[] = [
    ...(canPay && step !== "pay" && !second ? [{ icon: "dollar" as const, label: t("proto.money.act.pay"), a11y: of(t("inv.takePayment")), onPress: takePay, testID: "invoice-act-pay" }] : []),
    ...(canRemind && step !== "remind" ? [{ icon: "bell" as const, label: t("proto.money.act.remind"), a11y: of(t("mny.remind")), onPress: () => setRemindOpen(true), testID: "invoice-remind" }] : []),
    ...(link ? [{ icon: "link" as const, label: t("proto.money.act.link"), a11y: of(t("ue.copyLink")), onPress: () => void copyText(link).then(() => toast.show(t("team.copied"))).catch(() => {}), testID: "invoice-act-copy" }] : []),
    { icon: "invoice" as const, label: t("proto.money.act.pdf"), a11y: of(t("ue.pdf")), onPress: () => void pdf(), testID: "invoice-act-pdf" },
    ...(balance > 0 && sendEmail ? [{ icon: "mail" as const, label: t("proto.money.act.mail"), a11y: of(t("ue.sendEmail")), onPress: sendEmail, testID: "invoice-act-email" }] : []),
    ...(balance > 0 && sendSms && step !== "send" ? [{ icon: "sms" as const, label: t("proto.money.act.sms"), a11y: of(t("ue.sendSms")), onPress: sendSms, testID: "invoice-act-sms" }] : []),
  ].slice(0, 5);

  const number = inv.number ?? "";
  const statusLabel = t(chip.l, chip.p);
  const body = (
    <GroupedList>
      <Card>
        <View testID="invoice-balance" style={{ gap: space[1] }}>
          {/* the sum once (П7): what is owed now, or — paid in full — what came in */}
          <T v="caption" tone="mut">
            {t(paid ? "proto.money.paidFull" : "inv.balance")}
          </T>
          <T v="display" tabular>
            {money(paid ? inv.paidCents : balance)}
          </T>
          {/* what it is for, and — only when they differ from the sum above — its total, what came in, the tax (П7: no sum twice) */}
          <T v="caption" tone="mut">
            {[
              invoiceTitle(inv, t),
              !paid && inv.paidCents > 0 ? `${t("card.fig.total")} ${money(inv.totalCents)}` : undefined,
              !paid && inv.paidCents > 0 ? `${t("inv.paid")} ${money(inv.paidCents)}` : undefined,
              inv.taxCents ? `${t("proto.money.tax")} ${money(inv.taxCents)}` : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </T>
        </View>
        {pendingCents > 0 ? (
          <View testID="invoice-ach-pending">
            <StatusNote tone="info">{t("pay.online.pending", { amount: money(pendingCents) })}</StatusNote>
          </View>
        ) : null}
        {howHint(false)}
      </Card>
      {pays.length ? (
        <ListGroup title={`${t("proto.money.payments")} · ${pays.length}`} testID="invoice-payments">
          {pays.map((p) => (
            // a receipt of this invoice: how it was paid, number · date · reference, the sum on the right
            <GroupRow
              key={p.id}
              compact
              testID={`invoice-receipt-${p.id}`}
              lead={{ icon: "dollar" }}
              title={t(`pay.${p.method}` as DictKey)}
              subtitle={[p.receiptNumber ?? t("rcpt.pendingNumber"), day(p.at), p.reference ? (p.reference === "stripe-simulated" ? t("pay.testMode") : p.reference) : undefined].filter(Boolean).join(" · ")}
              value={money(p.amountCents)}
              onPress={() => router.push(`/receipt/${p.id}`)}
            />
          ))}
        </ListGroup>
      ) : (
        <View testID="invoice-no-receipts" style={{ paddingHorizontal: space[1] }}>
          <T v="caption" tone="mut">
            {t("rcpt.none")}
          </T>
        </View>
      )}
      {canRemind ? (
        <Card>
          <ToggleRow testID="invoice-auto-remind" label={t("proto.money.autoRemind")} caption={t("proto.money.autoRemindCaption")} value={auto} onChange={setAuto} />
        </Card>
      ) : null}
    </GroupedList>
  );

  return (
    <>
      <ObjectScreen
        testID="invoice-screen"
        back={back}
        header={{
          testID: "invoice-head",
          title: who || `${t("inv.title")} ${number}`.trim(),
          avatar: who ? initialsOf(who) : undefined,
          status: { name: chip.s, label: statusLabel },
          link: { label: [t("proto.money.invoiceOf", { num: number }).trim(), job?.title].filter(Boolean).join(" · "), onPress: () => (job ? router.push(`/job/${job.id}`) : undefined) },
          // «⌄»: who and what it is tied to, and its dates — once, here (П7, П9)
          details: (
            <View style={{ gap: space[2] }}>
              <RelatedBlock of={{ type: "invoice", id: inv.id }} />
              <T v="caption" tone="mut">
                {[sent, t("money.due", { date: day(inv.dueDate) }), lastReminder ? t("mny.remind.last", { date: day(lastReminder.at) }) : undefined, t(next.key, next.params)].filter(Boolean).join(" · ")}
              </T>
            </View>
          ),
          labels: { expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }) },
        }}
        actions={actions}
        main={main}
        second={second}
        sections={[]}
        section=""
        onSection={() => {}}
        sectionsLabel={t("proto.money.details")}
        more={voiding.item ? [voiding.item] : []}
        onMore={(k) => (k === "void" ? voiding.pick() : undefined)}
      >
        {body}
      </ObjectScreen>
      {voiding.sheet}

      <Sheet visible={remindOpen} onClose={() => setRemindOpen(false)} title={t("mny.remind.title")}>
        <View style={{ gap: space[3] }}>
          <T v="caption" tone="mut">{t("mny.remind.lang", { lang: DOC_LANG_LABEL[lang] })}</T>
          <Card>
            <View testID="remind-text">
              <T v="body">{remind.text(inv).text}</T>
            </View>
          </Card>
          {howHint(true)}
          {/* SMS and email side by side when both are there (#2350); the one there is — the whole width */}
          {cust?.phone || cust?.email ? (
            <ButtonPair
              main={
                cust?.phone
                  ? { label: t("mny.remind.sms"), icon: "sms", onPress: () => { setRemindOpen(false); remind.one(inv, "sms"); } }
                  : { label: t("mny.remind.email"), icon: "mail", variant: "primary", onPress: () => { setRemindOpen(false); remind.one(inv, "email"); } }
              }
              second={cust?.phone && cust?.email ? { label: t("mny.remind.email"), icon: "mail", variant: "secondary", onPress: () => { setRemindOpen(false); remind.one(inv, "email"); } } : null}
            />
          ) : null}
        </View>
      </Sheet>

      {/* taking a payment (BUILD-SPEC §2.10, wireframes-v2 №11): the sum once — it is the field (a part is fine); Tap to Pay first;
          the number only for a check or Zelle; one button with the sum */}
      <Sheet
        visible={pay}
        onClose={() => setPay(false)}
        title={t("inv.takePayment")}
        footer={
          <View testID="pay-record">
            <Button
              label={t(way === "tap" ? "proto.money.pay.byCard" : "proto.money.pay.record", { amount: money(Math.min(amount, balance)) })}
              icon={way === "tap" ? "wallet" : "check"}
              size="bar"
              full
              disabled={amount <= 0}
              onPress={() => {
                const method: PaymentMethod = way === "tap" ? "card" : way;
                const undo = store.recordPayment(inv.id, amount, method, way === "check" || way === "zelle" ? ref : undefined);
                toast.show(store.online ? t("toast.paid", { amount: money(Math.min(amount, balance)) }) : t("offline.queued"), undo);
                setPay(false);
                setRef("");
              }}
            />
          </View>
        }
      >
        <View testID="pay-sheet" style={{ gap: space[4] }}>
          <T v="caption" tone="mut" numberOfLines={1}>
            {t("proto.money.pay.of", { num: number, who })}
          </T>
          {right === "wholeDeposit" ? (
            <View testID="pay-owed">
              <T v="display" tabular>
                {money(balance)}
              </T>
            </View>
          ) : (
            <View testID="pay-owed">
              <Labeled label={t("proto.money.pay.amount")}>
                <MoneyField cents={amount} onChange={setAmount} />
              </Labeled>
            </View>
          )}
          <Segmented<Way>
            radio
            full
            label={t("rcpt.method")}
            testID="pay-method"
            value={way}
            onChange={setWay}
            items={WAYS.map((w) => ({ key: w, label: w === "tap" ? t("proto.money.pay.tap") : t(WAY_LABEL[w]) }))}
          />
          {way === "tap" ? (
            <View testID="pay-tap">
            <Card>
              <RowView gap={space[3]}>
                <Icon name="wallet" />
                <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                  <T v="heading">{t("proto.money.pay.tapTitle")}</T>
                  <T v="caption" tone="mut">
                    {t("proto.money.pay.tapHint")}
                  </T>
                </View>
              </RowView>
              <T v="caption" tone="mut">
                {t("proto.money.pay.tips")}
              </T>
            </Card>
            </View>
          ) : null}
          {(way === "check" || way === "zelle") && right !== "wholeDeposit" ? (
            <Labeled label={t("proto.money.pay.ref")}>
              <TextField type="identifier" value={ref} onChangeText={setRef} label={t("inv.reference")} />
            </Labeled>
          ) : null}
          {link && cust?.phone ? (
            <ListGroup inset={space[4]}>
              <GroupRow compact testID="pay-link-sms" title={`${t("proto.money.pay.link")} ›`} onPress={() => void openSms(cust.phone, msg().text).catch(() => {})} />
            </ListGroup>
          ) : null}
          {amount > balance ? <StatusNote tone="warn">{t("inv.capped", { max: money(balance) })}</StatusNote> : null}
        </View>
      </Sheet>
    </>
  );
}
