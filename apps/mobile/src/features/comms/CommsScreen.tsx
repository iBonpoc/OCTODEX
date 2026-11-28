import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { CallOutcome } from "@/data/types";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { Empty, Screen } from "@/ui/surfaces";
import { dayKeyIn } from "@/features/zone";
import { shortAddress } from "@/features/shortAddress";
import { telHref } from "@/features/contactLinks";
import { openContact } from "@/ui/listCard";
import type { IconKey } from "@/ui/primitives";
import { CALL_OUTCOME, CALL_OUTCOMES, commsLog, matchComms, type CommsKind } from "./comms";
import { CallSheet, type CallPreset } from "./CallSheet";

const icon: Record<string, IconKey> = { call: "phone", sms: "sms", email: "mail" };
type CallFilter = "all" | CallOutcome;
/** «сегодня» → «Сегодня»: a day word as a group title */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * «Звонки» / «Сообщения» (docs/specs/13 §2.1, §2.1.1; 20 §7): what was done from the app, one row per call or message (lists B #2992).
 * Calls (6-2): the person, the outcome (icon + word), minutes, who called; «＋ Записать звонок». Over the list — the one rule
 * of spec 31: the magnifier (who, person, note) and the outcomes as the lane; the outcome is kept on this device, the search is not.
 */
export function CommsScreen({ kind }: { kind: CommsKind }) {
  const { t, time, day, duration } = useI18n();
  const { db, role } = useStore();
  const calls = kind === "calls";
  const [kept, setFilter] = usePersistentState<CallFilter>(`${filterStoreKey("calls")}.status`, "all");
  const filter: CallFilter = kept === "all" || CALL_OUTCOMES.includes(kept) ? kept : "all";
  const [q, setQ] = useState("");
  const [logging, setLogging] = useState<CallPreset | null>(null);
  const all = commsLog(db, role, kind, t("acct.deletedName"));
  const items = (calls && filter !== "all" ? all.filter((x) => x.outcome === filter) : all).filter((x) => matchComms(x, q));
  const count = (f: CallFilter) => (f === "all" ? all.length : all.filter((x) => x.outcome === f).length);
  const record = () => setLogging({});
  return (
    <Screen
      fab={calls ? "calls" : undefined}
      fabOn={calls ? { call: record } : undefined}
      title={t(calls ? "nav.calls" : "nav.messages")}
      subtitle={t(calls ? "nav.calls.hint" : "nav.messages.hint")}
      help={t(calls ? "help.calls" : "help.messages")}
    >
      {calls && all.length ? (
        <FilterBar<CallFilter>
          value={filter}
          onChange={setFilter}
          search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchCalls") }}
          items={(["all", ...CALL_OUTCOMES] as CallFilter[]).map((f) => ({ key: f, label: t(f === "all" ? "w6.call.f.all" : CALL_OUTCOME[f].label), count: count(f) }))}
        />
      ) : null}
      {items.length === 0 && all.length > 0 ? (
        <Empty icon="search" title={t("card.emptyFilter")} />
      ) : items.length === 0 ? (
        <Empty
          icon={calls ? "phone" : "sms"}
          title={t(calls ? "nav.calls.empty" : "nav.messages.empty")}
          hint={t(calls ? "nav.calls.emptyHint" : "nav.messages.emptyHint")}
          action={calls ? <Button label={t("w6.call.title")} icon="phone" variant="secondary" onPress={record} /> : undefined}
        />
      ) : (
        // lists B (#2992): rows of the day's group (rule 12) — the kind's icon · who, «вид · минуты · кто · заметка» · on the right
        // the time, under it the outcome (icon + word); the day is the group's title, said once
        <GroupedList testID="calllog-list">
          {[...items.reduce((m, it) => m.set(dayKeyIn(it.at), [...(m.get(dayKeyIn(it.at)) ?? []), it]), new Map<string, typeof items>())].map(([k, xs]) => (
            <ListGroup key={k} separate title={cap(day(xs[0]!.at))} testID={`calllog-day-${k}`}>
              {xs.map((it) => {
                const o = it.outcome ? CALL_OUTCOME[it.outcome] : undefined;
                // #3018 (founder #3017): 1 — who · the phone; 2 — the town or the address; 3 — the time, the outcome, the kind, minutes, who
                // called, the note; on the right «Перезвонить» for one not answered
                const lead = it.subjectType === "lead" ? db.leads.find((x) => x.id === it.subjectId) : undefined;
                const cust = it.subjectType === "customer" ? db.customers.find((x) => x.id === it.subjectId) : undefined;
                const prop = cust ? db.properties.find((x) => x.customerId === cust.id) : undefined;
                const phone = lead?.phone ?? cust?.phone ?? undefined;
                const where = lead ? shortAddress(lead.address, lead.city) : prop ? shortAddress(prop.address, prop.city) : undefined;
                const tel = telHref(phone);
                const back = calls && tel && it.outcome && it.outcome !== "answered";
                return (
                  <GroupRow
                    key={it.id}
                    testID={`comms-${it.id}`}
                    // one name in line 1 (review: «Karen Whitaker · Daniel Wh…»); the client behind the person goes to line 3
                    title={it.person || it.who || t("nav.comms.unknown")}
                    // #3038: the client's rule — no phone in the line (the call is on the right); the time in the name's line
                    subtitle={where}
                    addressLine
                    actions={back ? [{ icon: "phone", a11y: `${t("client.call")} ${it.who ?? ""}`, onPress: () => openContact({ kind: "call", icon: "phone", url: tel!, value: phone ?? "" }), testID: `calllog-back-${it.id}` }] : undefined}
                    extra={[
                      it.person && it.person !== it.who ? it.who : undefined,
                      calls ? undefined : t(it.kind === "call" ? "nav.comms.call" : it.kind === "sms" ? "nav.comms.sms" : "nav.comms.email"),
                      it.durationMin ? duration(it.durationMin) : undefined, // #2363 F42: the one rule of a length («1 ч 30 мин»)
                      it.by,
                      it.note,
                    ].filter(Boolean).join(" · ") || undefined}
                    lead={{ icon: icon[it.kind] ?? "message" }}
                    value={time(it.at)}
                    valueMark={!o}
                    valueTop
                    status={o ? { status: o.tone, label: t(o.label), iconOnly: true } : undefined}
                    onPress={it.href ? () => router.push(it.href as never) : undefined}
                  />
                );
              })}
            </ListGroup>
          ))}
        </GroupedList>
      )}
      <CallSheet preset={logging} onClose={() => setLogging(null)} />
    </Screen>
  );
}
