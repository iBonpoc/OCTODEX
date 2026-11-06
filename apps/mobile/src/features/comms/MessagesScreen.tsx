import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { ListCard } from "@/ui/listCard";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { MessageSheet, type MessagePreset } from "./MessageSheet";
import { messageThreads, ownerName } from "./messages";

/**
 * «Сообщения» (docs/specs/20 «6-3»; 13 §2.1.1): one card per person (or per lead / client when the person is not known),
 * the last text on it; the card opens the conversation. «＋ Новое сообщение».
 */
export function MessagesScreen() {
  const { t, time, day } = useI18n();
  const { db, role } = useStore();
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  const threads = messageThreads(db, role, t("acct.deletedName"));
  const write = () => setWriting({});
  return (
    <Screen fab="messages" fabOn={{ message: write }} title={t("nav.messages")} subtitle={t("nav.messages.hint")}>
      {threads.length === 0 ? (
        <Empty icon="sms" title={t("nav.messages.empty")} hint={t("nav.messages.emptyHint")} />
      ) : (
        <CardList>
          {threads.map((th) => {
            const last = th.items[0]!;
            const whose = th.owner ? ownerName(db, th.owner) : "";
            return (
              <ListCard
                key={th.key}
                testID={`thread-${th.key}`}
                title={th.title || t("nav.comms.unknown")}
                when={`${day(last.at)} · ${time(last.at)}`}
                lead={{ kind: "icon", icon: last.kind === "email" ? "mail" : "sms" }}
                tags={[
                  ...(whose && whose !== th.title ? [whose] : []),
                  t(last.kind === "email" ? "nav.comms.email" : "nav.comms.sms"),
                  ...(th.items.length > 1 ? [t("w6.msg.count", { n: th.items.length })] : []),
                ]}
                facts={last.note ? { last: last.note } : undefined}
                onPress={() => router.push(`/messages/${th.key}` as never)}
              />
            );
          })}
        </CardList>
      )}
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </Screen>
  );
}
