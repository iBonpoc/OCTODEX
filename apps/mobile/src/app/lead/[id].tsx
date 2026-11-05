import { useState } from "react";
import { Image, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import {
  canSeeLead, canSeeLeadCost, findDuplicates, isClosedLead, isOpenLead, leadStatusView, leadTimeline, leadTurn, MANUAL_WIN_REASONS,
  responseMinutes, sourceName, type LeadTurn, type ManualWinReason,
} from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { CloseSheet, ContactActions, LeadHistory, LeadOverview, smsWithBody, TasksBlock } from "@/features/lead/LeadParts";
import { BookSheet, CallResultSheet, LostOrWaitSheet, NextStepSheet, SnoozeSheet, StatusSheet } from "@/features/lead/LeadSheets";
import { NotesBlock } from "@/features/NotesBlock";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, Grid, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import type { StatusName } from "@octo/design-tokens";

type Tab = "overview" | "history" | "tasks" | "estimates" | "files";
type SheetName = "won" | "close" | "reply" | "call" | "next" | "book" | "snooze" | "status" | "low" | null;

/**
 * Lead card, wave L2 (docs/14-leads-spec.md §7.2). Header: number · source · cost · date, a tappable status chip (status sheet),
 * "whose turn" with its timer, who works it, contact actions; then duplicates, ONE main button chosen by the turn, the next step.
 * Tabs: Overview · Conversation · Tasks · Estimates · Files.
 */
export default function LeadScreen() {
  useTick();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, day, money } = useI18n();
  const toast = useToast();
  const [tab, setTab] = usePersistentState<Tab>("octo.leadTab.v2", "overview");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [winReason, setWinReason] = useState<ManualWinReason>("paper");
  const [winText, setWinText] = useState("");
  const l = db.leads.find((x) => x.id === id);
  if (!l || !canSeeLead(role, db.me, l)) {
    return (
      <Screen title={t("lead.card")}>
        <Empty icon="inbox" title={l ? t("lead.noAccess") : t("lead.notFound")} />
      </Screen>
    );
  }
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const sv = leadStatusView[l.status];
  const turn = leadTurn(db, l, leadSettingsOf(db.company));
  const replied = responseMinutes(l);
  const dups = findDuplicates(db, { phone: l.phone, phone2: l.phone2, email: l.email }, l.id);
  const dupCustomers = dups.customers.filter((c) => c.id !== l.customerId);
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const assignee = db.members.find((m) => m.id === l.assigneeId);
  const events = leadTimeline(db, l, db.me);

  const makeEstimate = () => {
    const target = store.leadEstimateTarget(l.id);
    if (target) router.push(`/estimate/new?customerId=${target.customerId}&propertyId=${target.propertyId}&leadId=${l.id}`);
  };
  const remind = () => {
    const e = estimates.find((x) => x.status === "sent");
    Linking.openURL(smsWithBody(l.phone, t("lead.remindText", { name: l.name.split(" ")[0] ?? l.name, title: e?.title ?? "" }))).catch(() => {});
    store.touchLead(l.id, "sms");
    toast.show(q(t("toast.reminded", { name: l.name })), store.markReminded(l.id));
  };
  const turnChip = turnLabel(turn, t, day);
  const main =
    turn.kind === "reply" ? <Button label={t("inbox.reply")} icon="send" full onPress={() => setSheet("reply")} />
    : turn.kind === "noStep" ? <Button label={t("lead.next.title")} icon="chevronRight" full onPress={() => setSheet("next")} />
    : turn.kind === "wait" && turn.action === "lostOrWait" ? <Button label={t("lead.low.title")} icon="clock" full onPress={() => setSheet("low")} />
    : turn.kind === "wait" ? <Button label={t("lead.remind")} icon="sms" full variant={turn.action === "remind" ? "primary" : "secondary"} onPress={remind} />
    : turn.kind === "step" && l.status === "booked" && role !== "tech" ? <Button label={t("lead.makeEstimate")} icon="invoice" full onPress={makeEstimate} />
    : turn.kind === "step" ? <Button label={t("lead.tab.tasks")} icon="check" full variant="secondary" onPress={() => setTab("tasks")} />
    : turn.kind === "snoozed" ? <Button label={t("lead.unsnooze")} icon="refresh" full variant="secondary" onPress={() => toast.show(q(t("lead.unsnoozed")), store.unsnoozeLead(l.id))} />
    : isClosedLead(l) ? <Button label={t("lead.reopen")} icon="refresh" full onPress={() => toast.show(q(t("lead.reopened", { name: l.name })), store.reopenLead(l.id))} />
    : l.customerId ? <Button label={t("lead.openClient")} icon="user" variant="secondary" full onPress={() => router.push(`/client/${l.customerId}`)} />
    : null;
  const statusLabel =
    isClosedLead(l) && l.lostReason
      ? `${t(sv.label)}: ${l.lostReason === "other" && l.lostReasonText ? l.lostReasonText : t(`lead.reason.${l.lostReason}` as DictKey)}`
      : t(sv.label);

  return (
    <Screen
      title={l.name}
      subtitle={[l.number, sourceName(db, l.sourceId), canSeeLeadCost(role) && l.costCents ? money(l.costCents) : null, day(l.receivedAt)].filter(Boolean).join(" · ")}
      right={<IconButton icon="more" label={t("lead.more")} onPress={() => setSheet("status")} />}
    >
      <Card status={turnChip.status}>
        <RowView style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Press onPress={() => setSheet("status")} accessibilityRole="button" accessibilityLabel={`${t("lead.status.title")}: ${statusLabel}`} visibleHeight={component.chip.h}>
            <StatusChip status={sv.status} label={`${statusLabel} ▾`} />
          </Press>
          {turnChip.label ? <StatusChip status={turnChip.status} label={turnChip.label} soft /> : null}
        </RowView>
        {replied !== null ? <T v="caption" tone="mut">{t("lead.repliedIn", { time: fmtWait(replied, t) })}</T> : null}
        <T v="caption" tone="mut">
          {assignee ? t("lead.worksOn", { name: assignee.name }) : t("lead.unassigned")}
          {l.status === "won" ? ` · ${t(l.wonVia === "manual" ? "lead.wonManual" : "lead.wonApproval")}` : ""}
        </T>
        <ContactActions l={l} onCall={isOpenLead(l) ? () => setSheet("call") : undefined} />
      </Card>

      {dupCustomers.length || dups.leads.length ? (
        <CardList>
          {dupCustomers.map((c) => (
            <ItemCard key={c.id} status="warn" title={`⚠ ${t("lead.alreadyClient", { name: c.name })}`} subtitle={t("lead.alreadyClientHint")} onPress={() => router.push(`/client/${c.id}`)} />
          ))}
          {dups.leads.map((d) => (
            <ItemCard key={d.id} status="warn" title={`⚠ ${t("lead.possibleDup", { date: day(d.receivedAt) })}`} subtitle={`${d.name} · ${t(leadStatusView[d.status].label)}`} onPress={() => router.push(`/lead/${d.id}`)} />
          ))}
        </CardList>
      ) : null}

      {main}
      {turn.kind === "step" && turn.title ? (
        <ItemCard title={turn.title} subtitle={turn.dueAt ? `${t("lead.nextTask")} · ${day(turn.dueAt)}` : t("lead.nextTask")} status={turn.status === "bad" ? "bad" : undefined} onPress={() => setTab("tasks")} />
      ) : null}

      <Segmented
        full
        value={tab}
        onChange={setTab}
        items={[
          { key: "overview", label: t("lead.tab.overview") },
          { key: "history", label: t("lead.tab.conversation") },
          { key: "tasks", label: t("lead.tab.tasks") },
          { key: "estimates", label: estimates.length ? `${t("lead.tab.estimates")} · ${estimates.length}` : t("lead.tab.estimates") },
          { key: "files", label: t("lead.tab.files") },
        ]}
      />

      {tab === "overview" ? (
        <>
          <LeadOverview l={l} />
          <SectionTitle title={t("lead.recent")} right={<Button label={t("lead.recent.all")} size="sm" variant="ghost" onPress={() => setTab("history")} />} />
          {events.length ? (
            <CardList>
              {events.slice(0, 3).map((e) => (
                <ItemCard key={e.id} title={t(e.key, Object.fromEntries(Object.entries(e.params ?? {}).map(([k, v]) => [k, v.startsWith("lead.") ? t(v as DictKey) : v])))} subtitle={day(e.at)} />
              ))}
            </CardList>
          ) : null}
        </>
      ) : null}
      {tab === "history" ? (
        <>
          <NotesBlock subjectType="lead" subjectId={l.id} />
          <SectionTitle title={t("lead.tab.conversation")} />
          {events.length ? <LeadHistory l={l} /> : <Empty icon="sms" title={t("lead.conv.empty")} />}
        </>
      ) : null}
      {tab === "tasks" ? (
        <>
          {isOpenLead(l) ? <Button label={t("lead.next.title")} icon="chevronRight" variant="secondary" size="sm" onPress={() => setSheet("next")} /> : null}
          <TasksBlock subjectType="lead" subjectId={l.id} />
          <LeadVisits leadId={l.id} />
        </>
      ) : null}
      {tab === "estimates" ? <LeadEstimates leadId={l.id} onNew={makeEstimate} part="estimates" /> : null}
      {tab === "files" ? <LeadEstimates leadId={l.id} onNew={makeEstimate} part="files" /> : null}

      <ReplySheet leadId={sheet === "reply" ? l.id : null} onClose={() => setSheet(null)} />
      <CallResultSheet key={`call-${sheet === "call"}`} l={l} visible={sheet === "call"} onClose={() => setSheet(null)} onAnswered={() => setSheet("next")} />
      <NextStepSheet office={role !== "tech"} l={l} visible={sheet === "next"} onClose={() => setSheet(null)} onBook={() => setSheet("book")} onEstimate={makeEstimate} onCloseLead={() => setSheet("close")} />
      <BookSheet key={`book-${sheet === "book"}`} l={l} visible={sheet === "book"} onClose={() => setSheet(null)} />
      <SnoozeSheet key={`snooze-${sheet === "snooze"}`} l={l} visible={sheet === "snooze"} onClose={() => setSheet(null)} />
      <StatusSheet
        l={l}
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        onMakeClient={role !== "tech" ? () => setSheet("won") : undefined}
        onCloseLead={() => setSheet("close")}
        onSnooze={() => setSheet("snooze")}
      />
      <LostOrWaitSheet l={l} visible={sheet === "low"} onClose={() => setSheet(null)} />
      <CloseSheet key={`close-${sheet === "close"}`} l={l} visible={sheet === "close"} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === "won"} onClose={() => setSheet(null)} title={t("lead.makeClient")}>
        <T v="caption" tone="mut">{t("lead.makeClientHint")}</T>
        <ChoiceChips value={winReason} onChange={setWinReason} items={MANUAL_WIN_REASONS.map((r) => ({ key: r, label: t(`lead.win.${r}` as DictKey) }))} />
        <TextField type="note" value={winText} onChangeText={setWinText} placeholder={t("lead.winComment")} />
        <Button
          label={t("lead.makeClient")}
          icon="check"
          full
          onPress={() => {
            const text = `${t("lead.wonManualNote")}: ${t(`lead.win.${winReason}` as DictKey)}${winText.trim() ? ` — ${winText.trim()}` : ""}`;
            toast.show(q(t("lead.convertedToast", { name: l.name })), store.convertLead(l.id, text));
            setSheet(null);
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** The "whose turn" chip next to the status. */
function turnLabel(turn: LeadTurn, t: ReturnType<typeof useI18n>["t"], day: (iso: string) => string): { label: string | null; status: StatusName } {
  switch (turn.kind) {
    case "reply":
      return { label: `${t("lead.turn.reply", { time: fmtWait(turn.minutes, t) })}${turn.attempts ? ` · ${t("lead.turn.attempts", { n: turn.attempts })}` : ""}`, status: turn.status };
    case "step":
      return { label: turn.status === "bad" ? t("lead.turn.stepOverdue") : t("lead.turn.step"), status: turn.status };
    case "wait":
      return { label: t("lead.turn.wait", { n: turn.days }), status: turn.status };
    case "noStep":
      return { label: t("lead.turn.noStep"), status: "warn" };
    case "snoozed":
      return { label: t("lead.turn.snoozed", { date: day(turn.until) }), status: "neutral" };
    default:
      return { label: null, status: turn.status };
  }
}

/** "12 min", "3 h 5 min", "2 d" */
function fmtWait(m: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (m < 60) return t("time.min", { n: m });
  if (m < 60 * 24) return t("time.hmin", { h: Math.floor(m / 60), m: m % 60 });
  return t("time.days", { n: Math.floor(m / 1440) });
}

/** Estimate visits for this lead (booked from the card). */
function LeadVisits({ leadId }: { leadId: string }) {
  const { db } = useStore();
  const { t, day, time } = useI18n();
  const l = db.leads.find((x) => x.id === leadId)!;
  const visits = l.propertyId ? db.visits.filter((v) => db.jobs.find((j) => j.id === v.jobId)?.propertyId === l.propertyId) : [];
  if (!visits.length) return null;
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("lead.visits")} />
      <CardList>
        {visits.map((v) => {
          const tech = db.members.find((m) => m.id === v.techId);
          return (
            <ItemCard
              key={v.id}
              status={v.techId ? "info" : "warn"}
              title={`${day(v.start)} · ${time(v.start)}`}
              subtitle={[db.jobs.find((j) => j.id === v.jobId)?.title, tech?.name ?? t("plan.unassigned")].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </CardList>
    </View>
  );
}

/** Estimates of the lead + photos taken on its visits. */
function LeadEstimates({ leadId, onNew, part }: { leadId: string; onNew: () => void; part: "estimates" | "files" }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const { c } = useTheme();
  const l = db.leads.find((x) => x.id === leadId)!;
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const photos = l.propertyId ? db.visits.filter((v) => db.jobs.find((j) => j.id === v.jobId)?.propertyId === l.propertyId).flatMap((v) => v.photos) : [];
  return (
    <View style={{ gap: space[3] }}>
      {part === "estimates" ? (
      <>
      <SectionTitle title={t("client.estimates")} right={isOpenLead(l) ? <Button label={t("lead.makeEstimateShort")} icon="plus" size="sm" variant="ghost" onPress={onNew} /> : undefined} />
      {estimates.length ? (
        <CardList>
          {estimates.map((e) => (
            <ItemCard
              key={e.id}
              status={e.status === "approved" ? "ok" : e.status === "sent" ? "info" : undefined}
              title={[e.number, e.title].filter(Boolean).join(" · ")}
              subtitle={`${money(e.totalCents)}${e.sentAt ? ` · ${t("st.sent")} ${day(e.sentAt)}` : ""}${e.viewedAt ? ` · ${t("ue.viewed", { date: day(e.viewedAt) })}` : ""}`}
              right={
                <StatusChip
                  status={e.status === "approved" ? "ok" : e.status === "sent" ? "info" : "neutral"}
                  label={t(e.status === "approved" ? "st.approved" : e.status === "sent" ? "st.sent" : e.status === "declined" ? "st.declined" : "st.draft")}
                />
              }
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardList>
      ) : (
        <T v="caption" tone="mut">{t("lead.noEstimates")}</T>
      )}
      </>
      ) : null}
      {part === "files" ? (
      <>
      <SectionTitle title={t("lead.photos")} />
      {photos.length ? (
        <Grid>
          {photos.map((p) => (
            <View key={p.id} style={{ height: component.mediaH, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2 }}>
              {p.uri ? <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} /> : null}
            </View>
          ))}
        </Grid>
      ) : (
        <T v="caption" tone="mut">{t("lead.noPhotos")}</T>
      )}
      </>
      ) : null}
    </View>
  );
}
