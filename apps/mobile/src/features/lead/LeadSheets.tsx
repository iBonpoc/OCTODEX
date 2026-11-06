/**
 * Lead card sheets of wave L2 (docs/14-leads-spec.md §7.3): call result, "what next?", estimate visit booking,
 * snooze, status, "lost or wait?". Every action goes through the store (undo toast, offline queue).
 */
import { scheduleSettingsOf } from "@/features/scheduleSettings";
import { VisitFormSheet } from "@/features/VisitForm";
import { uid } from "@/features/estimateDoc";
import { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { LEAD_FUNNEL, LEAD_INTERESTS, type CallOutcome, type Lead, type LeadInterest } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Labeled } from "@/features/fields";
import { isClosedLead, isOpenLead, isSnoozed, leadStatusView, missingForEstimate, type MissingItem } from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { bookStart, dayAtHour, snoozeUntil, SNOOZE_MONTHS, BOOK_DAYS } from "@/features/lead/bookRules";
import { Button, ChoiceChips, IconButton, Stepper, Steps, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";
import { smsWithBody } from "./LeadParts";

const useQ = () => {
  const store = useStore();
  const { t } = useI18n();
  return (msg: string) => (store.online ? msg : t("offline.queued"));
};

/** After a call from the card: did you get through? Only "yes" stops the reply timer (Р13). */
export function CallResultSheet({ l, visible, onClose, onAnswered }: { l: Lead; visible: boolean; onClose: () => void; onAnswered: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const q = useQ();
  const done = (o: CallOutcome) => {
    toast.show(q(t(o === "answered" ? "lead.call.savedYes" : "lead.call.savedNo")), store.callResult(l.id, o));
    onClose();
    if (o === "answered") onAnswered();
  };
  const sms = () => {
    store.callResult(l.id, "no_answer");
    Linking.openURL(smsWithBody(l.phone, t("lead.call.missedText", { name: l.name.split(" ")[0] ?? l.name }))).catch(() => {});
    store.touchLead(l.id, "sms");
    onClose();
  };
  // closed without an answer: the call still counts as an attempt (never lost from the history)
  const dismiss = () => done("no_answer");
  return (
    <Sheet visible={visible} onClose={dismiss} title={t("lead.call.title")}>
      <Button label={t("lead.call.yes")} icon="check" full onPress={() => done("answered")} />
      <RowView style={{ flexWrap: "wrap" }}>
        <Button label={t("lead.call.no")} variant="secondary" onPress={() => done("no_answer")} />
        <Button label={t("lead.call.vm")} variant="secondary" onPress={() => done("voicemail")} />
      </RowView>
      {(l.callAttempts ?? 0) > 0 ? <T v="caption" tone="mut">{t("lead.turn.attempts", { n: l.callAttempts ?? 0 })}</T> : null}
      <Button label={t("lead.call.sms")} icon="sms" variant="ghost" onPress={sms} />
    </Sheet>
  );
}

/** "What next?" — the step is set when the person thinks about it, so "no step" rarely happens. */
export function NextStepSheet({
  l, visible, onClose, onBook, onEstimate, onCloseLead, office,
}: { l: Lead; visible: boolean; onClose: () => void; onBook: () => void; onEstimate: () => void; onCloseLead: () => void; office: boolean }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const q = useQ();
  const remindIn = (days: number) => {
    // 9:00 of the company's day (П4b)
    const r = store.saveTask({ subjectType: "lead", subjectId: l.id, title: t("lead.next.remindTask", { name: l.name }), assigneeId: l.assigneeId ?? store.db.me, dueAt: dayAtHour(days, 9) });
    toast.show(q(t("task.saved")), r.undo);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.next.title")}>
      {office ? (
        <>
          <Button label={t("lead.next.book")} icon="calendar" full onPress={() => { onClose(); onBook(); }} />
          <Button label={t("lead.next.estimate")} icon="invoice" variant="secondary" full onPress={() => { onClose(); onEstimate(); }} />
        </>
      ) : null}
      <Labeled label={t("lead.next.remind")}>
        <RowView style={{ flexWrap: "wrap" }}>
          {[1, 3, 7].map((n) => (
            <Button key={n} label={t("lead.next.inDays", { n })} variant="secondary" size="sm" onPress={() => remindIn(n)} />
          ))}
        </RowView>
      </Labeled>
      <RowView style={{ flexWrap: "wrap" }}>
        <Button label={t("lead.next.close")} icon="close" variant="ghost" size="sm" onPress={() => { onClose(); onCloseLead(); }} />
        <Button label={t("lead.next.skip")} variant="ghost" size="sm" onPress={onClose} />
      </RowView>
    </Sheet>
  );
}

/** Estimate visit: date, start, length, tech, note. No "tomorrow 10:00" by default — the person picks. */
export function BookSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  // the visit form (docs/specs/03 §7.1): date → person with the day's load → free slots → length → note
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const q = useQ();
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending);
  const initialTech = l.assigneeId && techs.some((m) => m.id === l.assigneeId) ? l.assigneeId : null;
  return (
    <VisitFormSheet
      visible={visible}
      onClose={onClose}
      title={t("lead.next.book")}
      saveLabel={t("lead.next.book")}
      init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, techId: initialTech, propertyId: l.propertyId }}
      onSave={(v) => {
        const visitId = uid();
        const undo = store.bookLead(l.id, { ...v, visitId });
        toast.show(q(t("lead.book.saved", { date: day(v.start), time: time(v.start) })), undo);
        return visitId;
      }}
    />
  );
}

/** "Call me in 3 months": hidden until the date, the funnel stage stays (Р10). */
export function SnoozeSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t, day } = useI18n();
  const toast = useToast();
  const q = useQ();
  const [months, setMonths] = useState<string>("3");
  const [reason, setReason] = useState("");
  const until = snoozeUntil(Number(months));
  const save = () => {
    toast.show(q(t("lead.snooze.saved", { date: day(until) })), store.snoozeLead(l.id, until, reason));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.snooze.title")} dirty={reason.trim().length > 0} onSave={save}>
      <ChoiceChips value={months} onChange={setMonths} items={SNOOZE_MONTHS.map((m) => ({ key: String(m), label: t("lead.snooze.months", { n: m }) }))} />
      <T v="caption" tone="mut">{t("lead.snoozedUntil", { date: day(until) })}</T>
      <Labeled label={t("lead.snooze.reason")}>
        <TextField type="note" value={reason} onChangeText={setReason} placeholder={t("lead.snooze.reasonPh")} />
      </Labeled>
      <Button label={t("lead.snooze.title")} icon="clock" full onPress={save} />
    </Sheet>
  );
}

/** Tapping the status chip: where the lead is in the funnel and the rare status actions. */
export function StatusSheet({
  l, visible, onClose, onMakeClient, onCloseLead, onSnooze,
}: { l: Lead; visible: boolean; onClose: () => void; onMakeClient?: () => void; onCloseLead: () => void; onSnooze: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const q = useQ();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.status.title")}>
      {isOpenLead(l) || l.status === "won" ? (
        <Steps labels={LEAD_FUNNEL.map((s) => t(leadStatusView[s].label))} current={LEAD_FUNNEL.indexOf(l.status)} />
      ) : null}
      <T v="caption" tone="mut">{t("lead.status.auto")}</T>
      {isOpenLead(l) ? (
        <View style={{ gap: space[2] }}>
          {onMakeClient ? <Button label={t("lead.makeClient")} icon="check" variant="secondary" full onPress={() => { onClose(); onMakeClient(); }} /> : null}
          {isSnoozed(l) ? (
            <Button label={t("lead.unsnooze")} icon="refresh" variant="secondary" full onPress={() => { toast.show(q(t("lead.unsnoozed")), store.unsnoozeLead(l.id)); onClose(); }} />
          ) : (
            <Button label={t("lead.snooze.title")} icon="clock" variant="secondary" full onPress={() => { onClose(); onSnooze(); }} />
          )}
          <Button label={t("lead.closeTitle")} icon="close" variant="ghost" full onPress={() => { onClose(); onCloseLead(); }} />
        </View>
      ) : isClosedLead(l) ? (
        <Button label={t("lead.reopen")} icon="refresh" full onPress={() => { toast.show(q(t("lead.reopened", { name: l.name })), store.reopenLead(l.id)); onClose(); }} />
      ) : l.customerId ? (
        <Button label={t("lead.openClient")} icon="user" variant="secondary" full onPress={() => { onClose(); router.push(`/client/${l.customerId}`); }} />
      ) : null}
    </Sheet>
  );
}

/** 14 days of silence after the reminder: the app asks, it never closes the lead by itself (Р1). */
export function LostOrWaitSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const q = useQ();
  const wait = leadSettingsOf(store.db.company).waitMoreDays;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.low.title")}>
      <T v="body" tone="mut">{t("lead.low.hint")}</T>
      <Button
        label={t("lead.low.lost")}
        icon="close"
        variant="secondary"
        full
        onPress={() => { toast.show(q(t("lead.closed", { name: l.name })), store.closeLead(l.id, "lost", "no_response")); onClose(); }}
      />
      <Button label={t("lead.low.wait", { n: wait })} icon="clock" full onPress={() => { toast.show(q(t("lead.low.waiting", { n: wait })), store.waitMore(l.id, wait)); onClose(); }} />
    </Sheet>
  );
}

const INTEREST_KEYS: Record<LeadInterest, DictKey> = { hot: "lead.interest.hot", warm: "lead.interest.warm", cold: "lead.interest.cold" };

/** Owner's gut feeling after the talk (Р9): one tap, tap again to clear. */
export function InterestPicker({ l }: { l: Lead }) {
  const store = useStore();
  const { t } = useI18n();
  return (
    <Labeled label={t("lead.interest")}>
      <ChoiceChips<string>
        value={l.interest ?? ""}
        onChange={(k) => store.setLeadInterest(l.id, k === "" || k === l.interest ? undefined : (k as LeadInterest))}
        items={[{ key: "", label: t("lead.interest.none") }, ...LEAD_INTERESTS.map((k) => ({ key: k, label: t(INTEREST_KEYS[k]) }))]}
      />
    </Labeled>
  );
}

const MISSING_KEYS: Record<MissingItem, DictKey> = {
  phone: "lead.missing.phone", email: "lead.missing.email", address: "lead.missing.address", zip: "lead.missing.zip", request: "lead.missing.request",
};
/** What the lead still needs for an estimate (Р8) — each item opens the sheet that fills it. */
export function MissingBlock({ l, onAdd }: { l: Lead; onAdd: (what: "contact" | "address" | "request") => void }) {
  const { t } = useI18n();
  const missing = missingForEstimate(l);
  if (!missing.length || !isOpenLead(l)) return null;
  const sheetOf = (m: MissingItem) => (m === "phone" || m === "email" ? "contact" : m === "request" ? "request" : "address");
  return (
    <Card status="warn">
      <T v="heading">⚠ {t("lead.missing.title")}</T>
      <RowView style={{ flexWrap: "wrap" }}>
        {missing.map((m) => (
          <Button key={m} label={`+ ${t(MISSING_KEYS[m])}`} size="sm" variant="secondary" onPress={() => onAdd(sheetOf(m))} />
        ))}
      </RowView>
    </Card>
  );
}
