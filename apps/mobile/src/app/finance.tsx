import { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { rhythm } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeEstimate } from "@/features/access";
import { canSeePayments } from "@/features/moneyLists";
import { useMoneyCreate } from "@/features/moneyTabs";
import { dueWord, moneyOverview } from "@/features/payments/overview";
import { todayKey } from "@/features/calendar";
import { formatDayKey } from "@/features/zone";
import { useSearchIcon } from "@/nav/HeaderIcons";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { Sheet } from "@/ui/overlays";
import { Icon } from "@/ui/primitives";
import { StatGrid, StatTile } from "@/ui/statTile";
import { ListRow, Screen } from "@/ui/surfaces";
import { CreateButton } from "@/ui/templates/parts";

/** at most this many rows in «К оплате» and «Оплачены сегодня»: the rest is behind «Все ›» */
const SHOWN = 3;

/**
 * «Деньги» — the tab's overview (visual-v2 «Макеты 390 × 844» №6, образец №3 «Overview»). The root header: the avatar, search ·
 * the lists · «＋», «Ноябрь 2026 · Демо» over «Деньги». The one yellow of the screen — the tile «Должны · счета» (it opens
 * «Счета»); «Сметы открыты» beside it; «Сегодня · Расходы, нед. · Задатки» three small ones; «К оплате» — the live invoices,
 * «Срок / Сумма» on the right, an overdue one says «−9 дн» in the bad word, not a fill; «Оплачены сегодня» — «Способ / Сумма».
 * The lists «Сметы · Счета · Оплаты» (their segment) are behind the tiles and «Все ›»; «Расходы» — behind its tile.
 */
export default function Finance() {
  const { db, role, mode } = useStore();
  const { t, tn, money, moneyWhole, time, lang } = useI18n();
  const search = useSearchIcon();
  const { create, onCreate } = useMoneyCreate();
  const [lists, setLists] = useState(false);
  const pay = canSeePayments(role);
  const shownEst = db.estimates.filter((e) => canSeeEstimate(db, { role, mode, me: db.me }, e.id));
  const o = moneyOverview(db, shownEst);
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  // «Ноябрь 2026»: the month's own name and the year (ru «ноябрь 2026 г.» of Intl carries a «г.» the mockup has not)
  const m = formatDayKey(todayKey(), { month: "long" }, loc);
  const month = `${m.charAt(0).toUpperCase()}${m.slice(1)} ${todayKey().slice(0, 4)}`;
  const name = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const jobTitle = (id: string | null | undefined) => (id ? db.jobs.find((j) => j.id === id)?.title : undefined);
  const go = (href: string) => router.push(href as Href);
  const listItems: { key: string; label: string; href: string; icon: "doc" | "invoice" | "wallet" | "dollar" }[] = [
    { key: "estimates", label: t("sales.estimates"), href: "/estimates", icon: "doc" },
    { key: "invoices", label: t("nav.invoices"), href: "/invoice", icon: "invoice" },
    ...(pay ? [{ key: "payments", label: t("mny.payments.title"), href: "/payments", icon: "dollar" as const }] : []),
    ...(pay ? [{ key: "expenses", label: t("nav.expenses"), href: "/money", icon: "wallet" as const }] : []),
  ];
  // #2363 q77 (founder: Б): «Должны» is a neutral tile — the overdue count is a status word with its icon, not a yellow fill
  const owedSub = tn("todayR.invN", o.owed.n);
  const owedNote = o.owed.overdue ? { tone: "bad" as const, text: tn("px3.money.overdue", o.owed.overdue) } : undefined;
  // #2363 F45: «3 сметы · 3 ждут ответа» said the same twice — when every open estimate waits, only «3 ждут ответа»
  const estSub = o.estimates.waiting && o.estimates.waiting === o.estimates.n
    ? tn("px3.money.waitN", o.estimates.waiting)
    : [tn("px3.money.estN", o.estimates.n), o.estimates.waiting ? tn("px3.money.waitN", o.estimates.waiting) : null].filter(Boolean).join(" · ");
  return (
    <Screen
      testID="money-overview"
      title={t("nav.money")}
      head={{ kind: "root", kicker: month }}
      headerIcons={[
        { ...search, a11y: t("px3.money.search"), testID: "money-search" },
        { icon: "sliders", a11y: t("px3.money.lists"), onPress: () => setLists(true), testID: "money-lists" },
      ]}
      right={<CreateButton create={{ ...create, items: [...create.items, ...(pay ? [{ key: "expense", label: t("money.addExpense"), icon: "wallet" as const, testID: "money-add-expense" }] : [])] }} onCreate={(k) => (k === "expense" ? go("/expense/new") : onCreate(k))} testID="money-create" />}
    >
      <View style={{ gap: rhythm.blockGap }}>
        <View style={{ gap: rhythm.cardGap }}>
          {/* a $0 tile is not drawn (StatTile): the rest keep their places */}
          <StatGrid testID="money-tiles">
            <StatTile testID="money-tile-owed" icon="dollar" label={t("px3.money.owed")} value={moneyWhole(o.owed.cents)} sub={owedSub} subNote={owedNote} onPress={() => go("/invoice")} />
            <StatTile testID="money-tile-estimates" icon="doc" label={t("px3.money.est")} value={moneyWhole(o.estimates.cents)} sub={estSub} onPress={() => go("/estimates")} />
          </StatGrid>
          <StatGrid cols={3} testID="money-tiles-small">
            <StatTile testID="money-tile-today" icon="trend" label={t("px3.money.today")} value={moneyWhole(o.today.cents)} onPress={pay ? () => go("/payments") : undefined} />
            {pay ? <StatTile testID="money-tile-spent" icon="invoice" label={t("px3.money.spentWeek")} value={moneyWhole(o.expensesWeek.cents)} onPress={() => go("/money")} /> : null}
            <StatTile testID="money-tile-deposits" icon="wallet" label={t("px3.money.deposits")} value={moneyWhole(o.deposits.cents)} onPress={pay ? () => go("/payments") : undefined} />
          </StatGrid>
        </View>
        {/* #2363 F20/F29: the money lists are rows of ONE card (rule 12), one row height for every list */}
        <ListGroup testID="money-topay" title={t("px3.money.toPay")} all={{ label: t("proto.money.all"), onPress: () => go("/invoice"), testID: "money-topay-all" }}>
          {o.toPay.slice(0, SHOWN).map((x) => {
            const d = dueWord(x.dueIn);
            return (
              <GroupRow
                key={x.inv.id}
                testID={`money-topay-${x.inv.id}`}
                lead={{ icon: "doc" }}
                title={name(x.inv.customerId)}
                subtitle={[x.inv.number, jobTitle(x.inv.jobId) ?? x.inv.title].filter(Boolean).join(" · ")}
                cols={[
                  { label: t("w2m.col.due"), value: t(d.key, { d: d.d }), tone: d.late ? "bad" : undefined },
                  { label: t("w2m.col.sum"), value: moneyWhole(x.owesCents) },
                ]}
                onPress={() => go(`/invoice/${x.inv.id}`)}
              />
            );
          })}
        </ListGroup>
        {pay ? (
          <ListGroup testID="money-paid" title={t("px3.money.paidToday")} count={o.paidToday.length}>
            {o.paidToday.slice(0, SHOWN).map((x) => {
              const inv = db.invoices.find((i) => i.id === x.invoiceId);
              const how = t(`pay.${x.method}` as DictKey);
              return (
                <GroupRow
                  key={x.id}
                  testID={`money-paid-${x.id}`}
                  lead={{ icon: "check" }}
                  title={name(x.customerId)}
                  // #2363 F44: the way is the column «Способ» («Чек», «Zelle» — as the dictionary writes it); the line does not repeat it
                  subtitle={[inv?.number, time(x.at)].filter(Boolean).join(" · ")}
                  cols={[
                    { label: t("w2m.col.way"), value: how },
                    { label: t("w2m.col.sum"), value: money(x.amountCents) },
                  ]}
                  onPress={() => go(`/receipt/${x.id}`)}
                />
              );
            })}
          </ListGroup>
        ) : null}
      </View>
      <Sheet visible={lists} onClose={() => setLists(false)} title={t("px3.money.lists")}>
        {/* a menu of a sheet — ListRow rows (rule 12) */}
        <View>
          {listItems.map((x) => (
            <View key={x.key} testID={`money-list-${x.key}`}>
              <ListRow
                title={x.label}
                left={<Icon name={x.icon} />}
                onPress={() => {
                  setLists(false);
                  go(x.href);
                }}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
