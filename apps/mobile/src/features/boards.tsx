/** Lists for the Sales hub and Money: estimates and invoices as cards with status filters. */
import { useState } from "react";
import { View } from "react-native";
import { space, type StatusName } from "@octo/design-tokens";
import { daysSince, isOverdue, useStore } from "@/data/store";
import type { Estimate, EstimateStatus, Invoice } from "@/data/types";
import { ESTIMATE_GROUPS, INVOICE_GROUPS, estimateGroup, inEstimateFilter, inListFilter, invoiceGroup, type EstimateFilter, type EstimateGroup, type InvoiceGroup } from "@/features/listGroups";
import { invoiceBalance } from "@/features/invoiceStatus";
import { CardGrid, ListCardHeader } from "@/ui/listCard";
import { EST_COLUMNS, EstimateListCard, INV_COLUMNS, InvoiceListCard } from "@/features/listCards";
import { useDevice } from "@/theme/ThemeProvider";
import { T } from "@/ui/primitives";
import { useI18n, type DictKey } from "@/i18n";
import { ChoiceChips, StatusChip } from "@/ui/controls";
import { CardList, Empty, ItemCard, SectionTitle } from "@/ui/surfaces";

/** status chip of an estimate — the one place for it (lists, client and property documents) */
export const estView: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

export function EstimatesBoard() {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  const [f, setF] = useState<EstimateFilter>("open");
  const now = Date.now();
  const all = db.estimates.map((e) => ({ e, g: estimateGroup(e, now) }));
  const count = (x: EstimateFilter) => all.filter(({ g }) => inEstimateFilter(g, x)).length;
  const list = all
    .filter(({ g }) => inEstimateFilter(g, f))
    .sort((a, b) => (b.e.sentAt ?? b.e.approvedAt ?? "").localeCompare(a.e.sentAt ?? a.e.approvedAt ?? ""));
  // the one estimate card (features/listCards.tsx), shared with the «Today» figures
  const card = ({ e }: { e: Estimate; g: EstimateGroup }) => <EstimateListCard key={e.id} e={e} density={device === "desktop" ? "row" : "rich"} />;
  const groups = ESTIMATE_GROUPS.map((g) => [g, list.filter((x) => x.g === g)] as const).filter(([, xs]) => xs.length);
  return (
    <View style={{ gap: space[3] }}>
      <ChoiceChips<EstimateFilter>
        value={f}
        onChange={setF}
        items={[
          { key: "open", label: `${t("board.open")} · ${count("open")}` },
          { key: "closed", label: `${t("card.f.closed")} · ${count("closed")}` },
          { key: "all", label: `${t("cat.all")} · ${count("all")}` },
        ]}
      />
      {list.length === 0 ? (
        <Empty icon="invoice" title={t("board.noEstimates")} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={EST_COLUMNS} value={t("card.val.total")} /> : null}
          {groups.map(([g, xs]) => (
            <View key={g} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${t(`card.group.${g}`)} · ${xs.length}`}</T>
              {device === "tablet" ? <CardGrid>{xs.map(card)}</CardGrid> : <CardList>{xs.map(card)}</CardList>}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/** Invoices on list cards (spec 06, PR5): needs action (overdue / due soon) → waiting → paid; status from invoiceStatusView. */
export function InvoicesBoard() {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  const [f, setF] = useState<EstimateFilter>("open");
  const now = Date.now();
  const all = db.invoices.map((i) => ({ i, g: invoiceGroup(i, now) }));
  const count = (x: EstimateFilter) => all.filter(({ g }) => inListFilter(g, x)).length;
  const list = all.filter(({ g }) => inListFilter(g, f)).sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate));
  // the one invoice card (features/listCards.tsx), shared with the «Today» figures
  const card = ({ i }: { i: Invoice }) => <InvoiceListCard key={i.id} i={i} density={device === "desktop" ? "row" : "rich"} />;
  const groups = INVOICE_GROUPS.map((g) => [g, list.filter((x) => x.g === g)] as const).filter(([, xs]) => xs.length);
  const sum = (g: InvoiceGroup, xs: readonly { i: Invoice }[]) => money(xs.reduce((s, { i }) => s + (g === "done" ? i.paidCents : invoiceBalance(i).owesCents), 0));
  return (
    <View style={{ gap: space[3] }}>
      <ChoiceChips<EstimateFilter>
        value={f}
        onChange={setF}
        items={[
          { key: "open", label: `${t("board.open")} · ${count("open")}` },
          { key: "closed", label: `${t("card.f.closed")} · ${count("closed")}` },
          { key: "all", label: `${t("cat.all")} · ${count("all")}` },
        ]}
      />
      {list.length === 0 ? (
        <Empty icon="invoice" title={t("money.empty")} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={INV_COLUMNS} value={t("card.val.toPay")} /> : null}
          {groups.map(([g, xs]) => (
            <View key={g} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${t(g === "done" ? "money.paid" : g === "waiting" ? "money.awaiting" : "card.group.action")} · ${xs.length} · ${sum(g, xs)}`}</T>
              {device === "tablet" ? <CardGrid>{xs.map(card)}</CardGrid> : <CardList>{xs.map(card)}</CardList>}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
