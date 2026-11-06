import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import type { CallOutcome } from "@/data/types";
import { ListCard, type CardStatus } from "@/ui/listCard";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import type { IconKey } from "@/ui/primitives";
import { commsLog, type CommsKind } from "./comms";

const icon: Record<string, IconKey> = { call: "phone", sms: "sms", email: "mail" };
const outcome: Record<CallOutcome, { tone: CardStatus["tone"]; label: DictKey }> = {
  answered: { tone: "ok", label: "nav.calls.answered" },
  no_answer: { tone: "warn", label: "nav.calls.noAnswer" },
  voicemail: { tone: "warn", label: "nav.calls.voicemail" },
};

/** «Звонки» / «Сообщения» (docs/specs/13 §2.1, 13а §3): what was done from the app, one card per call or message. */
export function CommsScreen({ kind }: { kind: CommsKind }) {
  const { t, time, day } = useI18n();
  const { db, role } = useStore();
  const items = commsLog(db, role, kind, t("acct.deletedName"));
  const calls = kind === "calls";
  return (
    <Screen fab={calls ? "calls" : undefined} title={t(calls ? "nav.calls" : "nav.messages")} subtitle={t(calls ? "nav.calls.hint" : "nav.messages.hint")}>
      {items.length === 0 ? (
        <Empty icon={calls ? "phone" : "sms"} title={t(calls ? "nav.calls.empty" : "nav.messages.empty")} hint={t(calls ? "nav.calls.emptyHint" : "nav.messages.emptyHint")} />
      ) : (
        <CardList>
          {items.map((it) => {
            const o = it.outcome ? outcome[it.outcome] : undefined;
            return (
              <ListCard
                key={it.id}
                testID={`comms-${it.id}`}
                title={it.who || t("nav.comms.unknown")}
                when={`${day(it.at)} · ${time(it.at)}`}
                lead={{ kind: "icon", icon: icon[it.kind] ?? "message" }}
                status={o ? { tone: o.tone, label: t(o.label) } : undefined}
                tags={[t(it.kind === "call" ? "nav.comms.call" : it.kind === "sms" ? "nav.comms.sms" : "nav.comms.email"), ...(it.by ? [it.by] : [])]}
                onPress={it.href ? () => router.push(it.href as never) : undefined}
              />
            );
          })}
        </CardList>
      )}
    </Screen>
  );
}
