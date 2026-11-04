import { useState } from "react";
import { Image, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { LEAD_FUNNEL } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import {
  canSeeLead, canSeeLeadCost, findDuplicates, isClosedLead, isOpenLead, leadStatusView, MANUAL_WIN_REASONS, needsNextStep, nextStep,
  openTasks, responseMinutes, sourceName, waitingMinutes, waitStatus, type ManualWinReason,
} from "@/features/leads";
import { CloseSheet, ContactActions, LeadHistory, LeadOverview, smsWithBody, TasksBlock } from "@/features/lead/LeadParts";
import { NotesBlock } from "@/features/NotesBlock";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, Segmented, StatusChip, Steps, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, Grid, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "overview" | "history" | "tasks" | "estimates";

/**
 * Lead card (founder 04.11). Header: status + reply timer, source · cost, who works it, duplicates, contact actions,
 * ONE main "next step" button. Tabs: Overview (contact, people, address, request, source) · History · Tasks & visits · Estimates & photos.
 */
export default function LeadScreen() {
  useTick();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, day, money } = useI18n();
  const toast = useToast();
  const [tab, setTab] = usePersistentState<Tab>("octo.leadTab.v1", "overview");
  const [sheet, setSheet] = useState<"won" | "close" | "reply" | null>(null);
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
  const wait = waitingMinutes(l);
  const replied = responseMinutes(l);
  const step = nextStep(l);
  const dups = findDuplicates(db, { phone: l.phone, phone2: l.phone2, email: l.email }, l.id);
  const dupCustomers = dups.customers.filter((c) => c.id !== l.customerId);
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const assignee = db.members.find((m) => m.id === l.assigneeId);
  const tasks = openTasks(db, l.id);

  const makeEstimate = () => {
    const target = store.leadEstimateTarget(l.id);
    if (target) router.push(`/estimate/new?customerId=${target.customerId}&propertyId=${target.propertyId}&leadId=${l.id}`);
  };
  const remind = () => {
    const e = estimates.find((x) => x.status === "sent");
    Linking.openURL(smsWithBody(l.phone, t("lead.remindText", { name: l.name.split(" ")[0] ?? l.name, title: e?.title ?? "" }))).catch(() => {});
    store.touchLead(l.id, "sms");
  };
  const main =
    step === "reply" ? <Button label={t("inbox.reply")} icon="send" full onPress={() => setSheet("reply")} />
    : step === "book" ? <Button label={t("inbox.book")} icon="calendar" full onPress={() => toast.show(q(t("toast.bookedTomorrow", { name: l.name })), store.bookLead(l.id))} />
    : step === "estimate" ? <Button label={t("lead.makeEstimate")} icon="invoice" full onPress={makeEstimate} />
    : step === "remind" ? <Button label={t("lead.remind")} icon="sms" full onPress={remind} />
    : isClosedLead(l) ? <Button label={t("lead.reopen")} icon="refresh" full onPress={() => toast.show(q(t("lead.reopened", { name: l.name })), store.reopenLead(l.id))} />
    : l.customerId ? <Button label={t("lead.openClient")} icon="user" variant="secondary" full onPress={() => router.push(`/client/${l.customerId}`)} />
    : null;

  return (
    <Screen
      title={l.name}
      subtitle={[sourceName(db, l.sourceId), canSeeLeadCost(role) && l.costCents ? money(l.costCents) : null, day(l.receivedAt)].filter(Boolean).join(" · ")}
    >
      <Card status={wait !== null ? waitStatus(wait) : sv.status}>
        <RowView style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          {wait !== null ? (
            <StatusChip status={waitStatus(wait)} label={t("lead.waiting", { time: fmtWait(wait, t) })} />
          ) : (
            <StatusChip
              status={sv.status}
              label={isClosedLead(l) && l.lostReason ? `${t(sv.label)}: ${l.lostReason === "other" && l.lostReasonText ? l.lostReasonText : t(`lead.reason.${l.lostReason}` as DictKey)}` : t(sv.label)}
            />
          )}
          {replied !== null ? <T v="caption" tone="mut">{t("lead.repliedIn", { time: fmtWait(replied, t) })}</T> : null}
        </RowView>
        {isOpenLead(l) || l.status === "won" ? <Steps labels={LEAD_FUNNEL.map((s) => t(leadStatusView[s].label))} current={LEAD_FUNNEL.indexOf(l.status)} /> : null}
        <T v="caption" tone="mut">
          {assignee ? t("lead.worksOn", { name: assignee.name }) : t("lead.unassigned")}
          {l.status === "won" ? ` · ${t(l.wonVia === "manual" ? "lead.wonManual" : "lead.wonApproval")}` : ""}
        </T>
        <ContactActions l={l} />
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
      {needsNextStep(db, l) ? (
        <Card status="warn">
          <T v="body">⚠ {t("lead.noNextStep")}</T>
          <Button label={t("task.new")} icon="plus" size="sm" variant="secondary" onPress={() => setTab("tasks")} />
        </Card>
      ) : tasks[0] ? (
        <ItemCard title={tasks[0].title} subtitle={t("lead.nextTask")} left={undefined} onPress={() => setTab("tasks")} />
      ) : null}
      {isOpenLead(l) ? (
        <RowView style={{ flexWrap: "wrap" }}>
          {step !== "estimate" ? <Button label={t("lead.makeEstimateShort")} icon="invoice" variant="secondary" size="sm" onPress={makeEstimate} /> : null}
          {canSeeLeadCost(role) ? <Button label={t("lead.makeClient")} icon="check" variant="ghost" size="sm" onPress={() => setSheet("won")} /> : null}
          <Button label={t("lead.closeTitle")} icon="close" variant="ghost" size="sm" onPress={() => setSheet("close")} />
        </RowView>
      ) : null}

      <Segmented
        full
        value={tab}
        onChange={setTab}
        items={[
          { key: "overview", label: t("lead.tab.overview") },
          { key: "history", label: t("lead.tab.history") },
          { key: "tasks", label: tasks.length ? `${t("lead.tab.tasks")} · ${tasks.length}` : t("lead.tab.tasks") },
          { key: "estimates", label: estimates.length ? `${t("lead.tab.estimates")} · ${estimates.length}` : t("lead.tab.estimates") },
        ]}
      />

      {tab === "overview" ? <LeadOverview l={l} /> : null}
      {tab === "history" ? (
        <>
          <NotesBlock subjectType="lead" subjectId={l.id} />
          <SectionTitle title={t("lead.tab.history")} />
          <LeadHistory l={l} />
        </>
      ) : null}
      {tab === "tasks" ? (
        <>
          <TasksBlock subjectType="lead" subjectId={l.id} />
          <LeadVisits leadId={l.id} />
        </>
      ) : null}
      {tab === "estimates" ? <LeadEstimates leadId={l.id} onNew={makeEstimate} /> : null}

      <ReplySheet leadId={sheet === "reply" ? l.id : null} onClose={() => setSheet(null)} />
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
function LeadEstimates({ leadId, onNew }: { leadId: string; onNew: () => void }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const { c } = useTheme();
  const l = db.leads.find((x) => x.id === leadId)!;
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const photos = l.propertyId ? db.visits.filter((v) => db.jobs.find((j) => j.id === v.jobId)?.propertyId === l.propertyId).flatMap((v) => v.photos) : [];
  return (
    <View style={{ gap: space[3] }}>
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
    </View>
  );
}
