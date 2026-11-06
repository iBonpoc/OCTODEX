import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { INV_COLUMNS, InvoiceListCard } from "@/features/listCards";
import { asInvoiceFilter, canSeeInvoiceList, INVOICE_FILTERS, invoiceList, type InvoiceFilter, type OwedGroup } from "@/features/moneyLists";
import { useDevice } from "@/theme/ThemeProvider";
import { Button, ChoiceChips } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCardHeader } from "@/ui/listCard";

const CHIP: Record<InvoiceFilter, DictKey> = { owed: "mny.f.owed", paid: "mny.f.paid", all: "mny.f.all" };
const GROUP: Record<OwedGroup, DictKey> = { overdue: "mny.g.overdue", waiting: "mny.g.waiting", paid: "mny.g.paid" };
const EMPTY: Record<InvoiceFilter, DictKey> = { owed: "mny.empty.owed", paid: "mny.empty.paid", all: "mny.empty.all" };

/**
 * «Ещё» → Счета (wave 8, docs/specs/18-money-reports.md §7): the one path to debts. «Не оплачен · Просрочен» by default;
 * «Ждёт оплаты» on Today and «Должен» on a client open the same list (`?f=owed`, `&customer=<id>`).
 */
export default function Invoices() {
  const { f: fParam, customer } = useLocalSearchParams<{ f?: string; customer?: string }>();
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { device } = useDevice();
  const f = asInvoiceFilter(fParam);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  if (!canSeeInvoiceList(role))
    return (
      <Screen title={t("nav.invoices")} back={back}>
        <Empty icon="invoice" title={t("mny.noAccess")} />
      </Screen>
    );
  const client = customer ? db.customers.find((c) => c.id === customer) : undefined;
  const v = invoiceList(db, f, { customerId: client?.id });
  // the filter lives in the address: «back» and a shared link keep it
  const go = (x: InvoiceFilter, c: string | undefined = client?.id) => router.setParams({ f: x, customer: c ?? "" });
  return (
    <Screen
      title={t("nav.invoices")}
      back={back}
      subtitle={[client?.name, `${t("mny.owedTotal")} ${money(v.owedCents)}`].filter(Boolean).join(" · ")}
      help={t("mny.invoices.help")}
      hintKey="invoices"
    >
      <ChoiceChips<InvoiceFilter> value={f} onChange={(x) => go(x)} items={INVOICE_FILTERS.map((k) => ({ key: k, label: `${t(CHIP[k])} · ${v.counts[k]}` }))} />
      {client ? <Button label={t("mny.allClients")} icon="close" size="sm" variant="ghost" onPress={() => go(f, "")} /> : null}
      {v.groups.length === 0 ? (
        <Empty icon="invoice" title={t(EMPTY[f])} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={INV_COLUMNS} value={t("card.val.toPay")} /> : null}
          {v.groups.map(({ g, items, cents }) => (
            <View key={g} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${t(GROUP[g])} · ${items.length} · ${money(cents)}`}</T>
              {device === "tablet" ? (
                <CardGrid>{items.map((i) => <InvoiceListCard key={i.id} i={i} density="rich" />)}</CardGrid>
              ) : (
                <CardList>{items.map((i) => <InvoiceListCard key={i.id} i={i} density={device === "desktop" ? "row" : "rich"} />)}</CardList>
              )}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
