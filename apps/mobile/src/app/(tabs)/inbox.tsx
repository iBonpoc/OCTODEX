import { useEffect, useState } from "react";
import { timing, type StatusName } from "@octo/design-tokens";
import { minutesSince, useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { isOpenLead, leadStatusView as statusOf } from "@/features/leads";
import { EstimatesBoard, InvoicesBoard } from "@/features/boards";
import { usePersistentState } from "@/data/persist";
import { router, useLocalSearchParams } from "expo-router";
import { useI18n } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";


function waitStatus(m: number): StatusName {
  return m >= timing.leadReplyBadMin ? "bad" : m >= timing.leadReplyWarnMin ? "warn" : "info";
}

/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
/** "Sales" tab: leads → estimates → invoices, each list as cards with filters. */
export default function Sales() {
  const { t } = useI18n();
  const [tab, setTab] = usePersistentState<"leads" | "estimates" | "invoices">("octo.salesTab.v1", "leads");
  // "‹ Leads" / "‹ Estimates" from a card opens Sales on that list
  const want = useLocalSearchParams<{ tab?: string }>().tab;
  useEffect(() => {
    if (want === "leads" || want === "estimates" || want === "invoices") setTab(want);
  }, [want]);
  const { db } = useStore();
  const newLeads = db.leads.filter((l) => l.status === "new").length;
  return (
    <Screen
      title={t("sales.title")}
      help={t("help.inbox")}
      hintKey="inbox"
      right={
        tab === "leads" ? (
          <Button label={t("quick.lead")} icon="plus" size="sm" onPress={() => router.push("/lead/new")} />
        ) : tab === "estimates" ? (
          <Button label={t("est.new")} icon="plus" size="sm" onPress={() => router.push("/estimate/new")} />
        ) : undefined
      }
    >
      <Segmented
        full
        value={tab}
        onChange={setTab}
        items={[
          { key: "leads", label: newLeads ? `${t("sales.leads")} · ${newLeads}` : t("sales.leads") },
          { key: "estimates", label: t("sales.estimates") },
          { key: "invoices", label: t("sales.invoices") },
        ]}
      />
      {tab === "leads" ? <LeadsBoard /> : tab === "estimates" ? <EstimatesBoard /> : <InvoicesBoard />}
    </Screen>
  );
}

function LeadsBoard() {
  useTick();
  const { t } = useI18n();
  const { db, bookLead, online } = useStore();
  const toast = useToast();
  const [reply, setReply] = useState<string | null>(null);
  const [f, setF] = useState<"open" | "won" | "lost">("open");
  const order: LeadStatus[] = ["new", "replied", "booked", "estimate_sent", "won", "lost"];
  const leads = [...db.leads].filter((l) => (f === "open" ? isOpenLead(l) : l.status === f)).sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );
  const card = (l: Lead) => {
    const m = minutesSince(l.receivedAt);
    const s = l.status === "new" ? { status: waitStatus(m), label: t("inbox.waiting", { m }) } : { status: statusOf[l.status].status, label: t(statusOf[l.status].label) };
    return (
      <Card key={l.id} status={s.status} onPress={() => router.push(`/lead/${l.id}`)} accessibilityLabel={l.name}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="caption" tone="mut">
            {l.source} · {l.city}
          </T>
          <StatusChip status={s.status} label={s.label} />
        </RowView>
        <T v="heading">{l.name}</T>
        <T v="body" tone="mut" numberOfLines={3}>
          {l.message}
        </T>
        {l.status === "new" || l.status === "replied" || l.status === "booked" ? (
          <RowView style={{ flexWrap: "wrap" }}>
            {l.status === "new" ? <Button label={t("inbox.reply")} icon="send" onPress={() => setReply(l.id)} /> : null}
            {l.status !== "booked" ? (
              <Button
                label={t("inbox.book")}
                icon="calendar"
                variant="secondary"
                onPress={() => toast.show(online ? t("toast.bookedTomorrow", { name: l.name }) : t("offline.queued"), bookLead(l.id))}
              />
            ) : null}
            <Button label={t("lead.makeEstimateShort")} icon="invoice" variant={l.status === "new" ? "secondary" : "primary"} onPress={() => router.push(`/lead/${l.id}`)} />
          </RowView>
        ) : null}
      </Card>
    );
  };
  const n = (s: "won" | "lost") => db.leads.filter((l) => l.status === s).length;
  return (
    <>
      <ChoiceChips
        value={f}
        onChange={setF}
        items={[
          { key: "open", label: `${t("board.open")} · ${db.leads.filter(isOpenLead).length}` },
          { key: "won", label: `${t("board.won")} · ${n("won")}` },
          { key: "lost", label: `${t("board.lost")} · ${n("lost")}` },
        ]}
      />
      {leads.length === 0 ? <Empty icon="inbox" title={t("inbox.empty")} hint={t("inbox.emptyHint")} /> : <Grid>{leads.map(card)}</Grid>}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
    </>
  );
}
