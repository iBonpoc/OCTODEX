import { APP_NAME } from "@/config/product";
import { findJob } from "@/data/jobs";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { cleanPhone, mailtoHref, smsHref } from "@/features/contactLinks";
import { router } from "expo-router";
import { canOpen } from "@/nav/roles";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { invoiceChip } from "@/features/ContractStatement";
import { invoiceNext } from "@/features/invoice/invoiceNext";
import { invoiceHtml, invoiceMessage, invoicePageToken, paymentHow } from "@/features/docPdf";
import { docLanguageFor } from "@/data/people";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { clientLink, copyText, openEmail, openSms } from "@/features/sendEstimate";
import { invoiceBalance } from "@/features/invoiceStatus";
import { remindersOf } from "@/features/invoiceRemind";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { RelatedBlock } from "@/features/RelatedBlock";
import { useVoidInvoice } from "@/features/invoice/VoidInvoice";
import { initialsOf, invoiceStep } from "@/features/invoice/moneySummary";
import { useInvoiceRemind } from "@/features/invoice/useRemind";
import { PaySheet } from "@/features/payments/PaySheet";
import { Button } from "@/ui/controls";
import { GroupRow, GroupedList, ListGroup } from "@/ui/groupedList";
import { ButtonPair } from "@/ui/pairs";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Card } from "@/ui/surfaces";
import { ToggleRow } from "@/ui/toggleRow";
import type { IconRowItem } from "@/ui/iconRow";
import { ObjectScreen, type MainAction } from "@/ui/templates";
import { MoreButton } from "@/ui/templates/parts";
import { MainStep } from "@/ui/mainStep";
import { IconRow } from "@/ui/iconRow";
import { paymentRight } from "@/features/moneyLists";
import { StatusNote } from "@/ui/statusNote";
import { invoiceTitle } from "@/features/invoiceTitle";
import { useToast } from "@/ui/overlays";

/**
 * «Счёт» — the Object template (prototype v2 #2350, LAYOUT-RULES §3, BUILD-SPEC §2.10, object-cards «Счёт»).
 * The screen's one job: how much is owed — and get the money.
 * ObjectHeader (the client, «Счёт INV-0101 · работа ›», the status once) → IconRow: Оплата · Напомнить · Ссылка · PDF · Почта →
 * «К оплате» large, the sum once → the lines 40 → the payments (none — one quiet line) → «Автонапоминания» (prototype).
 * ONE main step pinned at the bottom by the state (`invoiceStep`): not sent → «Отправить клиенту» («Принять»); sent → «Принять
 * оплату · $X»; overdue → «Напомнить» («Принять»); paid → none. «⋯» — only «Аннулировать…», red, last.
 * `pay` — open the payment sheet at once (a swipe «Принять оплату» in the list: `/invoice/<id>?pay=1`).
 */
/** the panel beside the list on 1280 (spec 06): the invoice's own content — «⋯» goes to the panel's header, the main step and the body inside it */
export type InvoiceFrame = (parts: { more: ReactNode; main: ReactNode; body: ReactNode }) => ReactElement;

export function InvoiceObject({ inv, back, pay: payNow, frame }: { inv: Invoice; back: () => void; pay?: boolean; frame?: InvoiceFrame }) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const remind = useInvoiceRemind();
  const voiding = useVoidInvoice(inv);
  const [pay, setPay] = useState(false);
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
  // «Задаток» of the sheet's quick amounts: the job's estimate deposit while it is not paid
  const est = job?.estimateId ? db.estimates.find((x) => x.id === job.estimateId) : undefined;
  const depositCents = est?.depositCents && !est.depositPaidAt ? est.depositCents : undefined;
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
    // ACH on its way: the rest, not the whole balance (review 20в №7); sales — the whole deposit (PaySheet starts at `payCents`)
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
  const sendStep: MainAction | undefined = step === "send" ? { label: t("proto.money.main.send"), onPress: send!, reason, testID: "invoice-send" } : undefined;
  const remindStep: MainAction | undefined = canRemind ? { label: t("proto.money.main.remind"), onPress: () => setRemindOpen(true), reason, testID: "invoice-remind-main" } : undefined;
  // #3012 (founder 27.11 «сделай как надо», вариант А): «Принять оплату» is THE step of an unpaid invoice whoever may take it;
  // sending and the reminder go into «⋯» (they write to the client by their sheet / the phone's app — never by one tap here)
  const main: MainAction | undefined = canPay ? { ...payStep, reason: step === "pay" ? reason : t("proto.money.reason.due", { date: day(inv.dueDate) }) } : (sendStep ?? remindStep);
  const second: MainAction | undefined = canPay ? (sendStep ?? remindStep) : sendStep && remindStep ? remindStep : undefined;

  // #3012: the row is the person's, as on every object card (#2995): Позвонить · SMS · Почта — the phone's own apps to the client;
  // nothing here sends the invoice. A missing contact is left out. PDF, the link and «Напомнить» are in «⋯»
  const tel = cleanPhone(cust?.phone);
  const smsTo = smsHref(cust?.phone);
  const mailTo = mailtoHref(cust?.email);
  const openUrl = (u: string) => void Linking.openURL(u).catch(() => undefined);
  const actions: IconRowItem[] = [
    ...(tel ? [{ icon: "phone" as const, label: t("client.call"), a11y: `${t("client.call")} ${who}`, onPress: () => openUrl(`tel:${tel}`), testID: "invoice-call" }] : []),
    ...(smsTo ? [{ icon: "sms" as const, label: t("cc.sms"), a11y: `${t("cc.sms")} ${who}`, onPress: () => openUrl(smsTo), testID: "invoice-client-sms" }] : []),
    ...(mailTo ? [{ icon: "mail" as const, label: t("cl6.writeMail"), a11y: `${t("cl6.writeMail")} ${who}`, onPress: () => openUrl(mailTo), testID: "invoice-client-mail" }] : []),
  ];
  const moreList = [
    ...(canRemind && second?.testID !== "invoice-remind-main" && main?.testID !== "invoice-remind-main" ? [{ key: "remind", label: t("mny.remind"), icon: "bell" as const, testID: "invoice-remind" }] : []),
    ...(balance > 0 && sendSms && step !== "send" ? [{ key: "sms", label: t("ue.sendSms"), icon: "sms" as const, testID: "invoice-act-sms" }] : []),
    ...(balance > 0 && sendEmail ? [{ key: "email", label: t("ue.sendEmail"), icon: "mail" as const, testID: "invoice-act-email" }] : []),
    ...(link ? [{ key: "link", label: t("ue.copyLink"), icon: "link" as const, testID: "invoice-act-copy" }] : []),
    { key: "pdf", label: t("ue.pdf"), icon: "invoice" as const, testID: "invoice-act-pdf" },
    ...(voiding.item ? [voiding.item] : []),
  ];
  const onMore = (k: string) => {
    if (k === "void") return voiding.pick();
    if (k === "remind") return setRemindOpen(true);
    if (k === "sms") return sendSms?.();
    if (k === "email") return sendEmail?.();
    if (k === "link" && link) return void copyText(link).then(() => toast.show(t("team.copied"))).catch(() => {});
    if (k === "pdf") return void pdf();
  };

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

  const sheets = (
    <>
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

      {/* taking a payment and its receipt at once (#2217, #2212): features/payments/PaySheet */}
      <PaySheet
        inv={inv}
        visible={pay}
        onClose={() => setPay(false)}
        startCents={payCents}
        balanceCents={balance}
        fixed={right === "wholeDeposit"}
        depositCents={depositCents}
        who={who}
        cust={cust}
        company={company}
        payLink={link && cust?.phone ? () => void openSms(cust.phone, msg().text).catch(() => {}) : undefined}
      />
    </>
  );
  if (frame)
    return (
      <>
        {frame({
          more: <MoreButton items={voiding.item ? [voiding.item] : []} onMore={(k) => (k === "void" ? voiding.pick() : undefined)} testID="invoice-more" />,
          main: main ? <MainStep placement="top" fit main={main} /> : null,
          body: (
            <View style={{ gap: space[3] }}>
              <IconRow testID="invoice-actions" actions={actions} />
              {body}
            </View>
          ),
        })}
        {sheets}
      </>
    );
  return (
    <>
      <ObjectScreen
        testID="invoice-screen"
        back={back}
        header={{
          testID: "invoice-head",
          // DS §12.13 «Шапка» (#2841, founder #2843 (а)): a document is named by its kind and number; who and what — the link under it
          title: `${t("inv.title")} ${number}`.trim(),
          status: { name: chip.s, label: statusLabel },
          link: { label: [who, job?.title].filter(Boolean).join(" · ") || t("proto.money.invoiceOf", { num: number }).trim(), onPress: () => (inv.customerId ? router.push(`/client/${inv.customerId}`) : job ? router.push(`/job/${job.id}`) : undefined) },
          // «⌄»: who and what it is tied to, and its dates — once, here (П7, П9)
          details: (
            <View style={{ gap: space[2] }}>
              <RelatedBlock of={{ type: "invoice", id: inv.id }} />
              <View testID="invoice-next">
                <T v="caption" tone="mut">
                  {[sent, t("money.due", { date: day(inv.dueDate) }), lastReminder ? t("mny.remind.last", { date: day(lastReminder.at) }) : undefined, t(next.key, next.params)].filter(Boolean).join(" · ")}
                </T>
              </View>
            </View>
          ),
          labels: { expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }) },
        }}
        actions={actions}
        // #2995 (layout review 27.11): «Просрочен…» was cut right of the rule on 390 — the status and the balance are one whole line
        // under the name («Просрочен 9 дн · $1,840.00»), never cut
        subtitle={balance > 0 ? money(balance) : money(inv.totalCents)}
        main={main}
        second={second}
        sections={[]}
        section=""
        onSection={() => {}}
        sectionsLabel={t("proto.money.details")}
        more={moreList}
        onMore={onMore}
      >
        {body}
      </ObjectScreen>
      {sheets}
    </>
  );
}
