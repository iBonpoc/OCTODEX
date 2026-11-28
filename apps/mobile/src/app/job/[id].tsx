import { lateAfterOf } from "@/features/scheduleSettings";
import { visitDueCents } from "@/features/visitDue";
import { useCallback, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
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
import { canPlan, isAssigned, visitWhen } from "@/features/schedule";
import { completeBlock, jobAwaitingClose } from "@/features/jobDone";
import { invoiceOwes, invoicesOwe } from "@octo/estimating-engine";
import { contractToInvoiceCents, restInvoiceKind } from "@/features/contractKind";
import { RelatedBlock } from "@/features/RelatedBlock";
import { JobLinesBlock, canEditJobLines } from "@/features/JobLinesBlock";
import { JobTypeTags } from "@/features/JobTypeTags";
import { jobChecklistVisit } from "@/features/checklist";
import { ChecklistEditor } from "@/features/VisitChecklist";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { PhotoStrip } from "@/features/PhotoStrip";
import { estView } from "@/features/boards";
import { smsWithBody } from "@/features/sms";
import { useToast } from "@/ui/overlays";
import { visitStatus } from "@/features/visits";
import { Button, IconButton, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Screen, SectionTitle } from "@/ui/surfaces";
import { fabItems } from "@/nav/sections";
import { FilterBar } from "@/ui/filterBar";
import { Banner } from "@/ui/banner";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { mapsUrl, type OS } from "@/ui/listCardLayout";
import { ObjectScreen, type MainAction, type MoreAction } from "@/ui/templates";
import type { IconRowItem } from "@/ui/iconRow";
import { memberLabel, memberName } from "@/features/team";
import { canSeeJob } from "@/features/access";
import { invoiceTitle } from "@/features/invoiceTitle";
import { signedText } from "@/i18n/translate";
import { jobCancelRefusal } from "@/features/jobCancel";
import { CancelJobSheet, CancelledJobBody } from "@/features/job/CancelJob";
import { jobFigures } from "@/features/client/nextStep";
import { jobHeadParts } from "@/features/job/headName";
import { NowCard } from "@/ui/nowCard";
import { lookItems, useClientLook } from "@/features/client/clientLook";
import { JobLine } from "@/features/job/JobLineView";

/** the job's sections, in the strip under the header (BUILD-SPEC §2.5) */
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
 * Работа — the «Объект» template (BUILD-SPEC §2.5, object-cards.html «Работа», wireframes-v2 №6).
 * Screen's job: what is with the job and its next step — the same object system as the client (visual v2 «Объект», #2350):
 * the one header «Bathroom remodel | ◷ Запланирована» («Клиент ›» only when «‹» does not already name him) → QuickActions row
 * «Позвонить · SMS · Маршрут · Фото» → the «Сейчас» card: the next visit and who, the address small (→ «Маршрут»), the three
 * figures «Смета · Оплачено · Остаток» (the office) and the ONE main step inside by the state table (§2.5; the technician on his
 * own visit gets «В пути» beside it) → the sections strip → the open section. Nothing twice: the sum lives in the figures only, the
 * address in the card only. Rare and dangerous — «⋯», what is made from the job — «＋».
 */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, moneyWhole, day, time, duration } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Section>("overview");
  const [filter, setFilter] = useState<JobHistoryFilter>("all");
  const [noteText, setNoteText] = useState("");
  const [focusNote, setFocusNote] = useState(false);
  const [restSent, setRestSent] = useState(false);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  // #3124 В1: the same look as the client card («⋯ → Вид»), one value on the device
  const [look, setLook] = useClientLook();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/jobs"));
  const open = useCallback((k: Section) => {
    setFocusNote(false);
    setTab(k);
  }, []);
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
  // #2015: a cancelled job — StatusPill «Отменена», the reason and its links; no steps (§2.5 last row)
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
  const showMoney = canSeeProfit(store.role);
  const office = canPlan([store.role]);
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
  const jobNo = j.number ? t("job3.title", { no: j.number }) : t("job3.newJob");
  const addr = [p?.address, p?.city].filter(Boolean).join(", ");
  const gate = p ? canSeeGateCode(db, store.role, p.id) : false;

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
  // «Маршрут»: the platform's own maps (#2353) through the one shared rule
  const route = () => Linking.openURL(mapsUrl(addr, Platform.OS as OS)).catch(() => {});
  // «В пути»: until our own number (#2352) the phone's SMS opens with a ready text in the CLIENT's language (rule 7) — nothing is promised as sent
  const enRoute = () => {
    if (!tel) return toast.show(t("job3.noPhone"));
    Linking.openURL(smsWithBody(tel, enRouteSms(db, c?.id, time(next?.start ?? new Date().toISOString())))).catch(() => {});
  };
  const addNote = () => {
    const body = noteText.trim();
    if (!body) return;
    toast.show(store.online ? t("notes.added") : t("offline.queued"), store.addNote({ subjectType: "job", subjectId: j.id, body, visibility: "team" }));
    setNoteText("");
  };

  // S10: «Да, выполнена» / «Завершить работу» — the office, no open visit (the server checks the same in complete_job)
  const awaiting = jobAwaitingClose(db, j);
  // #2061: the contract's own invoices only (a standalone one is extra work) — as the server's limit
  const rest = contractToInvoiceCents(db, j);
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
    // review of #2061: one final per job (the server refuses a second) — with a final already, the rest is a progress invoice
    const undo = store.issueInvoice(j.id, restInvoiceKind(db, j.id), rest, t("job3.done.restTitle"));
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
  const payCents = dueCents || (next ? visitDueCents(db, next) : 0);
  const restShown = office && j.status === "done" && rest > 0 && !restSent;
  const mine = !!next && isAssigned(next, db.me);
  const nextWhen = next ? `${day(next.start)} ${visitWhen(next, time, t("plan5.allDay"), false)}` : "";
  const nextWho = next ? (memberLabel(db.members.find((m) => m.id === next.techId), t) ?? t("sch.noTech")) : "";

  /**
   * The ONE main step by the state table of §2.5: the office closes a job whose visits are over («Нужен ещё выезд» beside it) →
   * bills the rest → the open visit: mine — «Начать выезд» with «В пути» beside it, another's — «Открыть выезд» → the money →
   * a job with no visit gets one → paid and not closed — «Завершить работу».
   */
  type Step = { main: MainAction; second?: MainAction };
  const openVisit = (vid: string) => router.push(`/visit/${vid}`);
  const step: Step | null =
    office && awaiting
      ? {
          main: { label: t("job3.done.yes"), onPress: complete, reason: t("job3.done.ask"), testID: "job-next-close" },
          second: servable ? { label: t("job3.done.more"), onPress: schedule, testID: "job-next-more" } : undefined,
        }
      : restShown
        ? { main: { label: t("w2b.job.rest"), onPress: invoiceRest, reason: t("job6.why.rest"), testID: "job-next-rest" } }
        : next && mine
          ? {
              // #2995 (crm + design review 27.11): ONE button — «Начать выезд»; «Сообщить «В пути»» is in «⋯» (never two of a size)
              main: { label: t("job3.main.start"), onPress: () => openVisit(next.id), reason: t("proto.job.nextVisit", { when: nextWhen, who: nextWho }), testID: "job-next-start" },
            }
          : next
            ? { main: { label: t("proto.job.openVisit"), onPress: () => openVisit(next.id), reason: t("proto.job.nextVisit", { when: nextWhen, who: nextWho }), testID: "job-next-open" } }
            : payTo
              ? { main: { label: t("job3.main.pay"), onPress: () => router.push(payTo as never), reason: payCents > 0 ? `${t("job3.dueNow")} ${money(payCents)}` : undefined, testID: "job-next-pay" } }
              : canSchedule && !visits.length
                ? { main: { label: t("proto.job.schedule"), onPress: schedule, reason: t("job3.noVisit"), testID: "job-next-schedule" } }
                : office && j.status !== "done" && j.status !== "unscheduled"
                  ? { main: { label: t("proto.job.complete"), onPress: complete, reason: t("proto.job.completeWhy"), testID: "job-next-complete" } }
                  : null;
  const cancelBlocked = jobCancelRefusal(db, j.id, "x", store.role);
  const estimateHref = c ? `/estimate/new?customerId=${c.id}${p ? `&propertyId=${p.id}` : ""}` : null;
  const makes = c && servable ? fabItems("job", store.role, { jobId: j.id, customerId: c.id, propertyId: p?.id }) : [];
  // «Создать» (Jobber Create): what is made from the job, the job already filled in
  const create = makes.length ? { a11y: `${t("proto.job.create")}: ${j.title}`, items: makes.map((m) => ({ key: m.id, label: t(m.label), icon: m.icon, testID: `job-create-${m.id}` })) } : undefined;
  const onCreate = (k: string) => {
    const m = makes.find((x) => x.id === k);
    if (m?.href) router.push(m.href as never);
  };
  // «⋯»: rare and dangerous; the number of the job first (wireframe №6 «номер JOB — в ⋯»), «Отменить работу…» red and last
  const more: MoreAction = [
    { key: "number", label: t("proto.job.number", { no: jobNo }), icon: "copy", testID: "job-act-number" },
    ...(next && (office || mine) ? [{ key: "enRoute", label: t("job3.more.enRoute"), icon: "navigate" as const, testID: "job-act-enRoute" }] : []),
    ...(payTo && step?.main.testID !== "job-next-pay" ? [{ key: "pay", label: t("job3.more.pay"), icon: "dollar" as const, testID: "job-act-pay" }] : []),
    ...(office && j.status !== "done" && j.status !== "unscheduled" && !awaiting && step?.main.testID !== "job-next-complete" ? [{ key: "complete", label: t("job3.done.complete"), icon: "check" as const, testID: "job-act-complete" }] : []),
    ...(next ? [{ key: "file", label: t("job3.more.file"), icon: "camera" as const, testID: "job-act-file" }] : []),
    // #2015: for the director and the dispatcher, last and red; a refusal is told, not hidden (П7: no dead ends)
    ...(j.status !== "done" && (store.role === "director" || store.role === "dispatcher")
      ? [{ key: "cancel", label: t("job.cancel.menu"), icon: "close" as const, destructive: true, dim: !!cancelBlocked, testID: "job-act-cancel" }]
      : []),
    ...lookItems(look, t, "job"),
  ];
  const onMore = (k: string) => {
    if (k === "look.plain" || k === "look.line") return setLook(k === "look.line" ? "line" : "plain");
    if (k === "number") toast.show(jobNo);
    else if (k === "enRoute") enRoute();
    else if (k === "pay" && payTo) router.push(payTo as never);
    else if (k === "complete") complete();
    else if (k === "file" && next) openVisit(next.id);
    else if (k === "cancel") {
      if (cancelBlocked) toast.show(t(`job.cancel.why.${cancelBlocked}` as DictKey));
      else setCancelOpen(true);
    }
  };

  /* ---------- QuickActions row: Позвонить · SMS · Маршрут · Фото ---------- */
  const who = c?.name ?? tel;
  const actions: IconRowItem[] = [
    ...(tel ? [{ icon: "phone" as const, label: t("proto.job.call"), a11y: `${t("proto.job.call")} ${who}`, onPress: call, testID: "job-call" }] : []),
    ...(tel || main ? [{ icon: "sms" as const, label: t("proto.job.sms"), a11y: `${t("proto.job.sms")} ${who}`, onPress: sms, testID: "job-write" }] : []),
    ...(addr ? [{ icon: "route" as const, label: t("proto.job.route"), a11y: `${t("proto.job.route")}: ${addr}`, onPress: route, testID: "job-route" }] : []),
    { icon: "camera" as const, label: t("proto.job.photo"), a11y: `${t("proto.job.photo")}: ${j.title}`, onPress: () => open("photos"), testID: "job-photo" },
  ];

  const { name: headName, rest: headRest } = jobHeadParts(j.title);

  /* ---------- «Сейчас»: the next visit, the address small, the figures, the one step inside (v2 «Объект») ---------- */
  const figs = showMoney ? jobFigures(j, invoices) : null;
  const e0 = estimates[0];
  const nowCard = (
    <NowCard
      testID="job-now"
      kicker={next ? t("w2b.job.next") : t("proto.client.now")}
      status={{ status: st.status, label: t(st.label) }}
      title={
        next
          ? `${nextWhen} · ${nextWho}`
          : step?.main.testID === "job-next-pay" && openInvoice
            ? t("w2b.client.payWhy", { n: openInvoice.number || invoiceTitle(openInvoice, t) })
            : (step?.main.reason ?? (addr || t("proto.client.nowNothing")))
      }
      sub={next || step?.main.reason ? addr || undefined : undefined}
      onPress={next ? () => openVisit(next.id) : undefined}
      trio={
        figs
          ? [
              { value: money(figs.contract), label: t(e0 ? "proto.client.stEstimate" : "w2b.job.contract") },
              { value: money(figs.paid), label: t("cl6.money.paid") },
              { value: money(figs.remaining), label: t("w2b.client.left") },
            ]
          : undefined
      }
      // the card's title already says when and who (or why): the step goes without its reason
      main={step ? { ...step.main, reason: undefined } : undefined}
      second={step?.second}
    />
  );

  /* ---------- sections ---------- */
  // AccessNote (BUILD-SPEC §1): the first line of the overview; the tech sees the code on the visit day and the day before
  const accessText = p?.accessNotes?.trim();
  const codeLine = p?.gateCode ? (gate ? `${t("prop.gate")}: ${p.gateCode}` : t("proto.job.gateLater")) : undefined;
  const access =
    accessText || codeLine ? (
      <Banner tone="warn" testID="job-access" title={`${t("job3.access")}: ${codeLine && gate ? codeLine : accessText ?? codeLine}`} hint={codeLine && gate ? accessText : accessText ? codeLine : undefined} />
    ) : null;
  const overview = (
    <>
      {access}
      {!servable ? <Banner tone="warn" testID="job-no-service" title={t("client.st.doNotService")} hint={`${t("job5.noService")} ${t("job5.noServiceHint")}`} /> : null}
      {/* «Позиции · N» — the job's own lines (the technician reads them, changes nothing — server: app.is_staff) */}
      <JobLinesBlock job={j} />
      {/* связанное: what the header does not name already (смета, задаток, расход, заказ) */}
      <RelatedBlock of={{ type: "job", id: j.id }} hide={["customer", "property", "estimate", "invoice"]} />
      <ListGroup testID="job-facts" inset={space[4]}>
        <GroupRow compact testID="job-team" title={t("job3.team")} subtitle={team || t("job3.noTeam")} />
        {showMoney && j.amountCents > 0 ? (
          <GroupRow
            compact
            testID="job-profit"
            title={t("proto.job.profitNow")}
            value={`${money(pr.profit)}${pr.marginPct !== null ? ` · ${signedText(pr.marginPct)}%` : ""}`}
            onPress={() => open("expenses")}
          />
        ) : null}
      </ListGroup>
      {j.description ? (
        <View style={{ gap: space[1] }}>
          <SectionTitle title={t("job3.desc")} />
          <T v="body">{j.description}</T>
        </View>
      ) : null}
      {/* «Тип работы · Метки · Направление» — one card, not two loose rows and a third in a card (audit 2.4) */}
      <View testID="job-kind">
        <Card>
          <JobTypeTags job={j} canEdit={canEditJobLines(store.role)} />
          <ServiceCategoryRow bare value={j.serviceCategoryId} onChange={(cid) => toast.show(t("dir.changed"), store.setJobCategory(j.id, cid))} />
        </Card>
      </View>
    </>
  );

  const visitsSection = (
    <>
      <SectionTitle
        title={t("job3.schedule")}
        right={
          canSchedule && visits.length ? (
            <View testID="job-schedule">
              <IconButton icon="plus" label={t("sch.another")} onPress={schedule} />
            </View>
          ) : undefined
        }
      />
      {visits.length ? (
        // #3022 (founder 26.11: «заходишь в работы, там тоже списки… разделить»): each record its own frame, the lists' rows (#3017)
        <ListGroup separate testID="job-visits">
          {visits.map((v) => {
            const vs = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              <GroupRow
                key={v.id}
                testID={`job-visit-${v.id}`}
                lead={{ icon: "calendar" }}
                title={`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"), false)}`}
                subtitle={[memberLabel(tech, t) ?? t("sch.noTech"), v.allDay ? undefined : duration(v.durationMin)].filter(Boolean).join(" · ")}
                status={{ status: vs.status, label: t(vs.label) }}
                onPress={() => openVisit(v.id)}
              />
            );
          })}
        </ListGroup>
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
      <GroupRow
        key={e.id}
        testID={`job-estimate-${e.id}`}
        lead={{ icon: "invoice" }}
        title={e.title || e.number || t("cc.kind.estimate")}
        titleNote={e.title ? e.number : undefined}
        figureRight
        value={moneyWhole(e.totalCents)}
        status={{ status: v.s, label: t(v.l), draft: v.d }}
        onPress={() => router.push(`/estimate/${e.id}`)}
      />
    );
  };
  const newEstimate = office && estimateHref && !j.estimateId && makes.some((m) => m.id === "estimate") ? () => router.push(estimateHref as never) : undefined;
  const estimatesSection = estimates.length ? (
    <ListGroup separate testID="job-estimates">{estimates.map(estimateCard)}</ListGroup>
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
      // the contract sum is in the header (П7): the statement starts at «Выставлено»
      <ContractStatement jobId={j.id} hideContract quiet />
    ) : (
      <Empty icon="invoice" title={t("job6.noInvoices")} />
    )
  ) : (
    // the technician: only «К оплате» and the invoices of his job (13 §3.4 «Деньги», 15-flows §4 в. 3)
    <ListGroup testID="job-due" inset={space[4]}>
      <GroupRow title={t("job3.dueNow")} value={money(payCents)} />
      {invoices.map((i) => (
        <GroupRow
          key={i.id}
          compact
          testID={`job-invoice-${i.id}`}
          title={(i.title && invoiceTitle(i, t)) || i.number || t("inv.title")}
          subtitle={i.title ? i.number : undefined}
          value={money(invoiceOwes(i))}
          onPress={() => router.push(`/invoice/${i.id}`)}
        />
      ))}
    </ListGroup>
  );

  const expensesSection = (
    <>
      {/* the result first: spent and the profit, then the receipts */}
      <ListGroup testID="job-expense-sum" inset={space[4]}>
        <GroupRow compact title={t("jobs.expenses")} value={money(pr.expenses)} />
        <GroupRow compact title={t("jobs.profit")} value={`${money(pr.profit)}${pr.marginPct !== null ? ` · ${signedText(pr.marginPct)}%` : ""}`} />
      </ListGroup>
      <SectionTitle
        title={t("jobs.costs")}
        right={
          <View testID="job-add-expense">
            <IconButton icon="plus" label={t("quick.receipt")} onPress={() => router.push("/expense/new")} />
          </View>
        }
      />
      {expenses.length ? (
        <ListGroup separate testID="job-expenses">
          {expenses.map((x) => (
            <GroupRow
              key={x.id}
              testID={`job-expense-${x.id}`}
              lead={{ icon: "wallet" }}
              title={x.vendor}
              subtitle={`${t(`exp.cat.${x.category}` as DictKey)} · ${day(x.at)}`}
              value={money(x.amountCents)}
            />
          ))}
        </ListGroup>
      ) : null}
    </>
  );

  const photosSection = photos.length ? (
    // the photos of the job's visits, shown only (they are taken on the visit)
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
        <ListGroup separate testID="job-history">
          {items.map((e) => (
            <GroupRow
              key={e.id}
              lead={{ icon: e.icon }}
              title={t(e.title)}
              subtitle={[day(e.at), e.reason ? t(e.reason) : undefined, e.detail].filter(Boolean).join(" · ")}
              value={e.cents !== undefined ? money(e.cents) : undefined}
              onPress={e.href ? () => router.push(e.href as never) : undefined}
            />
          ))}
        </ListGroup>
      ) : (
        <Empty icon="history" title={t("job3.h.empty")} />
      )}
    </>
  );

  /* ---------- the strip: what the role sees, with the numbers that matter ---------- */
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
    invoices: invoices.filter((i) => i.status !== "void").length,
    expenses: expenses.length,
    orders: orders.length,
    photos: photos.length,
    notes: filterJobHistory(jobHistory(db, j.id, store.role), "note").length,
  };
  // empty sections at the end (BUILD-SPEC §1 SectionStrip)
  const keys = (Object.keys(SECTION_LABEL) as Section[]).filter((k) => shown[k]);
  const ordered = [...keys.filter((k) => k === "overview" || counts[k] !== 0), ...keys.filter((k) => k !== "overview" && counts[k] === 0)];
  const current: Section = shown[tab] ? tab : "overview";
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
    <>
      <ObjectScreen<Section>
        testID="job-screen"
        back={back}
        header={{
          testID: "job-head",
          // v2 «Bathroom remodel | vanity, toilet, tile»: the name before «:» is the big title, the rest the line right of the rule;
          // the status stands in the «Сейчас» card (a long word is never cut at the screen's edge, #2350)
          title: headName,
          // the sum is the «Сейчас» card's figures, the address its small line (nothing twice, #2350)
          link: c ? { label: c.name, onPress: () => router.push(`/client/${c.id}`) } : undefined,
          labels: { expand: t("proto.job.expand"), collapse: t("proto.job.collapse"), more: (n) => t("proto.job.moreN", { n }) },
        }}
        actions={actions}
        // #2995 (layout review 27.11): the title's tail «vanity, toilet, tile» was cut right of the rule on 390 — a whole line under the name
        subtitle={headRest || undefined}
        now={look === "line" ? undefined : nowCard}
        sections={look === "line" ? [] : ordered.map((k) => ({ key: k, label: t(SECTION_LABEL[k]), count: counts[k] || undefined }))}
        section={current}
        onSection={open}
        sectionsLabel={t("proto.job.sections")}
        more={more}
        onMore={onMore}
        create={create}
        onCreate={onCreate}
      >
        {look === "line" ? (
          <JobLine jobId={j.id} showMoney={showMoney} main={step?.main} add={create?.items ?? []} onAdd={onCreate} />
        ) : (
          <View testID={`job-section-${current}`} style={{ gap: space[3] }}>
            {body}
          </View>
        )}
      </ObjectScreen>
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
      <CancelJobSheet jobId={j.id} visible={cancelOpen} onClose={() => setCancelOpen(false)} />
    </>
  );
}
