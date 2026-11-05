/** Lists for the Sales hub and Money: estimates and invoices as cards with status filters. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space, type StatusName } from "@octo/design-tokens";
import { daysSince, isOverdue, useStore } from "@/data/store";
import type { Estimate, EstimateStatus, Invoice } from "@/data/types";
import { estimateStatusView } from "@/features/estimateStatus";
import { optionTotals } from "@/features/estimateDoc";
import { estimateSigns, invoiceSigns } from "@/features/listSigns";
import { ESTIMATE_GROUPS, INVOICE_GROUPS, estimateGroup, inEstimateFilter, inListFilter, invoiceGroup, type EstimateFilter, type EstimateGroup, type InvoiceGroup } from "@/features/listGroups";
import { invoiceBalance, invoiceStatusView } from "@/features/invoiceStatus";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
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
  const card = ({ e, g }: { e: Estimate; g: EstimateGroup }) => {
    const c = db.customers.find((x) => x.id === e.customerId);
    const prop = db.properties.find((x) => x.id === e.propertyId);
    const v = estimateStatusView(e.status);
    const sign = estimateSigns(e, now)[0];
    const amount = listAmount(e);
    const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
    // the last event under the name: signed / opened / sent
    const when = e.approval ? `${t(v.l)} ${day(e.approval.at)}` : e.viewedAt ? t("ue.viewed", { date: day(e.viewedAt) }) : e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : undefined;
    const open = g !== "done";
    return (
      <ListCard
        key={e.id}
        title={c?.name ?? "—"}
        when={when}
        lead={{ kind: "icon", icon: "doc" }}
        value={amount.from ? t("card.fromAmount", { amount: money(amount.cents) }) : money(amount.cents)}
        valueLabel={amount.option ?? t("card.val.total")}
        // read only: an estimate has no hand moves in the store (statusMoves); new statuses come from estimateStatusView
        status={{ tone: v.s, label: t(v.l) }}
        signs={sign ? [{ tone: sign.tone, label: t(sign.key, sign.params) }] : undefined}
        // edge only for what needs the contractor: a sign or our signature; a declined estimate is done, no red edge
        edge={sign ? sign.tone : e.status === "awaiting_countersign" ? "warn" : null}
        tags={e.doc && e.doc.options.length > 1 && !e.approval ? [t("ue.nOptions", { n: e.doc.options.length })] : undefined}
        facts={{
          num: e.number,
          phone: c?.phone,
          email: c?.phone ? undefined : c?.email,
          addr,
          work: e.title,
          valid: open && e.validUntil && !e.approval ? day(e.validUntil) : undefined,
        }}
        // contact buttons only open the phone / map / mail: an estimate has no «touch» in the store, nothing is written
        contact={{ phone: c?.phone, email: c?.email, addr }}
        density={device === "desktop" ? "row" : "rich"}
        columns={EST_COLUMNS}
        onPress={() => router.push(`/estimate/${e.id}`)}
      />
    );
  };
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
/** desktop row columns (docs/specs/06-list-cards.md, estimates) */
const EST_COLUMNS: FactKey[] = ["addr", "work", "valid"];
/**
 * Amount on the card (rule of the estimates chat): signed by the client → the signed option (with add-ons) and its name;
 * not signed with several options → «from» the cheapest; otherwise the estimate total. Money only through the engine (optionTotals).
 * TODO(10а): switch to estimateListAmount from features/estimateDoc.ts when it lands (estimates chat, E2b-1).
 */
function listAmount(e: Estimate): { cents: number; from: boolean; option?: string } {
  if ((e.status === "awaiting_countersign" || e.status === "approved") && e.approval)
    return { cents: e.approval.totalCents, from: false, option: e.doc?.options.find((o) => o.id === e.approval!.optionId)?.name };
  if (e.doc && e.doc.options.length > 1) return { cents: Math.min(...e.doc.options.map((o) => optionTotals(e.doc!, o).total)), from: true };
  return { cents: e.totalCents, from: false };
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
  const card = ({ i }: { i: Invoice }) => {
    const c = db.customers.find((x) => x.id === i.customerId);
    const job = db.jobs.find((j) => j.id === i.jobId);
    const prop = job ? db.properties.find((x) => x.id === job.propertyId) : undefined;
    const v = invoiceStatusView(i);
    const { owesCents } = invoiceBalance(i);
    const sign = invoiceSigns(i, now)[0];
    const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
    const what = [i.title ?? (i.kind === "deposit" ? t("money.deposit") : undefined), job?.title].filter(Boolean).join(" · ");
    const open = owesCents > 0;
    return (
      <ListCard
        key={i.id}
        title={c?.name ?? "—"}
        when={!open && i.paidAt ? t("money.paidOn", { date: day(i.paidAt) }) : undefined}
        lead={{ kind: "icon", icon: "invoice" }}
        value={money(open ? owesCents : i.paidCents)}
        valueLabel={open ? t("card.val.toPay") : t("card.val.paid")}
        // read only: an invoice status is derived from the balance (map §5), the one place is invoiceStatusView
        status={{ tone: v.s, label: t(v.l) }}
        signs={sign ? [{ tone: sign.tone, label: t(sign.key, sign.params) }] : undefined}
        // edge only for what needs action (overdue / due soon); a paid invoice has none
        edge={sign ? sign.tone : null}
        facts={{ num: i.number, phone: c?.phone, email: c?.phone ? undefined : c?.email, addr, work: what || undefined, due: open ? day(i.dueDate) : undefined }}
        figures={open ? [{ label: t("card.fig.total"), value: money(i.totalCents) }, { label: t("st.paid"), value: money(i.paidCents) }] : undefined}
        progress={open && i.paidCents > 0 ? { value: i.paidCents, max: i.totalCents, label: t("inv.paidPart", { amount: money(i.paidCents) }) } : undefined}
        // contact buttons only open the phone / map / mail: nothing is written for an invoice
        contact={{ phone: c?.phone, email: c?.email, addr }}
        // secondary: the one accent of the screen stays the main action of the screen
        action={open ? { label: t("visit.recordPayment"), icon: "wallet", onPress: () => router.push(`/invoice/${i.id}`) } : undefined}
        density={device === "desktop" ? "row" : "rich"}
        columns={INV_COLUMNS}
        onPress={() => router.push(`/invoice/${i.id}`)}
      />
    );
  };
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
/** desktop row columns (docs/specs/06-list-cards.md, invoices) */
const INV_COLUMNS: FactKey[] = ["addr", "work", "due"];
