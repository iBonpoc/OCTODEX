import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { shortAddress } from "@/features/shortAddress";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { DB, Invoice } from "@/data/types";
import { asInvoiceFilter, canSeeInvoiceList, invoiceList, type InvoiceFilter, type OwedGroup } from "@/features/moneyLists";
import { invoiceBalance } from "@/features/invoiceStatus";
import { invoiceSigns } from "@/features/listSigns";
import { remindersOf } from "@/features/invoiceRemind";
import { sumCents } from "@octo/estimating-engine";
import { daysBetween, dayKeyIn, dueDayKey, getZone } from "@/features/zone";
import { initialsOf, remindAll, type MoneyTile } from "@/features/invoice/moneySummary";
import { useInvoiceRemind } from "@/features/invoice/useRemind";
import { MoneyTotal, useMoneyChips, useMoneyCreate } from "@/features/moneyTabs";
import { InvoiceObject } from "@/features/invoice/InvoiceCard";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import type { GroupRowProps } from "@/ui/groupedList";
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
  const { t, tn, money, day, moneyWhole } = useI18n();
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
    title: `${t(g === "paid" && owedOnly ? "proto.money.g.paidWeek" : GROUP_TITLE[g])} · ${moneyWhole(sumCents(items.map((i) => (g === "paid" ? i.paidCents : invoiceBalance(i).owesCents))))}`,
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
    // #2992 (lists B): on the right the sum, under it the sign of the map §5 — the one rule `invoiceSigns` (listSigns.ts): «Просрочен
    // N дн» (bad), «срок сегодня / завтра» (warn); a debt further off says «Срок N дн» in its line, a paid one — the day it was paid;
    // no «Срок / Сумма» words in every row (DS §5.5)
    // a paid one says «Оплачен <день>» — one word, kept by #1427 (e2e 78), though the group says «Оплачено» too
    const when = owes <= 0 ? (i.paidAt ? `${t("w2m.col.paid")} ${day(i.paidAt)}` : undefined) : sign ? undefined : left > 0 ? `${t("w2m.col.due")} ${t("w2m.due.in", { d: left })}` : undefined;
    // the number and when; the invoice's kind word («Остаток по договору») repeated in every row and cut it mid-word (layout review 27.11)
    // #3018: line 3 — the sign, «из $2,000.00» when part is paid, when; the number is in the name's line, the address under it
    const job = db.jobs.find((j) => j.id === i.jobId);
    const prop = db.properties.find((x) => x.id === job?.propertyId) ?? db.properties.find((x) => x.customerId === i.customerId);
    const partOf = owes > 0 && i.paidCents > 0 ? t("lst.ofTotal", { amount: moneyWhole(i.totalCents) }) : undefined;
    const sub = [partOf, when, late && remindersOf(db, i.id).length ? tn("lst.reminded", remindersOf(db, i.id).length) : undefined].filter(Boolean).join(" · ");
    return {
      key: i.id,
      testID: `invoice-row-${i.id}`,
      title: c?.name ?? "—",
      titleNote: i.number || undefined,
      subtitle: prop ? shortAddress(prop.address, prop.city) : undefined,
      extra: sub || undefined,
      figureRight: true,
      lead: { initials: initialsOf(c?.name) },
      // the rest to pay, big on the right (Jobber, HCP: the office calls by the balance)
      value: moneyWhole(owes > 0 ? owes : i.paidCents),
      status: owes > 0 && sign ? { status: sign.tone, label: t(sign.key, sign.params) } : undefined,
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
      // #3018 (founder #3017): each invoice its own card
      separate
      title={client ? client.name : t("nav.money")}
      back={client ? () => (router.canGoBack() ? router.back() : router.setParams({ customer: "" })) : undefined}
      search={{ placeholder: t("card.filter.searchInvoices"), value: q, onChange: setQ }}
      chips={client ? undefined : chips}
      chipsAs="segment"
      filters={client ? undefined : <MoneyTotal tab="invoices" selected={tile} onSelect={(k) => router.setParams({ g: k ?? "", f: "owed" })} />}
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
