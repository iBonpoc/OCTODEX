import { useState } from "react";
import { router } from "expo-router";
import { sumCents } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import { shortAddress } from "@/features/shortAddress";
import { memberName } from "@/features/team";
import type { Advance, DB, Payment } from "@/data/types";
import { ADVANCES_COLLECTED } from "@/features/payments/collected";
import { useI18n, type DictKey } from "@/i18n";
import { canSeePayments, paymentsIn } from "@/features/moneyLists";
import { initialsOf } from "@/features/invoice/moneySummary";
import { MoneyTotal, useMoneyChips, useMoneyCreate } from "@/features/moneyTabs";
import type { GroupRowProps } from "@/ui/groupedList";
import { Empty, Screen } from "@/ui/surfaces";
import { ListScreen } from "@/ui/templates";

/** the search of «Оплаты»: the client's name, the receipt number, the invoice number */
function matchPayment(db: Pick<DB, "customers" | "invoices">, x: Payment, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const c = db.customers.find((y) => y.id === x.customerId);
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  return [c?.name, x.receiptNumber, inv?.number].some((s) => (s ?? "").toLowerCase().includes(needle));
}

type When = "today" | "week" | "month" | "earlier";
const WHEN: When[] = ["today", "week", "month", "earlier"];
const WHEN_TITLE: Record<When, DictKey> = { today: "proto.money.g.today", week: "proto.money.g.week", month: "proto.money.g.month", earlier: "proto.money.g.earlier" };

/**
 * «Деньги → Оплаты» — the List template (prototype v2 #2350, BUILD-SPEC §2.9): what came in, each with its receipt.
 * Payment → receipt → invoice → job → client. Owner, admin, office only (13 §4).
 * «Деньги» · search · «＋» → «Сметы · Счета · Оплаты» → one line «Получено» (MoneyTotal, #2993) → groups by the company's days «Сегодня · На этой неделе ·
 * В этом месяце · Раньше» with their sums (no period filter to set: the groups are the periods) → rows 56: initials, the client,
 * «способ · номер · день · INV», the sum once. Advances without an invoice — their own group, outside the sums (spec 35 §4г).
 */
export default function Payments() {
  const { db, role } = useStore();
  const [q, setQ] = useState("");
  const { t, money, day, time } = useI18n();
  const chips = useMoneyChips("payments");
  const { create, onCreate } = useMoneyCreate();
  if (!canSeePayments(role))
    return (
      <Screen title={t("nav.money")}>
        <Empty icon="wallet" title={t("mny.noAccess")} />
      </Screen>
    );
  // the periods by the company's day (moneyLists.paymentsIn): each payment in the first one that holds it
  const ids = { today: paymentsIn(db, "today"), week: paymentsIn(db, "week"), month: paymentsIn(db, "month") };
  const whenOf = (x: Payment): When => (WHEN.slice(0, 3) as Exclude<When, "earlier">[]).find((w) => ids[w].items.some((y) => y.id === x.id)) ?? "earlier";
  const all = paymentsIn(db, "all").items.filter((x) => matchPayment(db, x, q));
  const groups = WHEN.map((w) => {
    const rows = all.filter((x) => whenOf(x) === w);
    return { key: w, title: `${t(WHEN_TITLE[w])} · ${money(sumCents(rows.map((x) => x.amountCents)))}`, rows: rows as (Payment | Advance)[] };
  });
  // spec 35 §4г: the clients' advances (no invoice) — their own group, outside every sum while they are «to check»
  const advances = ADVANCES_COLLECTED ? [] : (db.advances ?? []).filter((x) => matchPayment(db, { ...x, invoiceId: "" }, q));
  if (advances.length) groups.push({ key: "advances" as When, title: t("proto.money.g.advances"), rows: advances });
  const row = (x: Payment | Advance): GroupRowProps & { key: string } => {
    const c = db.customers.find((y) => y.id === x.customerId);
    const inv = "invoiceId" in x ? db.invoices.find((i) => i.id === x.invoiceId) : undefined;
    const ref = x.reference === "stripe-simulated" ? t("pay.testMode") : x.reference;
    const review = "needsReview" in x && x.needsReview ? t("mny.refund.review") : undefined;
    // how it was paid once: a reference that already names the way («Check #1042») stands alone
    const how = t(`pay.${x.method}` as DictKey);
    const way = ref && (ref.toLowerCase().includes(x.method) || ref.toLowerCase().includes(how.toLowerCase())) ? ref : [how, ref].filter(Boolean).join(" ");
    // #2992 (lists B): the sum alone on the right; the way («Чек #1042», «Zelle») leads the line, then the day and the invoice
    // the group «Сегодня» already says the day (layout review 27.11, Д-строка-5)
    // #3018 (founder #3017): 1 — the client · the way («Check #1042»); 2 — the address; 3 — the invoice · when · who took it
    const prop = db.properties.find((p) => p.customerId === x.customerId);
    const who = "receivedBy" in x && x.receivedBy ? memberName(db, x.receivedBy, t) : undefined;
    const sub = [review, inv?.number, whenOf(x as Payment) === "today" ? time(x.at) : day(x.at), who, x.refundedCents ? t("mny.refunded", { amount: money(x.refundedCents) }) : undefined];
    return {
      key: x.id,
      testID: `payment-row-${x.id}`,
      title: c?.name ?? "—",
      titleNote: way || undefined,
      subtitle: prop ? shortAddress(prop.address, prop.city) : undefined,
      extra: sub.filter(Boolean).join(" · ") || undefined,
      figureRight: true,
      lead: { initials: initialsOf(c?.name) },
      value: money(x.amountCents),
      onPress: () => router.push(`/receipt/${x.id}`),
    };
  };
  return (
    <ListScreen
      testID="payments-list"
      // #3018 (founder #3017): each payment its own card
      separate
      title={t("nav.money")}
      search={{ placeholder: t("card.filter.searchPayments"), value: q, onChange: setQ }}
      chips={chips}
      chipsAs="segment"
      filters={<MoneyTotal tab="payments" />}
      create={create}
      onCreate={onCreate}
      groups={groups}
      row={row}
      empty={<Empty icon="wallet" title={t("mny.payments.empty")} />}
    />
  );
}
