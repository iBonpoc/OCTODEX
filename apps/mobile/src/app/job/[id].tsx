import { lateAfterOf } from "@/features/scheduleSettings";
import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { jobProfit, useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import type { DB, Job } from "@/data/types";
import { canSeeProfit } from "@/nav/roles";
import { useI18n, type DictKey } from "@/i18n";
import { ContractStatement } from "@/features/ContractStatement";
import { jobStatusView } from "@/features/jobs";
import { enRouteSms, filterJobHistory, jobHistory, nextOpenVisit, type JobHistoryFilter } from "@/features/jobHistory";
import { canSeeGateCode } from "@/features/properties";
import { RelatedBlock } from "@/features/RelatedBlock";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { smsWithBody } from "@/features/sms";
import { useToast } from "@/ui/overlays";
import { visitStatus } from "@/features/visits";
import { Button, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";

type Tab = "details" | "money" | "history";

/** the job's type word: a preset in the app's language, or the company's own name */
function jobTypeLabel(db: DB, j: Job, t: (k: DictKey) => string): string | undefined {
  const jt = (db.jobTypes ?? []).find((x) => x.id === j.jobTypeId);
  if (!jt) return undefined;
  return jt.name ?? (jt.seedKey ? t(`job3.jt.${jt.seedKey}` as DictKey) : undefined);
}

/** Job (13 §3.4, 17-job §7.1): «Связано», then Детали · Деньги · История. */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day, time } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("details");
  const [filter, setFilter] = useState<JobHistoryFilter>("all");
  const [noteText, setNoteText] = useState("");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/jobs"));
  const j = findJob(db, id);
  if (!j)
    return (
      <Screen title={t("jobs.title")} back={back}>
        <Empty icon="wrench" title={t("clients.empty")} />
      </Screen>
    );
  const p = db.properties.find((x) => x.id === j.propertyId);
  const c = db.customers.find((x) => x.id === (j.customerId ?? p?.customerId));
  const visits = db.visits.filter((v) => v.jobId === j.id).sort((a, b) => a.start.localeCompare(b.start));
  const next = nextOpenVisit(db, j.id);
  const expenses = db.expenses.filter((x) => x.jobId === j.id);
  const pr = jobProfit(db, j.id);
  const st = jobStatusView[j.status];
  const tel = (c?.phone ?? "").replace(/[^\d+]/g, "");
  const addr = [p?.address, p?.city].filter(Boolean).join(", ");
  const showMoney = canSeeProfit(store.role);
  const invoices = db.invoices.filter((i) => i.jobId === j.id);
  const dueCents = invoices.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const openInvoice = invoices.find((i) => i.totalCents > i.paidCents);
  const team = [...new Set(visits.flatMap((v) => v.assigneeIds ?? (v.techId ? [v.techId] : [])))]
    .map((mid) => db.members.find((m) => m.id === mid)?.name)
    .filter(Boolean)
    .join(", ");
  const typeLabel = jobTypeLabel(db, j, t);
  const title = j.number ? t("job3.title", { no: j.number }) : t("job3.newJob");

  // «В пути»: until our own number the phone's SMS opens with a ready text in the CLIENT's language (rule 7)
  const enRoute = () => {
    if (!tel) return toast.show(t("job3.noPhone"));
    Linking.openURL(smsWithBody(tel, enRouteSms(db, c?.id, time(next?.start ?? new Date().toISOString())))).catch(() => {});
  };
  const gate = p ? canSeeGateCode(db, store.role, p.id) : false;
  const addNote = () => {
    const body = noteText.trim();
    if (!body) return;
    toast.show(store.online ? t("notes.added") : t("offline.queued"), store.addNote({ subjectType: "job", subjectId: j.id, body, visibility: "team" }));
    setNoteText("");
  };

  const details = (
    <>
      <RowView style={{ flexWrap: "wrap" }}>
        {next ? <Button label={t("job3.act.start")} icon="check" size="sm" variant="primary" onPress={() => router.push(`/visit/${next.id}`)} /> : null}
        {next ? <Button label={t("job3.act.enRoute")} icon="navigate" size="sm" variant="secondary" onPress={enRoute} /> : null}
        {openInvoice ? (
          <Button label={t("job3.act.pay")} icon="dollar" size="sm" variant="secondary" onPress={() => router.push(`/invoice/${openInvoice.id}`)} />
        ) : next && next.amountDueCents > 0 ? (
          <Button label={t("job3.act.pay")} icon="dollar" size="sm" variant="secondary" onPress={() => router.push(`/visit/${next.id}`)} />
        ) : null}
        <Button label={t("job3.act.note")} icon="note" size="sm" variant="secondary" onPress={() => setTab("history")} />
        {next ? <Button label={t("job3.act.file")} icon="camera" size="sm" variant="secondary" onPress={() => router.push(`/visit/${next.id}`)} /> : null}
      </RowView>

      <Card status={st.status}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }}>
            {j.title}
          </T>
          <StatusChip status={st.status} label={t(st.label)} />
        </RowView>
        {j.description ? <T v="body">{j.description}</T> : null}
        {addr ? (
          <T v="body" tone="mut">
            {addr}
          </T>
        ) : null}
        <RowView style={{ flexWrap: "wrap" }}>
          {tel ? <Button label={t("client.call")} icon="phone" variant="secondary" size="sm" onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
          {tel ? <Button label={t("visit.message")} icon="sms" variant="secondary" size="sm" onPress={() => Linking.openURL(`sms:${tel}`)} /> : null}
          {addr ? <Button label={t("jobs.route")} icon="route" variant="secondary" size="sm" onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`)} /> : null}
        </RowView>
      </Card>

      {p?.accessNotes || (p?.gateCode && gate) ? (
        <Card>
          <T v="heading">{t("job3.access")}</T>
          {p.accessNotes ? <T v="body">{p.accessNotes}</T> : null}
          {p.gateCode && gate ? (
            <T v="body" tabular>
              {t("prop.gate")}: {p.gateCode}
            </T>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle
        title={t("job3.schedule")}
        right={<Button label={visits.length ? t("sch.another") : t("sch.title")} icon="calendar" size="sm" variant={visits.length ? "ghost" : "primary"} onPress={() => router.push(`/job/schedule?jobId=${j.id}`)} />}
      />
      {next ? (
        <T v="body" tone="mut">
          {t("job3.next", { date: day(next.start), time: time(next.start) })}
        </T>
      ) : null}
      {visits.length ? (
        <CardList>
          {visits.map((v) => {
            const vs = visitStatus(v, Date.now(), lateAfterOf(db));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              <ItemCard
                key={v.id}
                status={vs.status}
                title={`${day(v.start)} · ${time(v.start)}`}
                subtitle={[tech?.name ?? t("sch.noTech"), `${v.durationMin} ${t("sch.min")}`].join(" · ")}
                right={<StatusChip status={vs.status} label={t(vs.label)} />}
                onPress={() => router.push(`/visit/${v.id}`)}
              />
            );
          })}
        </CardList>
      ) : (
        <T v="caption" tone="mut">
          {t("job3.noVisit")}
        </T>
      )}

      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("job3.type")}
          </T>
          <T v="body">{typeLabel ?? t("job3.noType")}</T>
        </RowView>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("job3.team")}
          </T>
          <T v="body" style={{ flexShrink: 1, textAlign: "right" }}>
            {team || t("job3.noTeam")}
          </T>
        </RowView>
      </Card>
      <ServiceCategoryRow value={j.serviceCategoryId} onChange={(cid) => toast.show(t("dir.changed"), store.setJobCategory(j.id, cid))} />
    </>
  );

  const moneyTab = showMoney ? (
    <>
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {c?.name ?? ""}
          </T>
          <T v="title" tabular>
            {money(j.amountCents)}
          </T>
        </RowView>
      </Card>
      {j.amountCents > 0 ? <ContractStatement jobId={j.id} /> : null}
      {!j.estimateId ? (
        <T v="caption" tone="mut">
          {t("job3.positionsLater")}
        </T>
      ) : null}
      <View style={{ gap: space[2] }}>
        <SectionTitle title={t("jobs.costs")} right={<Button label={t("quick.receipt")} icon="plus" size="sm" variant="ghost" onPress={() => router.push("/expense/new")} />} />
        {expenses.length ? (
          <CardList>
            {expenses.map((x) => (
              <ItemCard key={x.id} title={x.vendor} subtitle={`${t(`exp.cat.${x.category}`)} · ${day(x.at)}`} right={<T v="body" tabular>{money(x.amountCents)}</T>} />
            ))}
          </CardList>
        ) : null}
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" tone="mut">
              {t("jobs.expenses")}
            </T>
            <T v="body" tabular>
              {money(pr.expenses)}
            </T>
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="heading">{t("jobs.profit")}</T>
            <T v="title" tabular tone={pr.profit < 0 ? "bad" : "ink"}>
              {money(pr.profit)}
              {pr.marginPct !== null ? ` · ${pr.marginPct}%` : ""}
            </T>
          </RowView>
        </Card>
      </View>
    </>
  ) : (
    // the technician: only «К оплате» and the invoices of his job (13 §3.4 «Деньги», 15-flows §4 в. 3)
    <>
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("job3.dueNow")}
          </T>
          <T v="title" tabular>
            {money(dueCents || (next?.amountDueCents ?? 0))}
          </T>
        </RowView>
      </Card>
      {invoices.length ? (
        <CardList>
          {invoices.map((i) => (
            <ItemCard key={i.id} title={i.number ?? t("inv.title")} subtitle={i.title} right={<T v="body" tabular>{money(Math.max(0, i.totalCents - i.paidCents))}</T>} onPress={() => router.push(`/invoice/${i.id}`)} />
          ))}
        </CardList>
      ) : null}
    </>
  );

  const items = filterJobHistory(jobHistory(db, j.id, store.role), filter);
  const historyTab = (
    <>
      <Segmented
        full
        value={filter}
        onChange={setFilter}
        items={[
          { key: "all", label: t("job3.f.all") },
          { key: "action", label: t("job3.f.action") },
          { key: "note", label: t("job3.f.note") },
          { key: "call", label: t("job3.f.call") },
        ]}
      />
      {items.length ? (
        <CardList>
          {items.map((e) => (
            <ItemCard
              key={e.id}
              title={t(e.title)}
              subtitle={[day(e.at), e.reason ? t(e.reason) : undefined, e.detail].filter(Boolean).join(" · ")}
              right={e.cents !== undefined ? <T v="body" tabular>{money(e.cents)}</T> : undefined}
              onPress={e.href ? () => router.push(e.href as never) : undefined}
            />
          ))}
        </CardList>
      ) : (
        <Empty icon="history" title={t("job3.h.empty")} />
      )}
      {/* the note goes into this history (one list, 17-job §7.1): only the field here, no second list */}
      <RowView>
        <View style={{ flex: 1 }}>
          <TextField type="note" value={noteText} onChangeText={setNoteText} placeholder={t("notes.placeholder")} />
        </View>
        <Button label={t("notes.add")} icon="send" size="sm" variant="secondary" disabled={!noteText.trim()} onPress={addNote} />
      </RowView>
    </>
  );

  return (
    <Screen title={title} back={back} subtitle={[j.title, c?.name].filter(Boolean).join(" · ")} fab="job" fabCtx={{ jobId: j.id, customerId: c?.id, propertyId: p?.id }}>
      <RelatedBlock of={{ type: "job", id: j.id }} />
      <Segmented
        full
        value={tab}
        onChange={setTab}
        items={[
          { key: "details", label: t("job3.tab.details") },
          { key: "money", label: t("job3.tab.money") },
          { key: "history", label: t("job3.tab.history") },
        ]}
      />
      {tab === "details" ? details : tab === "money" ? moneyTab : historyTab}
    </Screen>
  );
}
