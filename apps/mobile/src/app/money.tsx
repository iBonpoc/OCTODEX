import { useState } from "react";
import { expenseDay } from "@/features/expenseForm";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { hasReceipt } from "@/data/photoUpload";
import type { Expense, Invoice, PaymentMethod } from "@/data/types";
import { CardGrid, ListCard } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { useI18n, type Lang } from "@/i18n";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { formatDayKey } from "@/features/zone";
import { memberName } from "@/features/team";
import { matchExpense } from "@/features/moneyLists";

/** desktop row columns for expenses */
const EXP_COLUMNS: FactKey[] = ["work", "by"];
/** the month of an expense on the company's calendar (П4b), not the UTC month of its moment */
/** the month's name in the app's language, as «План» and the date picker write it (#1427 041: not «November 2026» in RU) */
const monthOf = (key: string, lang: Lang) => {
  const s = formatDayKey(`${key}-01`, { month: "long", year: "numeric" }, lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Owner's money view: overdue → awaiting → paid. Manual payments now, Stripe in wave 4. */
export default function Money() {
  const { t, money, dayOf, lang } = useI18n();
  const { db } = useStore();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const { device } = useDevice();
  // expenses by month, newest first; dates in US format (rule 7)
  // the search (spec 31, one rule): vendor, category, work, client, who paid; not kept
  const [q, setQ] = useState("");
  const shown = db.expenses.filter((x) => matchExpense(db, x, q, t(`exp.cat.${x.category}`)));
  // #2008: by the receipt's day (an expense entered today for last month's receipt is last month's)
  const months = [...shown.slice().sort((a, b) => expenseDay(b).localeCompare(expenseDay(a)) || b.at.localeCompare(a.at)).reduce((m, x) => m.set(expenseDay(x).slice(0, 7), [...(m.get(expenseDay(x).slice(0, 7)) ?? []), x]), new Map<string, Expense[]>())];
  /** #2009: the card opens the expense's own screen (fix, remove); no contact buttons */
  const expenseCard = (x: Expense) => {
    const job = x.jobId ? db.jobs.find((j) => j.id === x.jobId) : undefined;
    const client = job ? db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId) : undefined;
    // a receipt on this phone, or taken by the cloud (#1538: after a reload and on another phone); refused — said so
    const receipt = hasReceipt(x);
    return (
      <ListCard
        key={x.id}
        onPress={() => router.push(`/expense/${x.id}`)}
        title={x.vendor}
        when={dayOf(expenseDay(x))}
        lead={{ kind: "icon", icon: receipt ? "camera" : "dollar" }}
        value={`−${money(x.amountCents)}`}
        // category first, «no receipt» as a grey tag: not a status (map §5 has no expense status)
        tags={[t(`exp.cat.${x.category}`), ...(receipt ? [] : [t(x.receiptFailed ? "photoUp.chip" : "card.tag.noReceipt")])]}
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
              <T v="caption" w="semibold" tone="mut">{`${monthOf(m, lang)} · ${money(xs.reduce((s, x) => s + x.amountCents, 0))}`}</T>
              {device === "tablet" ? <CardGrid>{xs.map(expenseCard)}</CardGrid> : <CardList>{xs.map(expenseCard)}</CardList>}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
