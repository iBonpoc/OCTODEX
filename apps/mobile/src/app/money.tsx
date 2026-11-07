import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Expense, Invoice, PaymentMethod } from "@/data/types";
import { CardGrid, ListCard } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { dayKeyIn, getZone, zonedFormat } from "@/features/zone";
import { memberName } from "@/features/team";
import { matchExpense } from "@/features/moneyLists";

/** desktop row columns for expenses */
const EXP_COLUMNS: FactKey[] = ["work", "by"];
/** the month of an expense on the company's calendar (П4b), not the UTC month of its moment */
const monthKey = (iso: string) => dayKeyIn(iso).slice(0, 7);
const monthOf = (iso: string) => zonedFormat(getZone(), { month: "long", year: "numeric" }).format(new Date(iso));

/** Owner's money view: overdue → awaiting → paid. Manual payments now, Stripe in wave 4. */
export default function Money() {
  const { t, money, day } = useI18n();
  const { db } = useStore();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const { device } = useDevice();
  // expenses by month, newest first; dates in US format (rule 7)
  // the search (spec 31, one rule): vendor, category, work, client, who paid; not kept
  const [q, setQ] = useState("");
  const shown = db.expenses.filter((x) => matchExpense(db, x, q, t(`exp.cat.${x.category}`)));
  const months = [...shown.slice().sort((a, b) => b.at.localeCompare(a.at)).reduce((m, x) => m.set(monthKey(x.at), [...(m.get(monthKey(x.at)) ?? []), x]), new Map<string, Expense[]>())];
  /** an expense has no screen to open yet: the card has no tap and no contact buttons, nothing is written from it */
  const expenseCard = (x: Expense) => {
    const job = x.jobId ? db.jobs.find((j) => j.id === x.jobId) : undefined;
    const client = job ? db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId) : undefined;
    return (
      <ListCard
        key={x.id}
        title={x.vendor}
        when={day(x.at)}
        lead={{ kind: "icon", icon: x.receiptUri ? "camera" : "dollar" }}
        value={`−${money(x.amountCents)}`}
        // category first, «no receipt» as a grey tag: not a status (map §5 has no expense status)
        tags={[t(`exp.cat.${x.category}`), ...(x.receiptUri ? [] : [t("card.tag.noReceipt")])]}
        facts={{ work: job ? [job.title, client?.name].filter(Boolean).join(" · ") : t("card.noJob"), by: memberName(db, x.memberId, t) }}
        density={device === "desktop" ? "row" : "rich"}
        columns={EXP_COLUMNS}
      />
    );
  };

  return (
    <Screen
      // «Расходы» only: invoices are a section of their own, /invoice (founder 07.11, spec 31 §7а)
      title={t("nav.expenses")}
      help={t("help.money")}
      hintKey="money"
      back={back}
      right={<Button label={t("money.addExpense")} icon="plus" size="sm" variant="secondary" onPress={() => router.push("/expense/new")} />}
    >
      {db.expenses.length === 0 ? <Empty icon="wallet" title={t("money.expenses")} /> : null}
      {db.expenses.length ? (
        <View style={{ gap: space[3] }}>
          <FilterBar<string> items={[]} value="" onChange={() => undefined} search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchExpenses") }} />
          <SectionTitle title={`${t("money.expenses")} · ${money(shown.reduce((s, x) => s + x.amountCents, 0))}`} />
          {shown.length === 0 ? <Empty icon="search" title={t("card.emptyFilter")} /> : null}
          {months.map(([m, xs]) => (
            <View key={m} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${monthOf(xs[0]!.at)} · ${money(xs.reduce((s, x) => s + x.amountCents, 0))}`}</T>
              {device === "tablet" ? <CardGrid>{xs.map(expenseCard)}</CardGrid> : <CardList>{xs.map(expenseCard)}</CardList>}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
