import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { CallOutcome } from "@/data/types";
import { Button, ChoiceChips } from "@/ui/controls";
import { ListCard } from "@/ui/listCard";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import type { IconKey } from "@/ui/primitives";
import { CALL_OUTCOME, CALL_OUTCOMES, commsLog, type CommsKind } from "./comms";
import { CallSheet, type CallPreset } from "./CallSheet";

const icon: Record<string, IconKey> = { call: "phone", sms: "sms", email: "mail" };
type CallFilter = "all" | CallOutcome;

/**
 * «Звонки» / «Сообщения» (docs/specs/13 §2.1, §2.1.1; 20 §7): what was done from the app, one card per call or message.
 * Calls (6-2): the person, the outcome (icon + word), minutes, who called; chips by outcome; «＋ Записать звонок».
 */
export function CommsScreen({ kind }: { kind: CommsKind }) {
  const { t, time, day } = useI18n();
  const { db, role } = useStore();
  const calls = kind === "calls";
  const [filter, setFilter] = useState<CallFilter>("all");
  const [logging, setLogging] = useState<CallPreset | null>(null);
  const all = commsLog(db, role, kind);
  const items = calls && filter !== "all" ? all.filter((x) => x.outcome === filter) : all;
  const count = (f: CallFilter) => (f === "all" ? all.length : all.filter((x) => x.outcome === f).length);
  const record = () => setLogging({});
  return (
    <Screen
      fab={calls ? "calls" : undefined}
      fabOn={calls ? { call: record } : undefined}
      title={t(calls ? "nav.calls" : "nav.messages")}
      subtitle={t(calls ? "nav.calls.hint" : "nav.messages.hint")}
    >
      {calls && all.length ? (
        <ChoiceChips<CallFilter>
          value={filter}
          onChange={setFilter}
          items={(["all", ...CALL_OUTCOMES] as CallFilter[]).map((f) => ({ key: f, label: `${t(f === "all" ? "w6.call.f.all" : CALL_OUTCOME[f].label)} · ${count(f)}` }))}
        />
      ) : null}
      {items.length === 0 ? (
        <Empty
          icon={calls ? "phone" : "sms"}
          title={t(calls ? "nav.calls.empty" : "nav.messages.empty")}
          hint={t(calls ? "nav.calls.emptyHint" : "nav.messages.emptyHint")}
          action={calls ? <Button label={t("w6.call.title")} icon="phone" variant="secondary" onPress={record} /> : undefined}
        />
      ) : (
        <CardList>
          {items.map((it) => {
            const o = it.outcome ? CALL_OUTCOME[it.outcome] : undefined;
            return (
              <ListCard
                key={it.id}
                testID={`comms-${it.id}`}
                title={it.person && it.person !== it.who ? `${it.person} · ${it.who}` : it.who || it.person || t("nav.comms.unknown")}
                when={`${day(it.at)} · ${time(it.at)}`}
                lead={{ kind: "icon", icon: icon[it.kind] ?? "message" }}
                status={o ? { tone: o.tone, label: t(o.label) } : undefined}
                tags={[
                  t(it.kind === "call" ? "nav.comms.call" : it.kind === "sms" ? "nav.comms.sms" : "nav.comms.email"),
                  ...(it.durationMin ? [t("w6.call.min", { n: it.durationMin })] : []),
                  ...(it.by ? [it.by] : []),
                ]}
                facts={it.note ? { last: it.note } : undefined}
                onPress={it.href ? () => router.push(it.href as never) : undefined}
              />
            );
          })}
        </CardList>
      )}
      <CallSheet preset={logging} onClose={() => setLogging(null)} />
    </Screen>
  );
}
