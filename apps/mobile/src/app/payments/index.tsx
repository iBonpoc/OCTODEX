import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { DB, Payment, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { asPaymentPeriod, canSeePayments, PAYMENT_PERIODS, paymentsIn, type PaymentPeriod } from "@/features/moneyLists";
import { useDevice } from "@/theme/ThemeProvider";
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

/** the search of «Оплаты»: the client's name, the receipt number, the invoice number */
function matchPayment(db: Pick<DB, "customers" | "invoices">, x: Payment, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const c = db.customers.find((y) => y.id === x.customerId);
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  return [c?.name, x.receiptNumber, inv?.number].some((s) => (s ?? "").toLowerCase().includes(needle));
}

/**
 * «Ещё» → Оплаты (wave 8, 13 §3.15): payments of a period with their receipts. Payment → receipt → invoice → job → client.
 * Owner, admin and office only (13 §4); refunds and voiding — «Запуск».
 */
export default function Payments() {
  const { p: pParam, m } = useLocalSearchParams<{ p?: string; m?: string }>();
  const { db, role } = useStore();
  // the search is not kept (spec 31 §6 п.7)
  const [q, setQ] = useState("");
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
  const found = paymentsIn(db, p, method);
  // the search: the client, the receipt RCT-…, the invoice INV-…
  const v = { ...found, items: found.items.filter((x) => matchPayment(db, x, q)) };
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
        // the server asks the owner to look (an online payment above the balance, a failed refund — spec 35 §2 п.7, 20д)
        status={x.needsReview ? { tone: "warn", label: t("mny.refund.review") } : undefined}
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
      {/* spec 31, one rule (founder 07.11): the magnifier, the periods as the lane (one at a time, with the number of
          payments), the method in the «Фильтр» sheet; the period and the method live in the address (?p=, ?m=) */}
      <FilterBar<PaymentPeriod>
        search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchPayments") }}
        items={PAYMENT_PERIODS.map((k) => ({ key: k, label: t(PERIOD[k]), count: paymentsIn(db, k).items.length }))}
        value={p}
        onChange={(x) => router.setParams({ p: x })}
        groups={
          all.byMethod.length > 1
            ? [
                {
                  key: "method",
                  title: t("card.filter.method"),
                  options: all.byMethod.map((b) => ({ key: b.key, label: `${t(`pay.${b.key}` as DictKey)} · ${moneyWhole(b.cents)}`, count: all.items.filter((x) => x.method === b.key).length, on: method === b.key })),
                  onToggle: (k) => router.setParams({ m: method === k ? "" : k }),
                },
              ]
            : []
        }
        onReset={() => router.setParams({ m: "" })}
      />
      <Card>
        <T v="caption" tone="mut">{t("mny.collected", { n: all.items.length })}</T>
        <T v="display" tabular>{money(all.totalCents)}</T>
      </Card>
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
