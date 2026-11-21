import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { DB, Invoice } from "@/data/types";
import { asInvoiceFilter, canSeeInvoiceList, invoiceList, type InvoiceFilter, type OwedGroup } from "@/features/moneyLists";
import { invoiceBalance } from "@/features/invoiceStatus";
import { invoiceSigns } from "@/features/listSigns";
import { remindersOf } from "@/features/invoiceRemind";
import { sumCents } from "@octo/estimating-engine";
import { daysBetween, dayKeyIn, dueDayKey, formatDayKey, getZone } from "@/features/zone";
import { initialsOf, remindAll, type MoneyTile } from "@/features/invoice/moneySummary";
import { useInvoiceRemind } from "@/features/invoice/useRemind";
import { MoneyTiles, useMoneyChips, useMoneyCreate } from "@/features/moneyTabs";
import { InvoiceObject } from "@/features/invoice/InvoiceCard";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import type { GroupRowProps } from "@/ui/groupedList";
import type { FigureCol } from "@/ui/figures";
import { invoiceTitle } from "@/features/invoiceTitle";
import { Empty, Screen } from "@/ui/surfaces";
import { ListScreen } from "@/ui/templates";

/** the search of «Счета»: the client's name, the number, the title of the work, the address of the job's property */
function matchInvoice(db: DB, i: Invoice, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const client = db.customers.find((c) => c.id === i.customerId);
  const job = db.jobs.find((j) => j.id === i.jobId);
  const prop = db.properties.find((p) => p.id === job?.propertyId);
  return [client?.name, i.number, i.title, job?.title, prop?.address, prop?.city].some((x) => (x ?? "").toLowerCase().includes(needle));
}

const WEEK_DAYS = 7;
const GROUP_TITLE = { overdue: "proto.money.g.overdue", waiting: "proto.money.g.waiting", paid: "proto.money.g.paid" } as const;

/**
 * «Деньги → Счета» and «Кто должен» — the List template (prototype v2 #2350, BUILD-SPEC §2.9, §2.13, wireframes-v2 №17).
 * The screen's one job: who owes how much and for how many days — and remind them all at once.
 * «Деньги» · search · «＋» → «Сметы · Счета · Оплаты» → the tiles (on this list «Ждёт оплаты» / «Просрочено» switch it) → «Должны»
 * by days overdue with «Напомнить всем · N» on the group's line → «Ждут оплаты» → «Оплачено за неделю» («Все ›» — every paid one).
 * Rows 56: initials, the client, «Просрочен 9 дн · INV-0101 · напоминаний 0», the sum once. Swipe → «Напомнить», ← «Принять оплату»
 * (the same on a long press and to VoiceOver). Links: `?f=owed|paid|all` (Today «Ждёт оплаты», a client's «Должен» with
 * `&customer=`), `?g=waiting|overdue` (a tile).
 */
export default function Invoices() {
  const { f: fParam, customer, g: gParam } = useLocalSearchParams<{ f?: string; customer?: string; g?: string }>();
  const { db, role } = useStore();
  const { t, money, day } = useI18n();
  const remind = useInvoiceRemind();
  const chips = useMoneyChips("invoices");
  const { create, onCreate } = useMoneyCreate();
  // the filter lives in the address (a link, «Все ›», «back» keep it); none — the debts
  const f: InvoiceFilter = asInvoiceFilter(fParam);
  const tile: MoneyTile | undefined = gParam === "waiting" || gParam === "overdue" ? gParam : undefined;
  const [q, setQ] = useState("");
  const client = customer ? db.customers.find((c) => c.id === customer) : undefined;
  const now = Date.now();
  const tz = getZone();
  // the search looks through every invoice; else the filter (and the tile) narrow it
  const searching = q.trim() !== "";
  const view = invoiceList({ invoices: db.invoices.filter((i) => matchInvoice(db, i, q)) }, searching ? "all" : f === "owed" ? "all" : f, { customerId: client?.id, now, tz });
  const weekAgo = now - WEEK_DAYS * 86_400_000;
  const owedOnly = f === "owed" && !searching;
  const shown = view.groups
    .filter(({ g }) => !tile || g === tile)
    .map(({ g, items }) => ({ g: g as OwedGroup, items: owedOnly && g === "paid" ? items.filter((i) => i.paidAt && Date.parse(i.paidAt) >= weekAgo) : items, all: owedOnly && g === "paid" }));
  const late = remindAll(shown.find((x) => x.g === "overdue")?.items ?? [], remind.reachable, now, tz);
  // the list is the office's (canSeeInvoiceList: not the tech) — reminders are theirs (S20)
  const canRemind = true;
  const groups = shown.map(({ g, items, all }) => ({
    key: g,
    title: `${t(g === "paid" && owedOnly ? "proto.money.g.paidWeek" : GROUP_TITLE[g])} · ${money(sumCents(items.map((i) => (g === "paid" ? i.paidCents : invoiceBalance(i).owesCents))))}`,
    rows: items,
    // «Напомнить всем · N» — on the debtors' line (the List template has no main button; BUILD-SPEC §2.13)
    all:
      g === "overdue" && canRemind && late.length
        ? { label: t("proto.money.remindAll", { n: late.length }), onPress: () => remind.all(late) }
        : all
          ? { label: t("proto.money.all"), onPress: () => router.setParams({ f: "paid", g: "" }) }
          : g === "paid" && f === "paid" && !searching
            ? { label: t("proto.money.fewer"), onPress: () => router.setParams({ f: "owed" }) }
            : undefined,
  }));
  // 1280: the open invoice beside the list, `/invoice?open=<id>` (spec 06 «Панель 1280»); the rows in the groups' order; 390/820 — its own screen
  const panel = useListPanel(canSeeInvoiceList(role) ? groups.flatMap((g) => g.rows.map((i) => i.id)) : [], (id) => `/invoice/${id}`, (id) => canSeeInvoiceList(role) && db.invoices.some((i) => i.id === id));
  const openInv = panel.openId ? db.invoices.find((i) => i.id === panel.openId) : undefined;
  const row = (i: Invoice): GroupRowProps & { key: string } => {
    const c = db.customers.find((x) => x.id === i.customerId);
    const owes = invoiceBalance(i).owesCents;
    const sign = invoiceSigns(i, now, tz)[0];
    const left = i.dueDate ? daysBetween(dayKeyIn(now, tz), dueDayKey(i.dueDate, tz)) : 0;
    const late = owes > 0 && sign?.tone === "bad";
    // visual v2 «цифры справа»: «Срок −9 дн» (red word, not a fill) · «Сумма $1,840»; the line — the number, the work, the reminders
    const due: FigureCol =
      owes <= 0
        ? { label: t("w2m.col.paid"), value: i.paidAt ? formatDayKey(dayKeyIn(i.paidAt, tz), { month: "numeric", day: "numeric" }) : "—" }
        : { label: t("w2m.col.due"), value: left < 0 ? t("w2m.due.late", { d: -left }) : left > 0 ? t("w2m.due.in", { d: left }) : t("w2m.due.today"), tone: late || left < 0 ? "bad" : undefined };
    const sub = [i.number, invoiceTitle(i, t), late ? t("proto.money.reminders", { n: remindersOf(db, i.id).length }) : undefined].filter(Boolean).join(" · ");
    return {
      key: i.id,
      testID: `invoice-row-${i.id}`,
      title: c?.name ?? "—",
      subtitle: sub,
      lead: { initials: initialsOf(c?.name) },
      value: money(owes > 0 ? owes : i.paidCents),
      cols: [due, { label: t("w2m.col.sum"), value: money(owes > 0 ? owes : i.paidCents) }],
      onPress: () => panel.open(i.id),
      selected: i.id === panel.openId,
      swipe:
        owes > 0
          ? {
              left: canRemind && remind.reachable(i.customerId) ? [{ key: "remind", label: t("mny.remind"), icon: "bell", onPress: () => remind.one(i), testID: `invoice-swipe-remind-${i.id}` }] : [],
              right: [{ key: "pay", label: t("inv.takePayment"), icon: "dollar", onPress: () => router.push(`/invoice/${i.id}?pay=1`), testID: `invoice-swipe-pay-${i.id}` }],
            }
          : undefined,
    };
  };
  if (!canSeeInvoiceList(role))
    return (
      <Screen title={t("nav.money")}>
        <Empty icon="invoice" title={t("mny.noAccess")} />
      </Screen>
    );
  return (
    <ListScreen
      testID="invoice-list"
      title={client ? client.name : t("nav.money")}
      back={client ? () => (router.canGoBack() ? router.back() : router.setParams({ customer: "" })) : undefined}
      search={{ placeholder: t("card.filter.searchInvoices"), value: q, onChange: setQ }}
      chips={client ? undefined : chips}
      chipsAs="segment"
      filters={client ? undefined : <MoneyTiles selected={tile} onSelect={(k) => router.setParams({ g: k ?? "", f: "owed" })} />}
      create={create}
      onCreate={onCreate}
      groups={groups}
      // the invoice's own content in the panel: «⋯» in the panel's header row, the main step at the top of the card
      aside={
        openInv ? (
          <InvoiceObject
            key={openInv.id}
            inv={openInv}
            back={panel.close}
            frame={({ more, main, body }) => (
              <ListPanel title={`${t("inv.title")} ${openInv.number ?? ""}`.trim()} subtitle={db.customers.find((c) => c.id === openInv.customerId)?.name} outside={panel.outside} more={more} onOpen={panel.full} onClose={panel.close}>
                {main}
                {body}
              </ListPanel>
            )}
          />
        ) : undefined
      }
      row={row}
      empty={<Empty icon="invoice" title={t(f === "owed" && !searching ? "proto.money.empty.owed" : f === "paid" ? "mny.empty.paid" : "mny.empty.all")} />}
    />
  );
}
