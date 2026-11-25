import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { space } from "@octo/design-tokens";
import { invoiceOwes } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { Customer, Invoice, Payment, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { docLanguageFor } from "@/data/people";
import { receiptMessage } from "@/features/docPdf";
import { openEmail, openSms } from "@/features/sendEstimate";
import { MoneyField } from "@/features/fields";
import type { PortalData } from "@/cloud/portal";
import { bigAmount, quickAmounts, quickChosen, recordedCents, type QuickKey } from "@/features/payments/payAmount";
import { Button, Segmented, TextField } from "@/ui/controls";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { ButtonPair } from "@/ui/pairs";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";
import { useTheme } from "@/theme/ThemeProvider";
import { qv } from "@/features/qdraft/qv";

/** the ways of the payment sheet: Tap to Pay first (as Collect Payment of Jobber; prototype — recorded as a card payment) */
type Way = "tap" | Exclude<PaymentMethod, "card" | "ach">;
const WAYS: Way[] = ["tap", "cash", "check", "zelle"];
const WAY_LABEL: Record<Exclude<Way, "tap">, DictKey> = { cash: "pay.cash", check: "pay.check", zelle: "pay.zelle" };
const QUICK_LABEL: Record<QuickKey, DictKey> = { all: "w2m.pay.all", half: "w2m.pay.half", deposit: "w2m.pay.deposit" };

/**
 * «Принять оплату» — the sheet (visual v2 «Шторка», BUILD-SPEC §2.10, wireframes-v2 №11; ideas #2217, #2212).
 * Step 1, the sum: the one value large (22/700 tabular, the system number keyboard — no keyboard of our own), under it the quick
 * amounts «Весь остаток · Половина · Задаток» in one row; the way (Tap to Pay first); the number only for a check or Zelle; ONE
 * button with the sum. Step 2, the receipt — at once, in the same sheet (#2212): «Оплата записана», the sum, the way · number · day,
 * what is left; «Отправить клиенту» (in the CLIENT's language, rule 7) and «Готово» side by side; «Отменить оплату» stays (rule 5).
 * `fixed` — the sum is not typed (sales: only the whole deposit, #868).
 */
export function PaySheet({ inv, visible, onClose, startCents, balanceCents, fixed, depositCents, who, cust, company, payLink }: {
  inv: Invoice;
  visible: boolean;
  onClose: () => void;
  /** the sum the sheet opens with (the balance, or the rest while an ACH is on its way) */
  startCents: number;
  balanceCents: number;
  fixed?: boolean;
  /** the deposit of the job's estimate, unpaid: a quick amount */
  depositCents?: number;
  who: string;
  cust?: Customer;
  company: PortalData["company"];
  /** «Ссылка на оплату по SMS» */
  payLink?: () => void;
}) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [amount, setAmount] = useState(startCents);
  const [way, setWay] = useState<Way>("tap");
  const [ref, setRef] = useState("");
  /** step 2: the payment just written (its receipt), and how to take it back */
  const [done, setDone] = useState<{ before: Set<string>; undo: () => unknown } | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // each opening starts at the sum the screen asks for, on the first step
    if (visible && !wasOpen.current) {
      setAmount(startCents);
      setDone(null);
    }
    wasOpen.current = visible;
  }, [visible, startCents]);
  // ЧЕРНОВИК #2533 (`?qv=a`): подсказки по закону, без запрета. Работа не начата → предел задатка CA (10 %, не больше $1,000),
  // «Половина» не предлагается; после записи — наличные клиента за 12 мес > $10,000 → IRS 8300. Числа — черновик, не движок.
  const draft = qv() === "a";
  const job = db.jobs.find((j) => j.id === inv.jobId);
  const notStarted = draft && !!job && (job.status === "unscheduled" || job.status === "scheduled");
  const caLimit = job ? Math.min(100000, Math.round(job.amountCents / 10)) : 0;
  const quick = (fixed ? [] : quickAmounts(balanceCents, depositCents)).filter((q) => !(notStarted && q.key === "half"));
  // before the work under CA: «Весь остаток · Депозит · Предел» — the company's deposit and the state's limit (the smaller of 10 % of
  // the contract and $1,000); the same sum — one button «Депозит = предел»
  const coDep = job ? Math.round((job.amountCents * (db.company?.estimate?.depositBps ?? 0)) / 10000) : 0;
  const draftQuick: { key: string; cents: number; label: string }[] = notStarted && !fixed
    ? [
        { key: "all", cents: balanceCents, label: t("w2m.pay.all") },
        ...(coDep > 0 && coDep < balanceCents ? [{ key: "deposit", cents: coDep, label: coDep === caLimit ? `Предел · ${money(coDep)}` : `${t("w2m.pay.deposit")} · ${money(coDep)}` }] : []),
        ...(caLimit > 0 && caLimit < balanceCents && caLimit !== coDep ? [{ key: "limit", cents: caLimit, label: `Предел · ${money(caLimit)}` }] : []),
      ]
    : [];
  // ЧЕРНОВИК #2533: счёт выше предела до начала работ — по умолчанию предел; больше — только вписав сумму (тогда предупреждение)
  const limitSet = useRef(false);
  useEffect(() => {
    if (!visible) {
      limitSet.current = false;
      return;
    }
    if (limitSet.current || !notStarted || fixed || caLimit <= 0 || startCents <= caLimit) return;
    limitSet.current = true;
    setAmount(caLimit);
  }, [visible, notStarted, fixed, caLimit, startCents]);
  const chosen = quickChosen(amount, quick);
  const shown = recordedCents(amount, balanceCents);
  const number = inv.number ?? "";

  const record = () => {
    const method: PaymentMethod = way === "tap" ? "card" : way;
    const before = new Set(db.payments.map((p) => p.id));
    const undo = store.recordPayment(inv.id, amount, method, way === "check" || way === "zelle" ? ref : undefined);
    // online the receipt below says it; offline the toast says it waits for the network (rule 6) — «Отменить» on both
    if (!store.online) toast.show(t("offline.queued"), undo);
    else if (draft) toast.show(t("w2m.rcpt.done"), undo);
    setDone({ before, undo });
    setRef("");
  };
  const paid: Payment | undefined = done ? db.payments.filter((p) => p.invoiceId === inv.id && !done.before.has(p.id)).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  // «Отменить» from the toast took it back: the receipt is gone — the sheet is back at the sum
  useEffect(() => {
    if (done && !paid) setDone(null);
  }, [done, paid]);

  const close = () => {
    setDone(null);
    onClose();
  };

  // the receipt goes to the client in the client's language (rule 7), not the app's
  const lang = docLanguageFor(db, { customerId: inv.customerId });
  const msg = paid ? receiptMessage(paid, company, lang) : undefined;
  const sendReceipt = msg ? (cust?.phone ? () => void openSms(cust.phone, msg.text).catch(() => {}) : cust?.email ? () => void openEmail(cust.email!, msg.subject, msg.text).catch(() => {}) : undefined) : undefined;
  const left = db.invoices.find((i) => i.id === inv.id);
  const leftCents = left ? invoiceOwes(left) : 0;

  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
  const cash12 = draft ? db.payments.filter((p) => p.customerId === inv.customerId && p.method === "cash" && p.at >= yearAgo).reduce((a, p) => a + p.amountCents, 0) : 0;
  if (paid && draft)
    return (
      <Sheet
        visible={visible}
        onClose={close}
        title={`${t("rcpt.title")} ${paid.receiptNumber ?? ""}`.trim()}
        footer={
          <View testID="pay-receipt-buttons">
            <ButtonPair
              main={sendReceipt ? { label: "Отправить квитанцию", accessibilityLabel: t("w2m.rcpt.sendA11y"), icon: "send", onPress: () => { sendReceipt(); close(); }, testID: "pay-receipt-send" } : { label: t("w2m.rcpt.ok"), icon: "check", onPress: close, testID: "pay-receipt-done" }}
              second={null}
            />
          </View>
        }
      >
        <View testID="pay-receipt" style={{ gap: space[3] }}>
          <Card>
            <StatusNote tone="ok" v="heading">{t("w2m.rcpt.done")}</StatusNote>
            <View testID="pay-receipt-amount">
              <T v="display" tabular>
                {money(paid.amountCents)}
              </T>
            </View>
            <T v="caption" tone="mut" numberOfLines={2}>
              {t("w2m.rcpt.line", { way: t(`pay.${paid.method}` as DictKey), num: paid.receiptNumber ?? t("rcpt.pendingNumber"), date: day(paid.at) })}
            </T>
            <T v="caption" tone="mut">
              {leftCents > 0 ? t("w2m.rcpt.left", { amount: money(leftCents) }) : t("w2m.rcpt.paidFull")}
            </T>
          </Card>
          {cash12 > 1000000 ? (
            <View testID="pay-irs8300">
              <StatusNote tone="warn">{`Наличные от клиента за 12 мес — ${money(cash12)}, больше $10,000. Подайте форму IRS 8300 в течение 15 дней.`}</StatusNote>
              <View style={{ alignSelf: "flex-start" }}>
                <Button label="Что это?" icon="help" variant="ghost" size="sm" onPress={() => void Linking.openURL("https://www.irs.gov/form8300").catch(() => undefined)} testID="pay-irs8300-help" />
              </View>
            </View>
          ) : null}
          {sendReceipt ? (
            <T v="caption" tone="mut">
              {t("w2m.rcpt.lang", { lang: DOC_LANG_LABEL[lang] })}
            </T>
          ) : null}
        </View>
      </Sheet>
    );
  if (paid)
    return (
      <Sheet
        visible={visible}
        onClose={close}
        title={`${t("rcpt.title")} ${paid.receiptNumber ?? ""}`.trim()}
        footer={
          <View testID="pay-receipt-buttons">
            <ButtonPair
              main={sendReceipt ? { label: t("w2m.rcpt.send"), accessibilityLabel: t("w2m.rcpt.sendA11y"), icon: "send", onPress: () => { sendReceipt(); close(); }, testID: "pay-receipt-send" } : { label: t("w2m.rcpt.ok"), icon: "check", onPress: close, testID: "pay-receipt-done" }}
              second={sendReceipt ? { label: t("w2m.rcpt.ok"), onPress: close, testID: "pay-receipt-done" } : null}
            />
          </View>
        }
      >
        <View testID="pay-receipt" style={{ gap: space[3] }}>
          <Card status="ok">
            <RowView gap={space[2]}>
              <Icon name="check" color={c.status.ok.text} />
              <T v="heading" tone="ok">
                {t("w2m.rcpt.done")}
              </T>
            </RowView>
            <View testID="pay-receipt-amount">
              <T v="display" tabular>
                {money(paid.amountCents)}
              </T>
            </View>
            <T v="caption" tone="mut" numberOfLines={2}>
              {t("w2m.rcpt.line", { way: t(`pay.${paid.method}` as DictKey), num: paid.receiptNumber ?? t("rcpt.pendingNumber"), date: day(paid.at) })}
            </T>
            <T v="caption" tone="mut">
              {leftCents > 0 ? t("w2m.rcpt.left", { amount: money(leftCents) }) : t("w2m.rcpt.paidFull")}
            </T>
          </Card>
          {sendReceipt ? (
            <T v="caption" tone="mut">
              {t("w2m.rcpt.lang", { lang: DOC_LANG_LABEL[lang] })}
            </T>
          ) : null}
          <View testID="pay-receipt-undo" style={{ alignSelf: "flex-start" }}>
            <Button
              label={t("w2m.rcpt.undo")}
              icon="undo"
              variant="ghost"
              size="sm"
              onPress={() => {
                done?.undo();
                setDone(null);
              }}
            />
          </View>
        </View>
      </Sheet>
    );

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t("inv.takePayment")}
      footer={
        <View testID="pay-record">
          <Button
            label={t(way === "tap" ? "proto.money.pay.byCard" : "proto.money.pay.record", { amount: money(shown) })}
            icon={way === "tap" ? "wallet" : "check"}
            size="bar"
            full
            disabled={amount <= 0}
            onPress={record}
          />
        </View>
      }
    >
      <View testID="pay-sheet" style={{ gap: space[4] }}>
        <T v="caption" tone="mut" numberOfLines={1}>
          {t("proto.money.pay.of", { num: number, who })}
        </T>
        {fixed ? (
          <View testID="pay-owed">
            <T v="display" tabular>
              {bigAmount(balanceCents)}
            </T>
          </View>
        ) : (
          <View testID="pay-owed" style={{ gap: space[2] }}>
            <MoneyField big cents={amount} onChange={setAmount} label={t("proto.money.pay.amount")} testID="pay-amount" />
            {draftQuick.length > 1 ? (
              <Segmented<string>
                full
                equal
                radio
                label={t("w2m.pay.quick")}
                testID="pay-quick"
                value={draftQuick.find((q) => q.cents === amount)?.key ?? "own"}
                onChange={(k) => {
                  const q = draftQuick.find((x) => x.key === k);
                  if (q) setAmount(q.cents);
                }}
                items={draftQuick.map((q) => ({ key: q.key, label: q.label }))}
              />
            ) : null}
            {quick.length > 1 && !notStarted ? (
              // the quick amounts in one row (#2217): a tap puts the sum in the field; the one that matches is shown chosen
              <Segmented<QuickKey | "own">
                full
                equal
                radio
                label={t("w2m.pay.quick")}
                testID="pay-quick"
                value={chosen ?? "own"}
                onChange={(k) => {
                  const q = quick.find((x) => x.key === k);
                  if (q) setAmount(q.cents);
                }}
                items={quick.map((q) => ({ key: q.key, label: t(QUICK_LABEL[q.key]) }))}
              />
            ) : null}
            <T v="caption" tone="mut" numberOfLines={1}>
              {t("w2m.pay.of", { amount: money(balanceCents) })}
            </T>
            {notStarted && amount > caLimit && job ? (
          <View testID="pay-ca-limit">
            <StatusNote tone="warn">{`Больше предела до начала работ: в Калифорнии — не больше ${money(caLimit)} (меньшее из $1,000 и 10 % от договора ${money(job.amountCents)}). Записать можно.`}</StatusNote>
          </View>
        ) : null}
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
        {(way === "check" || way === "zelle") && !fixed ? (
          <TextField type="identifier" value={ref} onChangeText={setRef} label={t("inv.reference")} placeholder={t("proto.money.pay.ref")} />
        ) : null}
        {payLink ? (
          <ListGroup inset={space[4]}>
            <GroupRow compact testID="pay-link-sms" title={`${t("proto.money.pay.link")} ›`} onPress={payLink} />
          </ListGroup>
        ) : null}
        {amount > balanceCents ? <StatusNote tone="warn">{t("inv.capped", { max: money(balanceCents) })}</StatusNote> : null}
      </View>
    </Sheet>
  );
}
