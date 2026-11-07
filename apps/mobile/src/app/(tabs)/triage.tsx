import { useState } from "react";
import { router, type Href } from "expo-router";
import { Linking } from "react-native";
import { useStore, visitContext } from "@/data/store";
import { useI18n } from "@/i18n";
import { attentionHref, buildAttention, type AttentionItem } from "@/features/attention";
import { AttentionRows } from "@/features/AttentionCards";
import { subjectOf } from "@/features/attentionPeople";
import { telHref } from "@/features/contactLinks";
import { AssignSheet, ReplySheet, useTick } from "@/features/sheets";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { View } from "react-native";

/** Dispatcher home: one item at a time, most urgent first; resolve with one tap or snooze. */
export default function Triage() {
  useTick();
  const { t, money } = useI18n();
  const { db, role, rejectedOps } = useStore();
  const toast = useToast();
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | null>(null);
  const all = buildAttention(db, role, undefined, { rejected: rejectedOps }).filter((x) => !snoozed.includes(x.id));
  const cur = all[0];
  // the top card also shows how to reach the client and how many other reasons this client has (spec 06, PR7)
  const curSubject = cur ? subjectOf(db, cur) : {};
  const curC = curSubject.customerId ? db.customers.find((c) => c.id === curSubject.customerId) : undefined;
  const curL = curSubject.leadId ? db.leads.find((l) => l.id === curSubject.leadId) : undefined;
  const curProp = curC ? db.properties.find((x) => x.customerId === curC.id) : undefined;
  const curWho = cur && (curC || curL) ? { phone: curC?.phone ?? curL?.phone, addr: curProp ? `${curProp.address}, ${curProp.city}` : curL?.address } : undefined;
  const curMore = cur ? all.filter((x) => x !== cur && JSON.stringify(subjectOf(db, x)) === JSON.stringify(curSubject) && (curSubject.customerId || curSubject.leadId)).length : 0;

  const snooze = (it: AttentionItem, msg: string) => {
    setSnoozed((s) => [...s, it.id]);
    toast.show(msg, () => setSnoozed((s) => s.filter((x) => x !== it.id)));
  };

  const actions = (it: AttentionItem) => {
    switch (it.kind) {
      case "lead":
        return <Button label={t("inbox.reply")} icon="send" onPress={() => setReply(it.refId)} />;
      case "leadIdle":
        return <Button label={t("lead.open")} icon="chevronRight" onPress={() => router.push(`/lead/${it.refId}`)} />;
      case "schedule":
        return <Button label={t("sch.title")} icon="calendar" onPress={() => router.push(`/job/schedule?jobId=${it.refId}`)} />;
      case "unassigned":
        return <Button label={t("triage.assign")} icon="user" onPress={() => setAssign(it.refId)} />;
      // a money change the server refused (docs/specs/23 §3): open the record it was about
      case "rejected":
        return <Button label={t("sync.rejected.open")} icon="chevronRight" onPress={() => router.push(attentionHref(it) as Href)} />;
      case "late": {
        const v = db.visits.find((x) => x.id === it.refId);
        const href = v ? telHref(visitContext(db, v).customer?.phone) : null;
        return href ? <Button label={t("visit.call")} icon="phone" onPress={() => Linking.openURL(href)} /> : null;
      }
      default:
        return <Button label={t("triage.remind")} icon="bell" onPress={() => snooze(it, t("toast.reminded", { name: it.name }))} />;
    }
  };

  return (
    <Screen title={t("triage.title")} help={t("help.triage")} hintKey="triage" fab="home" home>
      {!cur ? (
        <Empty icon="check" title={t("triage.done")} hint={t("triage.doneHint")} />
      ) : (
        <Card status={cur.status}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="caption" tone="mut" tabular>
              {t("triage.of", { i: 1, n: all.length })}
            </T>
            <StatusChip status={cur.status} label={t(cur.chip, cur.params)} />
          </RowView>
          <T v="title">{cur.name}</T>
          <T v="body" tone="mut">
            {t(cur.label, cur.params)}
          </T>
          {curWho ? (
            <T v="body" tone="mut">
              {[curWho.phone, curWho.addr, curMore ? t("card.moreReasons", { n: curMore }) : ""].filter(Boolean).join(" · ")}
            </T>
          ) : null}
          {cur.amountCents ? (
            <T v="heading" tabular>
              {money(cur.amountCents)}
            </T>
          ) : null}
          <RowView style={{ flexWrap: "wrap" }}>
            {actions(cur)}
            <Button label={t("triage.later")} variant="secondary" onPress={() => snooze(cur, t("toast.later"))} />
          </RowView>
        </Card>
      )}
      {all.length > 1 ? (
        <>
          <SectionTitle title={t("today.attention")} />
          {/* the rest of the queue: one reason per card, each opens its record (spec 06: the triage queue stays «one at a time») */}
          <AttentionRows items={all.slice(1)} />
        </>
      ) : null}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </Screen>
  );
}
