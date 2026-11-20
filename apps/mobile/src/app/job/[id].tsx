import { lateAfterOf } from "@/features/scheduleSettings";
import { visitDueCents } from "@/features/visitDue";
import { useRef, useState, type ComponentRef } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { jobProfit, useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import type { Estimate } from "@/data/types";
import { canSeeProfit } from "@/nav/roles";
import { JobOrdersBlock } from "@/features/JobOrdersBlock";
import { canEditOrders, ordersOfJob } from "@/features/purchaseOrders";
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
import { contractStatement, invoiceOwes, invoicesOwe } from "@octo/estimating-engine";
import { RelatedBlock } from "@/features/RelatedBlock";
import { JobLinesBlock, canEditJobLines } from "@/features/JobLinesBlock";
import { JobTypeTags } from "@/features/JobTypeTags";
import { jobChecklistVisit } from "@/features/checklist";
import { ChecklistEditor } from "@/features/VisitChecklist";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { PhotoStrip } from "@/features/PhotoStrip";
import { estView } from "@/features/boards";
import { smsWithBody } from "@/features/sms";
import { Menu, useToast } from "@/ui/overlays";
import { useDevice } from "@/theme/ThemeProvider";
import { visitStatus } from "@/features/visits";
import { Button, IconButton, StatusChip, TextField } from "@/ui/controls";
import { Press, T, type IconKey } from "@/ui/primitives";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { fabItems } from "@/nav/sections";
import { CardGrid, ListCard } from "@/ui/listCard";
import { FilterBar } from "@/ui/filterBar";
import { ViewTabs } from "@/ui/viewTabs";
import { memberLabel, memberName } from "@/features/team";
import { canSeeJob } from "@/features/access";
import { invoiceTitle } from "@/features/invoiceTitle";
import { signedText } from "@/i18n/translate";
import { jobCancelRefusal } from "@/features/jobCancel";
import { CancelJobSheet, CancelledJobBody } from "@/features/job/CancelJob";

/** the job's sections, in the line under the head (LAYOUT-RULES §3 «Объект», #2350) */
type Section = "overview" | "visits" | "estimates" | "invoices" | "expenses" | "orders" | "photos" | "notes";
const SECTION_LABEL: Record<Section, DictKey> = {
  overview: "client.tab.overview",
  visits: "jobs.visits",
  estimates: "client.estimates",
  invoices: "client.invoices",
  expenses: "jobs.expenses",
  orders: "job6.s.orders",
  photos: "cc.photos",
  notes: "client.row.notes",
};

/**
 * Job — the «Объект» template (docs/design/LAYOUT-RULES.md §3; the client's card is the sample): the head (the job's name, the
 * client as one link with call / text as icons, one line «status · contract», the address small — it opens the route), ONE main
 * button «the next step» with its reason under it (visit → close → bill the rest → take the payment; the tab bar is under the
 * card, so it stands right under the head, П3), then the sections in one line that scrolls sideways — «Обзор · Выезды · Сметы ·
 * Счета · Расходы · Заказы · Фото · Заметки» with their numbers — and the open section under it. Rare and dangerous — «⋯».
 */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day, time, duration } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Section>("overview");
  const [filter, setFilter] = useState<JobHistoryFilter>("all");
  const [noteText, setNoteText] = useState("");
  const [focusNote, setFocusNote] = useState(false);
  const [restSent, setRestSent] = useState(false);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
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
  // #2015: a cancelled job opens as a card with its reason (no steps, visits or money buttons)
  if (!db.jobs.some((x) => x.id === j.id))
    return (
      <Screen testID="job-screen" title={j.title} back={back}>
        <CancelledJobBody job={j} />
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
  const route = () => Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`).catch(() => {});
  const showMoney = canSeeProfit(store.role);
  const invoices = db.invoices.filter((i) => i.jobId === j.id);
  const dueCents = invoicesOwe(invoices);
  const openInvoice = invoices.find((i) => i.totalCents > i.paidCents);
  const estimates = db.estimates.filter((e) => e.id === j.estimateId);
  const orders = ordersOfJob(db, j.id).filter((o) => o.status !== "cancelled");
  const photos = visits.flatMap((v) => v.photos ?? []);
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
  const canSchedule = office && servable && j.status !== "done";
  const schedule = () => router.push(`/job/schedule?jobId=${j.id}`);

  // where «Оплата» leads: the open invoice, else the visit that takes money on site
  const payTo = openInvoice ? `/invoice/${openInvoice.id}` : next && visitDueCents(db, next) > 0 ? `/visit/${next.id}` : null;
  const restShown = office && j.status === "done" && rest > 0 && !restSent;
  /**
   * The ONE next step (LAYOUT-RULES П2, 06-decision п.3) along the job's chain, by the rights and actions the card had:
   * the office closes a job whose visits are over → bills the rest → the open visit is started → the money is taken → a job
   * with no visit gets one. Its reason stands under it.
   */
  type Step = { key: "close" | "rest" | "start" | "pay" | "schedule"; label: string; icon: IconKey; why?: string; onPress: () => void };
  const step: Step | null =
    office && awaiting
      ? { key: "close", label: t("job3.done.yes"), icon: "check", why: `${t("job3.done.ask")} ${t("job3.done.askHint")}`, onPress: complete }
      : restShown
        ? { key: "rest", label: t("job3.done.invoiceRest", { amount: money(rest) }), icon: "invoice", why: t("job6.why.rest"), onPress: invoiceRest }
        : next
          ? { key: "start", label: t("job3.main.start"), icon: "check", why: t("job3.next", { date: day(next.start), time: visitWhen(next, time, t("plan5.allDay"), false) }), onPress: () => router.push(`/visit/${next.id}`) }
          : payTo
            ? { key: "pay", label: t("job3.main.pay"), icon: "dollar", why: dueCents > 0 ? t("job6.why.pay", { amount: money(dueCents) }) : undefined, onPress: () => router.push(payTo as never) }
            : canSchedule && !visits.length
              ? { key: "schedule", label: t("sch.title"), icon: "calendar", why: t("job3.noVisit"), onPress: schedule }
              : null;
  // the technician on his way: «В пути» stays in sight beside the main step as an icon (Jobber/HCP «On my way»); the office has it in «⋯»
  const enRouteShown = !!next && step?.key === "start" && !office;
  const cancelBlocked = jobCancelRefusal(db, j.id, "x", store.role);
  // «＋ Создать смету» of a job with no estimate — in its empty «Сметы» (the only button on the page, 422)
  const newEstimate =
    office && servable && c && !j.estimateId && fabItems("job", store.role, { customerId: c.id }).some((i) => i.id === "estimate")
      ? () => router.push(`/estimate/new?customerId=${c.id}${p ? `&propertyId=${p.id}` : ""}`)
      : undefined;
  const moreItems = [
    ...(next && !enRouteShown ? [{ key: "enRoute", label: t("job3.more.enRoute"), icon: "navigate" as const, testID: "job-act-enRoute" }] : []),
    ...(payTo && step?.key !== "pay" ? [{ key: "pay", label: t("job3.more.pay"), icon: "dollar" as const, testID: "job-act-pay" }] : []),
    // «Нужен ещё выезд» of the «выполнена?» step, and «Завершить работу» before all the visits are over (S10)
    ...(office && awaiting && servable ? [{ key: "more", label: t("job3.done.more"), icon: "calendar" as const, testID: "job-act-more" }] : []),
    ...(office && j.status !== "done" && j.status !== "unscheduled" && !awaiting ? [{ key: "complete", label: t("job3.done.complete"), icon: "check" as const, testID: "job-act-complete" }] : []),
    // the estimate for this job's client and address (#1395); a job with none has it named in «Сметы» too
    ...(servable && c && fabItems("job", store.role, { customerId: c.id }).some((i) => i.id === "estimate") ? [{ key: "estimate", label: t("path.estimateNew"), icon: "invoice" as const, testID: "job-act-estimate" }] : []),
    { key: "note", label: t("job3.more.note"), icon: "note" as const, testID: "job-act-note" },
    ...(next ? [{ key: "file", label: t("job3.more.file"), icon: "camera" as const, testID: "job-act-file" }] : []),
    // #2015: for the director and the dispatcher, last and red; a refusal is told, not hidden (П7: no dead ends)
    ...(j.status !== "done" && (store.role === "director" || store.role === "dispatcher")
      ? [{ key: "cancel", label: t("job.cancel.menu"), icon: "close" as const, destructive: true, dim: !!cancelBlocked, testID: "job-act-cancel" }]
      : []),
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

  /* ---------- the head: name, the client as one link + call / text icons, «status · contract», the address ---------- */
  const head = (
    <View testID="job-head" style={{ gap: space[2] }}>
      <T v="heading">{j.title}</T>
      {c || tel ? (
        <View testID="job-contact" style={{ maxWidth: wide ? component.panelW : undefined }}>
          <RowView style={{ justifyContent: "space-between" }}>
          {c ? (
            // a ghost button's own side padding is pulled out: the name stands on the head's left edge
            <View style={{ flexShrink: 1, marginLeft: -space[4] }}>
              <Button testID="job-client" label={`${c.name} ›`} icon="user" size="sm" variant="ghost" accessibilityLabel={`${t("job3.rel.customer")}: ${c.name}`} onPress={() => router.push(`/client/${c.id}`)} />
            </View>
          ) : (
            <View />
          )}
          {tel ? (
            <RowView gap={space[1]}>
              <View testID="job-call">
                <IconButton icon="phone" label={`${t("client.call")}: ${c?.name ?? tel}`} onPress={call} />
              </View>
              <View testID="job-write">
                <IconButton icon="sms" label={`${t("visit.message")}: ${c?.name ?? tel}`} onPress={sms} />
              </View>
            </RowView>
          ) : null}
          </RowView>
        </View>
      ) : null}
      <View testID="job-headline">
        <RowView style={{ flexWrap: "nowrap" }}>
        <StatusChip status={st.status} label={t(st.label)} />
        {showMoney && j.amountCents > 0 ? (
          <>
            <T v="body" tone="mut">
              ·
            </T>
            <View testID="job-contract">
              <T v="heading" tabular numberOfLines={1}>
                {money(j.amountCents)}
              </T>
            </View>
          </>
        ) : null}
        </RowView>
      </View>
      {addr ? (
        // the address, small — a tap opens the route (LAYOUT-RULES §3: «адрес мелко — нажимается»)
        <Press testID="job-route" onPress={route} accessibilityRole="link" accessibilityLabel={`${t("jobs.route")}: ${addr}`} style={{ alignSelf: "flex-start" }}>
          <T v="caption" tone="mut" numberOfLines={2}>
            {addr}
          </T>
        </Press>
      ) : null}
    </View>
  );

  /* ---------- the one main button, its reason under it ---------- */
  const stepBlock = step ? (
    <View style={{ gap: space[1], alignSelf: wide ? "flex-start" : "stretch", maxWidth: wide ? component.panelW : undefined, width: wide ? "100%" : undefined }}>
      <RowView>
        <View testID="job-main" style={{ flex: 1 }}>
          <Button testID={`job-next-${step.key}`} label={step.label} icon={step.icon} variant="primary" full onPress={step.onPress} />
        </View>
        {enRouteShown ? (
          <View testID="job-enroute">
            <IconButton icon="navigate" label={t("job3.more.enRoute")} onPress={enRoute} />
          </View>
        ) : null}
      </RowView>
      {step.why ? (
        <View testID="job-next-why">
          <T v="caption" tone="mut" center={!wide} numberOfLines={2}>
            {step.why}
          </T>
        </View>
      ) : null}
    </View>
  ) : null;

  /* ---------- sections ---------- */
  const overview = (
    <>
      {/* «Связано»: what the head does not name already (the lead); the client and the address are in the head (П7) */}
      <RelatedBlock of={{ type: "job", id: j.id }} hide={["customer", "property", "estimate", "invoice"]} />
      {j.description ? <T v="body">{j.description}</T> : null}
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
      {/* what to do: the job's own lines (the technician reads them, changes nothing — server: app.is_staff) */}
      <JobLinesBlock job={j} />
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

  const visitsSection = (
    <>
      <SectionTitle
        title={t("job3.schedule")}
        right={
          canSchedule && (visits.length || step?.key !== "schedule") ? (
            <View testID="job-schedule">
              <IconButton icon="plus" label={visits.length ? t("sch.another") : t("sch.title")} onPress={schedule} />
            </View>
          ) : undefined
        }
      />
      {visits.length ? (
        <CardGrid>
          {visits.map((v) => {
            const vs = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              // the job's own visits (06 «Серия B», B4): when — the title, who · how long under it, the visit's status chip
              <ListCard
                key={v.id}
                density="compact"
                testID={`job-visit-${v.id}`}
                lead={{ kind: "icon", icon: "calendar" }}
                title={`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"), false)}`}
                when={[memberLabel(tech, t) ?? t("sch.noTech"), v.allDay ? undefined : duration(v.durationMin)].filter(Boolean).join(" · ")}
                status={{ tone: vs.status, label: t(vs.label) }}
                onPress={() => router.push(`/visit/${v.id}`)}
              />
            );
          })}
        </CardGrid>
      ) : (
        <Empty icon="calendar" title={t("job3.noVisit")} />
      )}
      {/* #606: the office edits the checklist of the job's first visit not started yet — the same editor as on the visit */}
      {chkVisit ? <ChecklistEditor key={chkVisit.id} v={chkVisit} title={t("chk4.jobVisit", { date: `${day(chkVisit.start)} · ${visitWhen(chkVisit, time, t("plan5.allDay"), false)}` })} /> : null}
    </>
  );

  const estimateCard = (e: Estimate) => {
    const v = estView[e.status];
    return (
      <ListCard
        key={e.id}
        density="compact"
        testID={`job-estimate-${e.id}`}
        lead={{ kind: "icon", icon: "invoice" }}
        title={e.title || e.number || t("cc.kind.estimate")}
        when={e.title ? e.number : undefined}
        value={money(e.totalCents)}
        status={{ tone: v.s, label: t(v.l) }}
        onPress={() => router.push(`/estimate/${e.id}`)}
      />
    );
  };
  const estimatesSection = estimates.length ? (
    <CardGrid>{estimates.map(estimateCard)}</CardGrid>
  ) : (
    <View testID="job-money-no-estimate">
      <Empty
        icon="invoice"
        title={t("visitP2.att.noEstimateChip")}
        action={newEstimate ? <Button testID="job-rel-new-estimate" label={t("path.estimateNew")} icon="plus" size="sm" variant="secondary" onPress={newEstimate} /> : undefined}
      />
    </View>
  );

  const invoicesSection = showMoney ? (
    j.amountCents > 0 ? (
      // the contract sum is in the head (П7): the statement starts at «Выставлено»
      <ContractStatement jobId={j.id} hideContract quiet />
    ) : (
      <Empty icon="invoice" title={t("job6.noInvoices")} />
    )
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
              title={(i.title && invoiceTitle(i, t)) || i.number || t("inv.title")}
              when={i.title ? i.number : undefined}
              value={money(invoiceOwes(i))}
              onPress={() => router.push(`/invoice/${i.id}`)}
            />
          ))}
        </CardGrid>
      ) : null}
    </>
  );

  const expensesSection = (
    <>
      {/* the result first: spent and the profit (one card), then the receipts */}
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
          <View testID="job-profit">
            <T v="title" tabular tone={pr.profit < 0 ? "bad" : "ink"}>
              {money(pr.profit)}
              {pr.marginPct !== null ? ` · ${signedText(pr.marginPct)}%` : ""}
            </T>
          </View>
        </RowView>
      </Card>
      <SectionTitle
        title={t("jobs.costs")}
        right={
          <View testID="job-add-expense">
            <IconButton icon="plus" label={t("quick.receipt")} onPress={() => router.push("/expense/new")} />
          </View>
        }
      />
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
    </>
  );

  const photosSection = photos.length ? (
    // the photos of the job's visits, shown only (they are taken on the visit: «⋯ → Добавить фото на выезде»)
    <PhotoStrip photos={photos} />
  ) : (
    <Empty icon="camera" title={t("job6.noPhotos")} />
  );

  const items = filterJobHistory(jobHistory(db, j.id, store.role), filter);
  const notesSection = (
    <>
      {/* the note composer on top, the job's history under it (one list, 17-job §7.1); the lane filters it (spec 56 §3.1) */}
      <TextField
        type="note"
        autoFocus={focusNote}
        value={noteText}
        onChangeText={setNoteText}
        placeholder={t("notes.placeholder")}
        action={{ icon: "send", label: t("notes.add"), onPress: addNote }}
      />
      <View testID="job-history-filter">
        <FilterBar<JobHistoryFilter>
          value={filter}
          onChange={setFilter}
          items={[
            { key: "all", label: t("job3.f.all") },
            { key: "action", label: t("job3.f.action") },
            { key: "note", label: t("job3.f.note") },
            { key: "call", label: t("job3.f.call") },
          ]}
        />
      </View>
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
    </>
  );

  /* ---------- the sections' line: what is seen by the role, with its number ---------- */
  const shown: Record<Section, boolean> = {
    overview: true,
    visits: true,
    estimates: showMoney,
    invoices: true,
    expenses: showMoney,
    orders: (canEditOrders(store.role) && !db.purchaseOrdersLegacy) || orders.length > 0,
    photos: true,
    notes: true,
  };
  const counts: Partial<Record<Section, number>> = {
    visits: visits.length,
    estimates: estimates.length,
    invoices: invoices.filter((i) => i.status !== "void").length,
    expenses: expenses.length,
    orders: orders.length,
    photos: photos.length,
    notes: filterJobHistory(jobHistory(db, j.id, store.role), "note").length,
  };
  const keys = (Object.keys(SECTION_LABEL) as Section[]).filter((k) => shown[k]);
  const current: Section = shown[tab] ? tab : "overview";
  const open = (k: Section) => {
    setFocusNote(false);
    setTab(k);
  };
  const body =
    current === "overview"
      ? overview
      : current === "visits"
        ? visitsSection
        : current === "estimates"
          ? estimatesSection
          : current === "invoices"
            ? invoicesSection
            : current === "expenses"
              ? expensesSection
              : current === "orders"
                ? <JobOrdersBlock job={j} />
                : current === "photos"
                  ? photosSection
                  : notesSection;

  return (
    <Screen testID="job-screen" title={title} back={back} right={more}>
      <View style={{ gap: space[3] }}>
        {head}
        {stepBlock}
        {/* the sections in one line that scrolls sideways (DS §9 А1п), not tabs of three and a sheet of blocks (#2350) */}
        <ViewTabs<Section>
          testID="job-tab"
          label={t("job6.tabs")}
          value={current}
          onChange={open}
          items={keys.map((k) => ({ key: k, label: t(SECTION_LABEL[k]), count: counts[k] || undefined }))}
        />
        <View testID={`job-section-${current}`} style={{ gap: space[3] }}>
          {body}
        </View>
      </View>
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
      <CancelJobSheet jobId={j.id} visible={cancelOpen} onClose={() => setCancelOpen(false)} />
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={title}
        items={moreItems}
        onSelect={(k) => {
          setMoreAt(null);
          if (k === "enRoute") enRoute();
          else if (k === "pay" && payTo) router.push(payTo as never);
          else if (k === "more") schedule();
          else if (k === "complete") complete();
          else if (k === "estimate" && c) router.push(`/estimate/new?customerId=${c.id}${p ? `&propertyId=${p.id}` : ""}`);
          else if (k === "note") {
            setFocusNote(true);
            setTab("notes");
          } else if (k === "file" && next) router.push(`/visit/${next.id}`);
          else if (k === "cancel") {
            if (cancelBlocked) toast.show(t(`job.cancel.why.${cancelBlocked}` as DictKey));
            else setCancelOpen(true);
          }
        }}
        onClose={() => setMoreAt(null)}
      />
    </Screen>
  );
}
