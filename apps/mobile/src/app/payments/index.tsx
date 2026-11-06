import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { Payment, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { asPaymentPeriod, canSeePayments, PAYMENT_PERIODS, paymentsIn, type PaymentPeriod } from "@/features/moneyLists";
import { useDevice } from "@/theme/ThemeProvider";
import { ChoiceChips, Segmented } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";

const PERIOD: Record<PaymentPeriod, DictKey> = { today: "mny.p.today", week: "mny.p.week", month: "mny.p.month", all: "mny.p.all" };
const METHODS: PaymentMethod[] = ["card", "cash", "check", "zelle"];
/** desktop row columns */
const COLUMNS: FactKey[] = ["receipt", "method", "by"];

/**
 * «Ещё» → Оплаты (wave 8, 13 §3.15): payments of a period with their receipts. Payment → receipt → invoice → job → client.
 * Owner, admin and office only (13 §4); refunds and voiding — «Запуск».
 */
export default function Payments() {
  const { p: pParam, m } = useLocalSearchParams<{ p?: string; m?: string }>();
  const { db, role } = useStore();
  const { t, money, moneyWhole, day } = useI18n();
  const { device } = useDevice();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  if (!canSeePayments(role))
    return (
      <Screen title={t("mny.payments.title")} back={back}>
        <Empty icon="wallet" title={t("mny.noAccess")} />
      </Screen>
    );
  const p = asPaymentPeriod(pParam);
  const method = (METHODS as string[]).includes(m ?? "") ? (m as PaymentMethod) : undefined;
  const v = paymentsIn(db, p, method);
  const all = paymentsIn(db, p);
  const card = (x: Payment) => {
    const c = db.customers.find((y) => y.id === x.customerId);
    const inv = db.invoices.find((i) => i.id === x.invoiceId);
    return (
      <ListCard
        key={x.id}
        title={c?.name ?? "—"}
        when={day(x.at)}
        lead={{ kind: "icon", icon: "wallet" }}
        // money on a card without cents (list cards rule); the receipt has the exact amount
        value={`+${moneyWhole(x.amountCents)}`}
        valueTone="ok"
        valueLabel={t("card.val.paid")}
        tags={x.refundedCents ? [t("mny.refunded", { amount: money(x.refundedCents) })] : undefined}
        facts={{
          receipt: x.receiptNumber,
          method: [t(`pay.${x.method}` as DictKey), x.reference === "stripe-simulated" ? t("pay.testMode") : x.reference].filter(Boolean).join(" · "),
          by: x.receivedBy ? db.members.find((y) => y.id === x.receivedBy)?.name : undefined,
          links: inv?.number,
        }}
        // contact buttons only open the phone / mail: nothing is written
        contact={{ phone: c?.phone, email: c?.email }}
        density={device === "desktop" ? "row" : "rich"}
        columns={COLUMNS}
        onPress={() => router.push(`/receipt/${x.id}`)}
      />
    );
  };
  return (
    <Screen title={t("mny.payments.title")} back={back} help={t("mny.payments.help")} hintKey="payments">
      <Segmented<PaymentPeriod> scroll value={p} onChange={(x) => router.setParams({ p: x })} items={PAYMENT_PERIODS.map((k) => ({ key: k, label: t(PERIOD[k]) }))} />
      <Card>
        <T v="caption" tone="mut">{t("mny.collected", { n: all.items.length })}</T>
        <T v="display" tabular>{money(all.totalCents)}</T>
      </Card>
      {all.byMethod.length > 1 ? (
        <ChoiceChips<string>
          value={method ?? "all"}
          onChange={(k) => router.setParams({ m: k === "all" ? "" : k })}
          items={[
            { key: "all", label: `${t("mny.method.all")} · ${moneyWhole(all.totalCents)}` },
            ...all.byMethod.map((b) => ({ key: b.key, label: `${t(`pay.${b.key}` as DictKey)} · ${moneyWhole(b.cents)}` })),
          ]}
        />
      ) : null}
      {v.items.length === 0 ? (
        <Empty icon="wallet" title={t("mny.payments.empty")} />
      ) : device === "tablet" ? (
        <CardGrid>{v.items.map(card)}</CardGrid>
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={COLUMNS} value={t("card.val.paid")} /> : null}
          <CardList>{v.items.map(card)}</CardList>
        </>
      )}
    </Screen>
  );
}
