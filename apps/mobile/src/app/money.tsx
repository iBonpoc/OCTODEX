import { useState } from "react";
import { HeaderButton } from "@/ui/headerIcon";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { hasReceipt } from "@/data/photoUpload";
import type { Expense, Invoice, PaymentMethod } from "@/data/types";
import { sumCents } from "@octo/estimating-engine";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { useI18n, type Lang } from "@/i18n";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { dayKeyIn, formatDayKey } from "@/features/zone";
import { memberName } from "@/features/team";
import { matchExpense } from "@/features/moneyLists";

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

  // expenses by month, newest first; dates in US format (rule 7)
  // the search (spec 31, one rule): vendor, category, work, client, who paid; not kept
  const [q, setQ] = useState("");
  const shown = db.expenses.filter((x) => matchExpense(db, x, q, t(`exp.cat.${x.category}`)));
  const months = [...shown.slice().sort((a, b) => b.at.localeCompare(a.at)).reduce((m, x) => m.set(monthKey(x.at), [...(m.get(monthKey(x.at)) ?? []), x]), new Map<string, Expense[]>())];
  /**
   * Lists B (#2992): an expense is a row of its month's group (rule 12) — the category's icon (a camera when the receipt is in) ·
   * the vendor, «вид · день · работа · кто» · on the right −sum, under it «Без чека» (grey: not a status of the map §5, a fact).
   * An expense has no screen to open yet: no tap, nothing is written from it.
   */
  const expenseRow = (x: Expense) => {
    const job = x.jobId ? db.jobs.find((j) => j.id === x.jobId) : undefined;
    const client = job ? db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId) : undefined;
    // a receipt on this phone, or taken by the cloud (#1538: after a reload and on another phone); refused — said so
    const receipt = hasReceipt(x);
    const mark = x.receiptFailed === "preparing" ? t("photoUp.prep.chip") : receipt ? undefined : t(x.receiptFailed ? "photoUp.chip" : "card.tag.noReceipt");
    return (
      <GroupRow
        key={x.id}
        testID={`expense-row-${x.id}`}
        title={x.vendor}
        subtitle={[t(`exp.cat.${x.category}`), day(x.at), job ? [job.title, client?.name].filter(Boolean).join(" · ") : undefined, memberName(db, x.memberId, t)].filter(Boolean).join(" · ")}
        lead={{ icon: receipt ? "camera" : "dollar" }}
        value={`−${money(x.amountCents)}`}
        status={mark ? { status: "neutral", label: mark } : undefined}
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
      right={<HeaderButton icon="plus" label={t("money.newExpense")} testID="expense-new" onPress={() => router.push("/expense/new")} />}
    >
      {db.expenses.length === 0 ? <Empty icon="wallet" title={t("money.expenses")} /> : null}
      {db.expenses.length ? (
        <View style={{ gap: space[3] }}>
          <FilterBar<string> items={[]} value="" onChange={() => undefined} search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchExpenses") }} />
          {shown.length === 0 ? <Empty icon="search" title={t("card.emptyFilter")} /> : null}
          {/* one total per month — the group's title (P23: «Расходы · $X» over «Ноябрь · $X» said it twice) */}
          <GroupedList testID="expenses-list">
            {months.map(([m, xs]) => (
              <ListGroup key={m} title={`${monthOf(m, lang)} · −${money(sumCents(xs.map((x) => x.amountCents)))}`} testID={`expenses-month-${m}`}>
                {xs.map(expenseRow)}
              </ListGroup>
            ))}
          </GroupedList>
        </View>
      ) : null}
    </Screen>
  );
}
