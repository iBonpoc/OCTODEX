import { useState } from "react";
import { timing, type StatusName } from "@octo/design-tokens";
import { minutesSince, useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { leadStatusView as statusOf } from "@/features/leads";
import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";


function waitStatus(m: number): StatusName {
  return m >= timing.leadReplyBadMin ? "bad" : m >= timing.leadReplyWarnMin ? "warn" : "info";
}

/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
export default function Inbox() {
  useTick();
  const { t } = useI18n();
  const { db, bookLead, online } = useStore();
  const toast = useToast();
  const [reply, setReply] = useState<string | null>(null);
  const order: LeadStatus[] = ["new", "replied", "booked", "estimate_sent", "won", "lost"];
  const leads = [...db.leads].sort(
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
  return (
    <Screen title={t("inbox.title")} help={t("help.inbox")} hintKey="inbox">
      {leads.length === 0 ? <Empty icon="inbox" title={t("inbox.empty")} hint={t("inbox.emptyHint")} /> : <Grid>{leads.map(card)}</Grid>}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
    </Screen>
  );
}
