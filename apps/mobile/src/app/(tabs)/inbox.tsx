import { useState } from "react";
import { timing, type StatusName } from "@octo/design-tokens";
import { minutesSince, useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";

const statusOf: Record<LeadStatus, { status: StatusName; label: DictKey }> = {
  new: { status: "info", label: "st.new" },
  replied: { status: "neutral", label: "st.replied" },
  booked: { status: "ok", label: "st.booked" },
  lost: { status: "neutral", label: "st.lost" },
};

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
  const order: LeadStatus[] = ["new", "replied", "booked", "lost"];
  const leads = [...db.leads].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );
  const card = (l: Lead) => {
    const m = minutesSince(l.receivedAt);
    const s = l.status === "new" ? { status: waitStatus(m), label: t("inbox.waiting", { m }) } : { status: statusOf[l.status].status, label: t(statusOf[l.status].label) };
    return (
      <Card key={l.id} status={s.status}>
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
        {l.status === "new" || l.status === "replied" ? (
          <RowView style={{ flexWrap: "wrap" }}>
            {l.status === "new" ? <Button label={t("inbox.reply")} icon="send" onPress={() => setReply(l.id)} /> : null}
            <Button
              label={t("inbox.book")}
              icon="calendar"
              variant={l.status === "new" ? "secondary" : "primary"}
              onPress={() => toast.show(online ? t("toast.bookedTomorrow", { name: l.name }) : t("offline.queued"), bookLead(l.id))}
            />
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
