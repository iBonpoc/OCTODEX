import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { SummaryLine, type SummaryItem } from "@/ui/summaryLine";
import { canSeeEstimate } from "@/features/access";
import { moneyOverview } from "@/features/payments/overview";
import type { CreateAction } from "@/ui/templates";
import { canSeeInvoiceList, canSeePayments } from "@/features/moneyLists";
import { moneySummary, type MoneyTile } from "@/features/invoice/moneySummary";

export type MoneyTab = "estimates" | "invoices" | "payments";

const HREF: Record<MoneyTab, "/estimates" | "/invoice" | "/payments"> = {
  estimates: "/estimates",
  invoices: "/invoice",
  payments: "/payments",
};

/**
 * «Деньги» (redesign #2348, decision 20.11 п.2; prototype v2 #2350): one tab, its parts «Сметы · Счета · Оплаты» — the chips strip
 * of the List template (ListScreen `chips`, one row, never a second line). A part the role may not see is not offered (tech —
 * estimates only, so no strip at all; sales — no payments). Switching replaces the screen (a tab, not a step deeper: no «back»).
 */
export function useMoneyChips(value: MoneyTab): { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void } | undefined {
  const { t } = useI18n();
  const { role } = useStore();
  const items: { key: MoneyTab; label: string }[] = [{ key: "estimates", label: t("sales.estimates") }];
  if (canSeeInvoiceList(role)) items.push({ key: "invoices", label: t("nav.invoices") });
  if (canSeePayments(role)) items.push({ key: "payments", label: t("mny.payments.title") });
  if (items.length < 2) return undefined;
  return {
    items,
    value,
    onChange: (k) => {
      if (k !== value && k in HREF) router.replace(HREF[k as MoneyTab]);
    },
  };
}

/** «＋» of «Деньги»: what money starts from — a new estimate, or one from a template (DS §8.13, #1117) */
export function useMoneyCreate(): { create: CreateAction; onCreate: (k: string) => void } {
  const { t } = useI18n();
  return {
    create: {
      a11y: t("est.tplIn.create"),
      items: [
        { key: "blank", label: t("est.new"), icon: "plus", testID: "est-list-add-blank" },
        { key: "template", label: t("est.tplIn.from"), icon: "doc", testID: "est-list-add-template" },
      ],
    },
    onCreate: (k) => router.push(k === "template" ? "/estimate/new?pick=templates" : "/estimate/new"),
  };
}

/**
 * #2993, #2992 (founder 27.11: «четыре слишком много… три в одну строку или убрать»; design- and crm-reviewer: the tiles of a list
 * repeated the invoices' figures on «Сметы» and «Оплаты»): over a part of «Деньги» — ONE line of its own sums (SummaryLine, DS
 * «Строка фактов», §5.1 «итог денежного списка»), the tiles stay on the overview «Деньги» only. «Сметы»: open and how many wait;
 * «Счета»: waiting · overdue (each a button — it narrows the list, pressed again — all); «Оплаты»: received this month.
 * The testIDs of the tiles stay (`money-tiles`, `money-tile-<k>`): the figures are the same engine sums (moneySummary).
 */
export function MoneyTotal({ tab, selected, onSelect }: { tab: MoneyTab; selected?: MoneyTile; onSelect?: (k: MoneyTile | undefined) => void }) {
  const { db, role, mode } = useStore();
  const { t, tn, money } = useI18n();
  if (!canSeeInvoiceList(role)) return null;
  const items: SummaryItem[] = [];
  if (tab === "estimates") {
    const o = moneyOverview(db, db.estimates.filter((e) => canSeeEstimate(db, { role, mode, me: db.me }, e.id)));
    if (o.estimates.n) items.push({ label: t("px3.money.est"), value: money(o.estimates.cents), testID: "money-tile-estimates" });
    if (o.estimates.waiting) items.push({ label: tn("px3.money.waitN", o.estimates.waiting), value: "", status: "warn", testID: "money-tile-waitReply" });
  } else {
    const s = moneySummary(db);
    if (tab === "invoices") {
      const tap = (k: MoneyTile) => (onSelect ? () => onSelect(selected === k ? undefined : k) : undefined);
      if (s.waiting.n) items.push({ label: t("proto.money.tile.waiting"), value: money(s.waiting.cents), onPress: tap("waiting"), selected: selected === "waiting", testID: "money-tile-waiting" });
      if (s.overdue.n) items.push({ label: t("proto.money.tile.overdue"), value: money(s.overdue.cents), status: "bad", onPress: tap("overdue"), selected: selected === "overdue", testID: "money-tile-overdue" });
    } else if (s.received.n) items.push({ label: t("proto.money.tile.received"), value: `${money(s.received.cents)} · ${tn("px1.payN", s.received.n)}`, testID: "money-tile-received" });
  }
  if (!items.length) return null;
  return <SummaryLine testID="money-tiles" items={items} />;
}
