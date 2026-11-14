import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { INV_COLUMNS, INV_COLUMNS_PANEL, InvoiceListCard } from "@/features/listCards";
import { InvoiceCardBody } from "@/features/invoice/InvoiceCard";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { asInvoiceFilter, canSeeInvoiceList, INVOICE_FILTERS, invoiceList, type InvoiceFilter, type OwedGroup } from "@/features/moneyLists";
import { useDevice } from "@/theme/ThemeProvider";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import type { DB, Invoice } from "@/data/types";
import { T } from "@/ui/primitives";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCardHeader } from "@/ui/listCard";

const CHIP: Record<InvoiceFilter, DictKey> = { owed: "mny.f.owed", paid: "mny.f.paid", all: "mny.f.all" };
const GROUP: Record<OwedGroup, DictKey> = { overdue: "mny.g.overdue", waiting: "mny.g.waiting", paid: "mny.g.paid" };
/** the search of «Счета»: the client's name, the number, the title of the work, the address of the job's property */
function matchInvoice(db: DB, i: Invoice, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const client = db.customers.find((c) => c.id === i.customerId);
  const job = db.jobs.find((j) => j.id === i.jobId);
  const prop = db.properties.find((p) => p.id === job?.propertyId);
  return [client?.name, i.number, i.title, job?.title, prop?.address, prop?.city].some((x) => (x ?? "").toLowerCase().includes(needle));
}

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
  // spec 31 §6 п.7: a link with ?f= («Ждёт оплаты» on Today, «Должен» on a client) sets the filter for this visit only;
  // a chip the person taps is kept on this device for this list; the search is not kept
  const [kept, setKept] = usePersistentState<InvoiceFilter>(`${filterStoreKey("invoices")}.status`, "owed");
  const f = fParam ? asInvoiceFilter(fParam) : asInvoiceFilter(kept);
  const [q, setQ] = useState("");
  // computed before the role check (hooks): the visible rows in their order on screen
  const clientP = customer ? db.customers.find((c) => c.id === customer) : undefined;
  const qShown = q.trim() ? invoiceList({ invoices: db.invoices.filter((i) => matchInvoice(db, i, q)) }, f, { customerId: clientP?.id }) : invoiceList(db, f, { customerId: clientP?.id });
  const panel = useListPanel(canSeeInvoiceList(role) ? qShown.groups.flatMap((g) => g.items.map((i) => i.id)) : [], (id) => `/invoice/${id}`, (id) => canSeeInvoiceList(role) && db.invoices.some((i) => i.id === id));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  if (!canSeeInvoiceList(role))
    return (
      <Screen title={t("nav.invoices")} back={back}>
        <Empty icon="invoice" title={t("mny.noAccess")} />
      </Screen>
    );
  const client = customer ? db.customers.find((c) => c.id === customer) : undefined;
  const v = invoiceList(db, f, { customerId: client?.id });
  // the search narrows the groups; the chips and «Должны всего» count the whole list
  const shown = qShown;
  // the filter lives in the address: «back» and a shared link keep it
  const go = (x: InvoiceFilter, c: string | undefined = client?.id) => router.setParams({ f: x, customer: c ?? "" });
  // «Клиент» (spec 31, one rule): one at a time, in the sheet with a search at 10+; picked — a chip «Клиент: X ✕» under the row.
  // «Должен» on a client opens the list with it (`?customer=`)
  const payers = db.customers
    .map((c) => ({ c, n: invoiceList(db, f, { customerId: c.id }).groups.reduce((s, g) => s + g.items.length, 0), any: db.invoices.some((i) => i.customerId === c.id) }))
    .filter((x) => x.any)
    .sort((a, b) => a.c.name.localeCompare(b.c.name));
  const clientGroup = {
    key: "client",
    title: t("card.fact.client"),
    single: true,
    searchable: true,
    options: payers.map(({ c, n }) => ({ key: c.id, label: c.name, count: n, on: client?.id === c.id })),
    onToggle: (id: string) => go(f, client?.id === id ? "" : id),
  };
  // 1280: the open invoice beside the list, `/invoice?open=<id>` (spec 06 «Панель 1280»); the rows in the groups' order
  const openInv = panel.openId ? db.invoices.find((i) => i.id === panel.openId) : undefined;
  const row = (i: (typeof db.invoices)[number]) => ({ selected: i.id === panel.openId, open: () => panel.open(i.id), narrow: !!panel.openId });
  const pick = (x: InvoiceFilter) => {
    setKept(x);
    go(x);
  };
  return (
    <Screen
      title={t("nav.invoices")}
      back={back}
      aside={
        openInv ? (
          // #1474: as the invoice's screen — «⋯» in the panel's header row, «Принять оплату» at the top of the card
          <InvoiceCardBody
            key={openInv.id}
            inv={openInv}
            frame={({ more, main, body }) => (
              <ListPanel title={`${t("inv.title")} ${openInv.number ?? ""}`.trim()} subtitle={db.customers.find((c) => c.id === openInv.customerId)?.name} outside={panel.outside} actions={more} onOpen={panel.full} onClose={panel.close}>
                {main}
                {body}
              </ListPanel>
            )}
          />
        ) : undefined
      }
      subtitle={`${t("mny.owedTotal")} ${money(v.owedCents)}`}
      help={t("mny.invoices.help")}
      hintKey="invoices"
    >
      {/* spec 31 (variant Б): the search (client, address, INV, work) and one lane; the debts first */}
      <FilterBar<InvoiceFilter>
        search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchInvoices") }}
        value={f}
        onChange={pick}
        items={INVOICE_FILTERS.map((k) => ({ key: k, label: t(CHIP[k]), count: v.counts[k] }))}
        groups={payers.length > 1 || client ? [clientGroup] : []}
        onReset={() => go(f, "")}
      />
      {shown.groups.length === 0 ? (
        <Empty icon="invoice" title={t(EMPTY[f])} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={panel.openId ? INV_COLUMNS_PANEL : INV_COLUMNS} value={t("card.val.toPay")} /> : null}
          {shown.groups.map(({ g, items, cents }) => (
            <View key={g} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${t(GROUP[g])} · ${items.length} · ${money(cents)}`}</T>
              {device === "tablet" ? (
                <CardGrid>{items.map((i) => <InvoiceListCard key={i.id} i={i} density="rich" panel={row(i)} />)}</CardGrid>
              ) : (
                <CardList>{items.map((i) => <InvoiceListCard key={i.id} i={i} density={device === "desktop" ? "row" : "rich"} panel={row(i)} />)}</CardList>
              )}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
