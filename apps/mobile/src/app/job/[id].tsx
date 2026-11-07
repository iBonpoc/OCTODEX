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
import { jobServable, jobStatusView } from "@/features/jobs";
import { peopleOf } from "@/data/people";
import { cleanPhone, telHref } from "@/features/contactLinks";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { enRouteSms, filterJobHistory, jobHistory, nextOpenVisit, type JobHistoryFilter } from "@/features/jobHistory";
import { canSeeGateCode } from "@/features/properties";
import { canPlan } from "@/features/schedule";
import { completeBlock, jobAwaitingClose } from "@/features/jobDone";
import { contractStatement } from "@octo/estimating-engine";
import { RelatedBlock } from "@/features/RelatedBlock";
import { JobLinesBlock } from "@/features/JobLinesBlock";
import { JobTypeTags } from "@/features/JobTypeTags";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { smsWithBody } from "@/features/sms";
import { useToast } from "@/ui/overlays";
import { visitStatus } from "@/features/visits";
import { Button, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { memberLabel, memberName } from "@/features/team";

type Tab = "details" | "money" | "history";

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
  const [restSent, setRestSent] = useState(false);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
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
  const tel = cleanPhone(c?.phone);
  const [main] = c ? peopleOf(c) : [];
  // «Не обслуживаем» (17-job §11.1): no new visit or estimate from this job; the visit already set is finished as usual
  const servable = jobServable(db, j);
  const call = () => {
    const href = telHref(tel);
    if (href) Linking.openURL(href).catch(() => {});
    // wave 6: after «Позвонить» the call is written on this job (the sheet asks the outcome)
    setCalling({ subjectType: "job", subjectId: j.id, contactId: main?.id });
  };
  const sms = () => {
    // wave 6-3: a ready text in the client's language through the messages sheet; without a person — the phone's SMS
    if (c && main) return setWriting({ owner: { type: "customer", id: c.id }, person: main });
    Linking.openURL(smsWithBody(tel, "")).catch(() => {});
  };
  const addr = [p?.address, p?.city].filter(Boolean).join(", ");
  const showMoney = canSeeProfit(store.role);
  const invoices = db.invoices.filter((i) => i.jobId === j.id);
  const dueCents = invoices.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const openInvoice = invoices.find((i) => i.totalCents > i.paidCents);
  const team = [...new Set(visits.flatMap((v) => v.assigneeIds ?? (v.techId ? [v.techId] : [])))]
    .map((mid) => memberName(db, mid, t))
    .filter(Boolean)
    .join(", ");
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

  // S10: «Да, выполнена» / «Завершить работу» — the office, no open visit (the server checks the same in complete_job)
  const office = canPlan([store.role]);
  const awaiting = jobAwaitingClose(db, j);
  const rest = contractStatement(j.amountCents, invoices).toInvoice;
  const complete = () => {
    const block = completeBlock(db, j);
    if (block === "openVisits") return toast.show(t("job3.done.openVisits"));
    if (block === "notStarted") return toast.show(t("job3.done.notStarted"));
    if (block) return;
    toast.show(store.online ? t("job3.done.closed") : t("offline.queued"), store.completeJob(j.id));
  };
  const invoiceRest = () => {
    // one tap = one balance invoice (a double tap before the re-render made two)
    if (restSent) return;
    setRestSent(true);
    toast.show(store.online ? t("job3.done.invoiced") : t("offline.queued"), store.issueInvoice(j.id, "final", rest, t("job3.done.restTitle")));
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

      {office && awaiting ? (
        // S10 (13 §3.4.1): the last visit is over — the office decides; the technician is never asked
        <Card status="info">
          <T v="heading">{t("job3.done.ask")}</T>
          <T v="body" tone="mut">
            {t("job3.done.askHint")}
          </T>
          <RowView style={{ flexWrap: "wrap" }}>
            <Button label={t("job3.done.yes")} icon="check" variant="primary" size="sm" onPress={complete} />
            {servable ? <Button label={t("job3.done.more")} icon="calendar" variant="secondary" size="sm" onPress={() => router.push(`/job/schedule?jobId=${j.id}`)} /> : null}
          </RowView>
        </Card>
      ) : null}
      {office && j.status === "done" && rest > 0 && !restSent ? (
        <Button label={t("job3.done.invoiceRest", { amount: money(rest) })} icon="invoice" variant="primary" full onPress={invoiceRest} />
      ) : null}

      <Card status={st.status}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }}>
            {j.title}
          </T>
          <StatusChip status={st.status} label={t(st.label)} />
        </RowView>
        {j.description ? <T v="body">{j.description}</T> : null}
        {office && j.status !== "done" && j.status !== "unscheduled" && !awaiting ? (
          <Button label={t("job3.done.complete")} icon="check" size="sm" variant="ghost" onPress={complete} />
        ) : null}
        {addr ? (
          <T v="body" tone="mut">
            {addr}
          </T>
        ) : null}
        <RowView style={{ flexWrap: "wrap" }}>
          {tel ? <Button label={t("client.call")} icon="phone" variant="secondary" size="sm" onPress={call} /> : null}
          {tel ? <Button label={t("visit.message")} icon="sms" variant="secondary" size="sm" onPress={sms} /> : null}
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

      {!servable ? (
        <Card status="warn">
          <RowView>
            <StatusChip status="warn" label={t("client.st.doNotService")} />
          </RowView>
          <T v="body">{t("job5.noService")}</T>
          <T v="caption" tone="mut">
            {t("job5.noServiceHint")}
          </T>
        </Card>
      ) : null}
      <SectionTitle
        title={t("job3.schedule")}
        right={j.status === "done" || !servable ? undefined : <Button label={visits.length ? t("sch.another") : t("sch.title")} icon="calendar" size="sm" variant={visits.length ? "ghost" : "primary"} onPress={() => router.push(`/job/schedule?jobId=${j.id}`)} />}
      />
      {next ? (
        <T v="body" tone="mut">
          {t("job3.next", { date: day(next.start), time: time(next.start) })}
        </T>
      ) : null}
      {visits.length ? (
        <CardList>
          {visits.map((v) => {
            const vs = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              <ItemCard
                key={v.id}
                status={vs.status}
                title={`${day(v.start)} · ${time(v.start)}`}
                subtitle={[memberLabel(tech, t) ?? t("sch.noTech"), `${v.durationMin} ${t("sch.min")}`].join(" · ")}
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
        <JobTypeTags job={j} canEdit={office} />
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
      <JobLinesBlock job={j} />
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
    <Screen title={title} back={back} subtitle={[j.title, c?.name].filter(Boolean).join(" · ")} fab="job" fabCtx={servable ? { jobId: j.id, customerId: c?.id, propertyId: p?.id } : {}}>
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
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </Screen>
  );
}
