import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { Payment, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { asPaymentPeriod, canSeePayments, PAYMENT_PERIODS, paymentsIn, type PaymentPeriod } from "@/features/moneyLists";
import { useDevice } from "@/theme/ThemeProvider";
import { Segmented } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { memberName } from "@/features/team";

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
          by: memberName(db, x.receivedBy, t),
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
      {/* spec 31 §7: the period stays the switch (5 segments, HIG ≤ 5); the method went to the sheet — one at a time,
          it lives in the address (?m=) like the period */}
      {all.byMethod.length > 1 ? (
        <FilterBar<string>
          items={[]}
          value=""
          onChange={() => undefined}
          groups={[
            {
              key: "method",
              title: t("card.filter.method"),
              options: all.byMethod.map((b) => ({ key: b.key, label: `${t(`pay.${b.key}` as DictKey)} · ${moneyWhole(b.cents)}`, count: all.items.filter((x) => x.method === b.key).length, on: method === b.key })),
              onToggle: (k) => router.setParams({ m: method === k ? "" : k }),
            },
          ]}
          onReset={() => router.setParams({ m: "" })}
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
