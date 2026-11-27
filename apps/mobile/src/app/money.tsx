import { useState } from "react";
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
import { FilterBar, useFilterHeader } from "@/ui/filterBar";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { dayKeyIn, formatDayKey } from "@/features/zone";
import { memberName } from "@/features/team";
import { matchExpense } from "@/features/moneyLists";

/** desktop row columns for expenses */
const EXP_COLUMNS: FactKey[] = ["work", "by"];
/** the month of an expense on the company's calendar (П4b), not the UTC month of its moment */
const monthKey = (iso: string) => dayKeyIn(iso).slice(0, 7);
/** the month's name in the app's language, as «План» and the date picker write it (#1427 041: not «November 2026» in RU) */
const monthOf = (key: string, lang: Lang) => {
  const s = formatDayKey(`${key}-01`, { month: "long", year: "numeric" }, lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Owner's money view: overdue → awaiting → paid. Manual payments now, Stripe in wave 4. */
export default function Money() {
  const { t, money, day, lang } = useI18n();
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
    // a receipt on this phone, or taken by the cloud (#1538: after a reload and on another phone); refused — said so
    const receipt = hasReceipt(x);
    return (
      <ListCard
        key={x.id}
        title={x.vendor}
        when={day(x.at)}
        lead={{ kind: "icon", icon: receipt ? "camera" : "dollar" }}
        value={`−${money(x.amountCents)}`}
        // category first, «no receipt» as a grey tag: not a status (map §5 has no expense status)
        tags={[t(`exp.cat.${x.category}`), ...(x.receiptFailed === "preparing" ? [t("photoUp.prep.chip")] : receipt ? [] : [t(x.receiptFailed ? "photoUp.chip" : "card.tag.noReceipt")])]}
        facts={{ work: job ? [job.title, client?.name].filter(Boolean).join(" · ") : t("card.noJob"), by: memberName(db, x.memberId, t) }}
        density={device === "desktop" ? "row" : "rich"}
        columns={EXP_COLUMNS}
      />
    );
  };

  // #3031: the search is the header's first circle on a phone / tablet (one place on every list); 1280 keeps the field in the row
  const fh = useFilterHeader({ search: { value: q }, testID: "expenses" });
  const filterHead = device === "desktop" ? undefined : fh;
  return (
    <Screen
      headerIcons={filterHead?.icons}
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
          <FilterBar<string> header={filterHead?.state} items={[]} value="" onChange={() => undefined} search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchExpenses") }} />
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
