import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { StatGrid, StatTile } from "@/ui/statTile";
import type { IconKey } from "@/ui/primitives";
import type { CreateAction } from "@/ui/templates";
import { canSeeInvoiceList, canSeePayments } from "@/features/moneyLists";
import { moneySummary, MONEY_TILES, type MoneyTile } from "@/features/invoice/moneySummary";

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

/** visual v2 «Плитки»: an icon in a circle; the screen's one yellow is the tile «Должны» (waiting) */
const ICON: Record<MoneyTile, IconKey> = { waiting: "invoice", overdue: "clock", received: "wallet", toBill: "doc" };
const LABEL = { waiting: "proto.money.tile.waiting", overdue: "proto.money.tile.overdue", received: "proto.money.tile.received", toBill: "proto.money.tile.toBill" } as const;

/**
 * The summary over the three lists (DESIGN.md «плитки 2×2 с пастелью»; BUILD-SPEC §1 StatTile): «Ждёт оплаты · Просрочено ·
 * Получено · Ещё выставить». A tile opens its filtered list; on «Счета» the two invoice tiles switch the list (`selected` — the
 * frame, role `tab`; pressed again — back to all). A zero tile is not drawn. The office's figures only: the tech sees no tiles.
 */
export function MoneyTiles({ selected, onSelect }: { selected?: MoneyTile; onSelect?: (k: MoneyTile | undefined) => void }) {
  const { db, role } = useStore();
  const { t, moneyWhole } = useI18n();
  if (!canSeeInvoiceList(role)) return null;
  const s = moneySummary(db);
  const open = (k: MoneyTile) => {
    if (onSelect && (k === "waiting" || k === "overdue")) return onSelect(selected === k ? undefined : k);
    if (k === "waiting" || k === "overdue") return router.push(`/invoice?g=${k}`);
    if (k === "received") return canSeePayments(role) ? router.push("/payments") : undefined;
    router.push("/estimates");
  };
  return (
    <StatGrid testID="money-tiles">
      {MONEY_TILES.map((k) => (
        <StatTile
          key={k}
          testID={`money-tile-${k}`}
          label={t("proto.money.tile.count", { label: t(LABEL[k]), n: s[k].n })}
          value={s[k].cents ? moneyWhole(s[k].cents) : 0}
          icon={ICON[k]}
          accent={k === "waiting"}
          warn={k === "overdue" && s.overdue.n ? t("proto.money.tile.overdueWarn", { n: s.overdue.n }) : undefined}
          selected={onSelect && (k === "waiting" || k === "overdue") ? selected === k : undefined}
          onPress={() => open(k)}
        />
      ))}
    </StatGrid>
  );
}
