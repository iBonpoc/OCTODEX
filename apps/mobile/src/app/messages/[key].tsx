import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { ListCard } from "@/ui/listCard";
import { CardList, Empty, RowView, Screen } from "@/ui/surfaces";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { messageSubject, messageThread, ownerHref, ownerName } from "@/features/comms/messages";

/**
 * One conversation (docs/specs/20 «6-3»): the person's SMS and emails, newest first — each one a card with the text and
 * «Открыто в приложении телефона · время» (never «доставлено»: the phone's app sends it, not OCTODEX).
 */
export default function MessageThreadScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { t, time, day } = useI18n();
  const { db, role } = useStore();
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  const th = messageThread(db, role, key ?? "", t("acct.deletedName"));
  const canWrite = !!th.owner && !!th.person && !!messageSubject(db, role, th.owner);
  return (
    <Screen title={th.title || t("w6.msg.thread")} subtitle={th.owner && ownerName(db, th.owner) !== th.title ? ownerName(db, th.owner) : undefined}>
      <RowView style={{ flexWrap: "wrap" }}>
        {canWrite ? <Button label={t("w6.msg.write")} icon="sms" variant="primary" onPress={() => setWriting({ owner: th.owner, person: th.person })} /> : null}
        {th.owner ? (
          <Button
            label={t(th.owner.type === "customer" ? "w6.msg.openClient" : "w6.msg.openLead")}
            icon="chevronRight"
            variant="secondary"
            onPress={() => router.push(ownerHref(th.owner!) as never)}
          />
        ) : null}
      </RowView>
      {th.items.length === 0 ? (
        <Empty icon="sms" title={t("w6.msg.empty")} />
      ) : (
        <CardList>
          {th.items.map((m) => (
            <ListCard
              key={m.id}
              testID={`msg-${m.id}`}
              title={m.note || t(m.kind === "email" ? "nav.comms.email" : "nav.comms.sms")}
              when={`${day(m.at)} · ${time(m.at)}`}
              lead={{ kind: "icon", icon: m.kind === "email" ? "mail" : "sms" }}
              tags={[t(m.kind === "email" ? "nav.comms.email" : "nav.comms.sms"), t("w6.msg.openedAt", { time: time(m.at) }), ...(m.by ? [m.by] : [])]}
            />
          ))}
        </CardList>
      )}
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </Screen>
  );
}
