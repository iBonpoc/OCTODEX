import { lateAfterOf } from "@/features/scheduleSettings";
import { visitDueCents } from "@/features/visitDue";
import { useRef, useState, type ComponentRef } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { jobProfit, useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import type { DB, Job } from "@/data/types";
import { canSeeProfit } from "@/nav/roles";
import { JobOrdersBlock } from "@/features/JobOrdersBlock";
import { useI18n, type DictKey } from "@/i18n";
import { ContractStatement } from "@/features/ContractStatement";
import { jobServable, jobStatusView } from "@/features/jobs";
import { peopleOf } from "@/data/people";
import { cleanPhone, telHref } from "@/features/contactLinks";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { enRouteSms, filterJobHistory, jobHistory, nextOpenVisit, type JobHistoryFilter } from "@/features/jobHistory";
import { canSeeGateCode } from "@/features/properties";
import { canPlan, visitWhen } from "@/features/schedule";
import { completeBlock, jobAwaitingClose } from "@/features/jobDone";
import { contractStatement } from "@octo/estimating-engine";
import { RelatedBlock } from "@/features/RelatedBlock";
import { JobLinesBlock, canEditJobLines } from "@/features/JobLinesBlock";
import { JobTypeTags } from "@/features/JobTypeTags";
import { jobChecklistVisit } from "@/features/checklist";
import { ChecklistEditor } from "@/features/VisitChecklist";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { smsWithBody } from "@/features/sms";
import { Menu, useToast } from "@/ui/overlays";
import { useDevice } from "@/theme/ThemeProvider";
import { ActionTile } from "@/features/ActionTile";
import { visitStatus } from "@/features/visits";
import { Button, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { memberLabel, memberName } from "@/features/team";
import { canSeeJob } from "@/features/access";

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
  const [focusNote, setFocusNote] = useState(false);
  const [restSent, setRestSent] = useState(false);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { wide } = useDevice();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/jobs"));
  const j = findJob(db, id);
  if (!j)
    return (
      <Screen title={t("jobs.title")} back={back}>
        <Empty icon="wrench" title={t("clients.empty")} />
      </Screen>
    );
  // a job with no visit of this tech (#868): no access
  if (!canSeeJob(db, { role: store.role, mode: store.mode, me: db.me }, j.id))
    return (
      <Screen title={t("jobs.title")} back={back}>
        <Empty icon="wrench" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );
  const p = db.properties.find((x) => x.id === j.propertyId);
  const c = db.customers.find((x) => x.id === (j.customerId ?? p?.customerId));
  const visits = db.visits.filter((v) => v.jobId === j.id).sort((a, b) => a.start.localeCompare(b.start));
  const next = nextOpenVisit(db, j.id);
  const chkVisit = jobChecklistVisit(db, store.role, j.id);
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
    const undo = store.issueInvoice(j.id, "final", rest, t("job3.done.restTitle"));
    // #865: refused (above the contract) — said so, nothing to undo; the button works again
    if (!undo) {
      setRestSent(false);
      toast.show(t("inv.overContract.screen"));
      return;
    }
    toast.show(store.online ? t("job3.done.invoiced") : t("offline.queued"), undo);
  };

  // where «Оплата» leads: the open invoice, else the visit that takes money on site
  const payTo = openInvoice ? `/invoice/${openInvoice.id}` : next && visitDueCents(db, next) > 0 ? `/visit/${next.id}` : null;
  const restShown = office && j.status === "done" && rest > 0 && !restSent;
  // the one yellow button (rule 2): the «выполнена?» card and «Выставить остаток» are the main step themselves when shown
  const mainStep: { key: "start" | "pay"; label: DictKey; icon: "check" | "dollar"; onPress: () => void } | null =
    (office && awaiting) || restShown
      ? null
      : next
        ? { key: "start", label: "job3.main.start", icon: "check", onPress: () => router.push(`/visit/${next.id}`) }
        : payTo
          ? { key: "pay", label: "job3.main.pay", icon: "dollar", onPress: () => router.push(payTo as never) }
          : null;
  // the technician on his way: «В пути» stays in sight beside the main step (Jobber/HCP «On my way»); the office has it in «⋯»
  const enRouteShown = !!next && !!mainStep && mainStep.key === "start" && !office;
  const moreItems = [
    ...(next && !enRouteShown ? [{ key: "enRoute", label: t("job3.more.enRoute"), icon: "navigate" as const, testID: "job-act-enRoute" }] : []),
    ...(payTo && mainStep?.key !== "pay" ? [{ key: "pay", label: t("job3.more.pay"), icon: "dollar" as const, testID: "job-act-pay" }] : []),
    { key: "note", label: t("job3.more.note"), icon: "note" as const, testID: "job-act-note" },
    ...(next ? [{ key: "file", label: t("job3.more.file"), icon: "camera" as const, testID: "job-act-file" }] : []),
  ];
  const more = (
    <View ref={moreRef} collapsable={false} testID="job-more">
      <IconButton
        icon="more"
        label={`${t("lead.more")}: ${title}`}
        onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))}
      />
    </View>
  );

  const details = (
    <>

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
      {restShown ? (
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
        {/* Позвонить · Написать · Маршрут — round tiles with a word, as on the client's card (#1343, #1474) */}
        {tel || addr ? (
          <View testID="job-contact" style={{ flexDirection: "row", gap: space[2], maxWidth: wide ? component.panelW : undefined }}>
            {tel ? <ActionTile testID="job-call" icon="phone" label={t("client.call")} onPress={call} /> : null}
            {tel ? <ActionTile testID="job-write" icon="sms" label={t("visit.message")} onPress={sms} /> : null}
            {addr ? <ActionTile testID="job-route" icon="route" label={t("jobs.route")} onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`)} /> : null}
          </View>
        ) : null}
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
          {t("job3.next", { date: day(next.start), time: visitWhen(next, time, t("plan5.allDay"), false) })}
        </T>
      ) : null}
      {visits.length ? (
        <CardGrid>
          {visits.map((v) => {
            const vs = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              // the job's own visits (06 «Серия B», B4): when — the title, who · how long under it, the visit's status chip
              <ListCard
                key={v.id}
                density="compact"
                testID={`job-visit-${v.id}`}
                lead={{ kind: "icon", icon: "calendar" }}
                title={`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"), false)}`}
                when={[memberLabel(tech, t) ?? t("sch.noTech"), v.allDay ? undefined : `${v.durationMin} ${t("sch.min")}`].filter(Boolean).join(" · ")}
                status={{ tone: vs.status, label: t(vs.label) }}
                onPress={() => router.push(`/visit/${v.id}`)}
              />
            );
          })}
        </CardGrid>
      ) : (
        <T v="caption" tone="mut">
          {t("job3.noVisit")}
        </T>
      )}
      {/* #606: the office edits the checklist of the job's first visit not started yet — the same editor as on the visit */}
      {chkVisit ? <ChecklistEditor key={chkVisit.id} v={chkVisit} title={t("chk4.jobVisit", { date: `${day(chkVisit.start)} · ${visitWhen(chkVisit, time, t("plan5.allDay"), false)}` })} /> : null}

      {/* spec 37: the job's supplier orders (the office makes them; the tech sees where to pick up, no prices) */}
      <JobOrdersBlock job={j} />

      <Card>
        <JobTypeTags job={j} canEdit={canEditJobLines(store.role)} />
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
          <CardGrid>
            {expenses.map((x) => (
              <ListCard
                key={x.id}
                density="compact"
                testID={`job-expense-${x.id}`}
                lead={{ kind: "icon", icon: "wallet" }}
                title={x.vendor}
                when={`${t(`exp.cat.${x.category}` as DictKey)} · ${day(x.at)}`}
                value={money(x.amountCents)}
              />
            ))}
          </CardGrid>
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
            {money(dueCents || (next ? visitDueCents(db, next) : 0))}
          </T>
        </RowView>
      </Card>
      {invoices.length ? (
        <CardGrid>
          {invoices.map((i) => (
            // the tech's view: what is still to collect on each invoice of his job (13 §3.4), no totals or profit
            <ListCard
              key={i.id}
              density="compact"
              testID={`job-invoice-${i.id}`}
              lead={{ kind: "icon", icon: "invoice" }}
              title={i.title || i.number || t("inv.title")}
              when={i.title ? i.number : undefined}
              value={money(Math.max(0, i.totalCents - i.paidCents))}
              onPress={() => router.push(`/invoice/${i.id}`)}
            />
          ))}
        </CardGrid>
      ) : null}
      {/* the technician reads the job's own lines (what to do), changes nothing (server: app.is_staff) */}
      <JobLinesBlock job={j} />
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
        <CardGrid>
          {items.map((e) => (
            // as the client's history (B1): the event, under it date · reason · detail, the sum only where jobHistory gave one (not to the tech)
            <ListCard
              key={e.id}
              density="compact"
              lead={{ kind: "icon", icon: e.icon }}
              title={t(e.title)}
              when={[day(e.at), e.reason ? t(e.reason) : undefined, e.detail].filter(Boolean).join(" · ")}
              value={e.cents !== undefined ? money(e.cents) : undefined}
              onPress={e.href ? () => router.push(e.href as never) : undefined}
            />
          ))}
        </CardGrid>
      ) : (
        <Empty icon="history" title={t("job3.h.empty")} />
      )}
      {/* the note goes into this history (one list, 17-job §7.1): only the field here, no second list */}
      <RowView>
        <View style={{ flex: 1 }}>
          <TextField type="note" autoFocus={focusNote} value={noteText} onChangeText={setNoteText} placeholder={t("notes.placeholder")} />
        </View>
        <Button label={t("notes.add")} icon="send" size="sm" variant="secondary" disabled={!noteText.trim()} onPress={addNote} />
      </RowView>
    </>
  );

  return (
    <Screen testID="job-screen" title={title} back={back} right={more} subtitle={[j.title, c?.name].filter(Boolean).join(" · ")} fab="job" fabCtx={servable ? { jobId: j.id, customerId: c?.id, propertyId: p?.id } : {}}>
      <RelatedBlock of={{ type: "job", id: j.id }} />
      {/* #1474: one next step for the whole card, above the tabs (DS §7.3, §12.3); the rest — in «⋯» */}
      {mainStep ? (
        <RowView style={{ alignSelf: wide ? "flex-start" : "stretch" }}>
          <View testID="job-main" style={{ flex: wide ? undefined : 1 }}>
            <Button label={t(mainStep.label)} icon={mainStep.icon} variant="primary" full={!wide} onPress={mainStep.onPress} />
          </View>
          {enRouteShown ? (
            <View testID="job-enroute">
              <Button label={t("job3.more.enRoute")} icon="navigate" variant="secondary" onPress={enRoute} />
            </View>
          ) : null}
        </RowView>
      ) : null}
      <Segmented
        full
        testID="job-tab"
        value={tab}
        onChange={(k) => {
          setFocusNote(false);
          setTab(k);
        }}
        items={[
          { key: "details", label: t("job3.tab.details") },
          { key: "money", label: t("job3.tab.money") },
          { key: "history", label: t("job3.tab.history") },
        ]}
      />
      {tab === "details" ? details : tab === "money" ? moneyTab : historyTab}
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={title}
        items={moreItems}
        onSelect={(k) => {
          setMoreAt(null);
          if (k === "enRoute") enRoute();
          else if (k === "pay" && payTo) router.push(payTo as never);
          else if (k === "note") {
            setFocusNote(true);
            setTab("history");
          }
          else if (k === "file" && next) router.push(`/visit/${next.id}`);
        }}
        onClose={() => setMoreAt(null)}
      />
    </Screen>
  );
}
