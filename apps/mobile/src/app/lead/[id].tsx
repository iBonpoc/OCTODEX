import { useState } from "react";
import { visitPropertyId } from "@/data/selectors";
import { Image, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { peopleForLead, phonesOfPeople } from "@/data/people";
import {
  canSeeLead, canSeeLeadCost, findDuplicates, isClosedLead, isOpenLead, leadStatusView, leadTimeline, leadTurn, MANUAL_WIN_REASONS,
  responseMinutes, sourceName, type LeadTurn, type ManualWinReason,
} from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { canSeeClientMoney, canServe, notServed } from "@/features/clients";
import { estView } from "@/features/boards";
import { CloseSheet, ContactActions, LeadHistory, LeadOverview, smsWithBody, TasksBlock } from "@/features/lead/LeadParts";
import { BookSheet, CallResultSheet, LostOrWaitSheet, NextStepSheet, SnoozeSheet, StatusSheet } from "@/features/lead/LeadSheets";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { NotesBlock } from "@/features/NotesBlock";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Empty, Grid, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useTheme } from "@/theme/ThemeProvider";
import { statusIcon, type StatusName } from "@octo/design-tokens";
import { memberLabel } from "@/features/team";
import { ModulePlaces } from "@/modules/ModulePlaces";
import { liveAssignees } from "@/features/schedule";

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
  const mine = peopleForLead(db, l);
  const dups = findDuplicates(db, { phones: phonesOfPeople(mine), emails: mine.flatMap((p) => p.emails.map((e) => e.address)) }, l.id);
  // «do not service» (04 §4, §12): the client of this lead, or a client with the same phone / email — a red mark
  const ownClient = l.customerId ? db.customers.find((c) => c.id === l.customerId) : undefined;
  const closed = notServed([...(ownClient ? [ownClient] : []), ...dups.customers.filter((c) => c.id !== l.customerId)]);
  const closedIds = new Set(closed.map((c) => c.id));
  const dupCustomers = dups.customers.filter((c) => c.id !== l.customerId && !closedIds.has(c.id));
  const servable = canServe(db, l.customerId);
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const assignee = db.members.find((m) => m.id === l.assigneeId);
  const events = leadTimeline(db, l, db.me, t("acct.deletedName"));

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
    : !servable && l.customerId && !isClosedLead(l) ? <Button label={t("lead.openClient")} icon="user" variant="secondary" full onPress={() => router.push(`/client/${l.customerId}`)} />
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
          {assignee ? t("lead.worksOn", { name: memberLabel(assignee, t) ?? "" }) : t("lead.unassigned")}
          {l.status === "won" ? ` · ${t(l.wonVia === "manual" ? "lead.wonManual" : "lead.wonApproval")}` : ""}
        </T>
        <ContactActions l={l} onCall={() => setSheet("call")} />
      </Card>

      {/* clients / leads found by the same phone or email — related objects, there can be several: compact cards (06 «Серия B», B3) */}
      {closed.length || dupCustomers.length || dups.leads.length ? (
        <CardGrid>
          {[
            ...closed.map((c) => (
              <ListCard
                key={c.id}
                density="compact"
                testID={`lead-noservice-${c.id}`}
                lead={{ kind: "icon", icon: statusIcon.bad, tone: "bad" }}
                title={t("lead.noService", { name: c.name })}
                when={c.statusReason ? `${t("lead.noServiceHint")} · ${t("client.reason", { r: c.statusReason })}` : t("lead.noServiceHint")}
                status={{ tone: "bad", label: t("client.st.doNotService") }}
                onPress={() => router.push(`/client/${c.id}`)}
              />
            )),
            ...dupCustomers.map((c) => (
              <ListCard
                key={c.id}
                density="compact"
                testID={`lead-dup-client-${c.id}`}
                lead={{ kind: "icon", icon: statusIcon.warn, tone: "warn" }}
                title={t("lead.alreadyClient", { name: c.name })}
                when={t("lead.alreadyClientHint")}
                edge="warn"
                onPress={() => router.push(`/client/${c.id}`)}
              />
            )),
            ...dups.leads.map((d) => (
              <ListCard
                key={d.id}
                density="compact"
                testID={`lead-dup-lead-${d.id}`}
                lead={{ kind: "icon", icon: statusIcon.warn, tone: "warn" }}
                title={t("lead.possibleDup", { date: day(d.receivedAt) })}
                when={d.name}
                status={{ tone: leadStatusView[d.status].status, label: t(leadStatusView[d.status].label) }}
                edge="warn"
                onPress={() => router.push(`/lead/${d.id}`)}
              />
            )),
          ]}
        </CardGrid>
      ) : null}

      {main}
      {turn.kind === "step" && turn.title ? (
        // one hint about this lead, not a list: Card + ListRow
        <Card status={turn.status === "bad" ? "bad" : undefined} style={{ paddingVertical: space[1] }}>
          <ListRow title={turn.title} subtitle={turn.dueAt ? `${t("lead.nextTask")} · ${day(turn.dueAt)}` : t("lead.nextTask")} left={<Icon name="check" />} onPress={() => setTab("tasks")} />
        </Card>
      ) : null}

      {/* add-on modules' place (docs/specs/33 П15): nothing unless a module is switched on */}
      <ModulePlaces place="lead" ctx={{ leadId: l.id, customerId: l.customerId, propertyId: l.propertyId }} />
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
          <ServiceCategoryRow value={l.serviceCategoryId} onChange={(id) => toast.show(t("dir.changed"), store.updateLead(l.id, { serviceCategoryId: id }))} />
          <SectionTitle title={t("lead.recent")} right={<Button label={t("lead.recent.all")} size="sm" variant="ghost" onPress={() => setTab("history")} />} />
          {events.length ? (
            <CardGrid>
              {events.slice(0, 3).map((e) => (
                <ListCard
                  key={e.id}
                  density="compact"
                  lead={{ kind: "icon", icon: "clock" }}
                  title={t(e.key, Object.fromEntries(Object.entries(e.params ?? {}).map(([k, v]) => [k, v.startsWith("lead.") ? t(v as DictKey) : v])))}
                  when={day(e.at)}
                />
              ))}
            </CardGrid>
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
      <CallResultSheet key={`call-${sheet === "call"}`} l={l} visible={sheet === "call"} onClose={() => setSheet(null)} onAnswered={() => (isOpenLead(l) ? setSheet("next") : undefined)} />
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
  // the lead's inspections (no job) and any visit at its property
  const visits = db.visits.filter((v) => v.leadId === l.id || (!!l.propertyId && visitPropertyId(db, v) === l.propertyId));
  if (!visits.length) return null;
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("lead.visits")} />
      <CardGrid>
        {visits.map((v) => {
          const tech = db.members.find((m) => m.id === v.techId);
          const nobody = !liveAssignees(v, db.members).length;
          return (
            // as the property's visits (B2): what the visit is for, then date · time · who; nobody on it — warn icon + edge
            <ListCard
              key={v.id}
              density="compact"
              testID={`lead-visit-${v.id}`}
              lead={nobody ? { kind: "icon", icon: statusIcon.warn, tone: "warn" } : { kind: "icon", icon: "calendar" }}
              title={v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.title || t("prop.h.visit") : t("st.inspection")}
              when={[day(v.start), time(v.start), memberLabel(tech, t) ?? t("plan.unassigned")].filter(Boolean).join(" · ")}
              edge={nobody ? "warn" : null}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </CardGrid>
    </View>
  );
}

/** Estimates of the lead + photos taken on its visits. */
function LeadEstimates({ leadId, onNew, part }: { leadId: string; onNew: () => void; part: "estimates" | "files" }) {
  const { db, role } = useStore();
  const { t, money, day } = useI18n();
  const { c } = useTheme();
  const l = db.leads.find((x) => x.id === leadId)!;
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const photos = db.visits.filter((v) => v.leadId === l.id || (!!l.propertyId && visitPropertyId(db, v) === l.propertyId)).flatMap((v) => v.photos);
  return (
    <View style={{ gap: space[3] }}>
      {part === "estimates" ? (
      <>
      <SectionTitle title={t("client.estimates")} right={isOpenLead(l) ? <Button label={t("lead.makeEstimateShort")} icon="plus" size="sm" variant="ghost" onPress={onNew} /> : undefined} />
      {estimates.length ? (
        <CardGrid>
          {estimates.map((e) => (
            // title — what the estimate is for, under it number · sent · viewed; the sum only to who sees client money (not the tech)
            <ListCard
              key={e.id}
              density="compact"
              testID={`lead-estimate-${e.id}`}
              lead={{ kind: "icon", icon: "invoice" }}
              title={e.title || e.number || t("est.detail")}
              when={[e.title ? e.number : undefined, e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : undefined, e.viewedAt ? t("ue.viewed", { date: day(e.viewedAt) }) : undefined].filter(Boolean).join(" · ") || undefined}
              value={canSeeClientMoney(role) ? money(e.totalCents) : undefined}
              status={{ tone: estView[e.status].s, label: t(estView[e.status].l) }}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardGrid>
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
