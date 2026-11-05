import { useState } from "react";
import { router } from "expo-router";
import { Linking } from "react-native";
import { useStore, visitContext } from "@/data/store";
import { useI18n } from "@/i18n";
import { buildAttention, type AttentionItem } from "@/features/attention";
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
  const { db, role } = useStore();
  const toast = useToast();
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | null>(null);
  const all = buildAttention(db, role).filter((x) => !snoozed.includes(x.id));
  const cur = all[0];

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
      case "late": {
        const v = db.visits.find((x) => x.id === it.refId);
        const phone = v ? visitContext(db, v).customer?.phone.replace(/[^\d+]/g, "") : undefined;
        return <Button label={t("visit.call")} icon="phone" onPress={() => phone && Linking.openURL(`tel:${phone}`)} />;
      }
      default:
        return <Button label={t("triage.remind")} icon="bell" onPress={() => snooze(it, t("toast.reminded", { name: it.name }))} />;
    }
  };

  return (
    <Screen title={t("triage.title")} help={t("help.triage")} hintKey="triage">
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
          <CardList>
            {all.slice(1).map((it, i) => (
              <View key={it.id}>
                <ItemCard
                  title={it.name}
                  subtitle={t(it.label, it.params)}
                  right={<StatusChip status={it.status} label={t(it.chip, it.params)} soft />}
                />
              </View>
            ))}
          </CardList>
        </>
      ) : null}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </Screen>
  );
}
