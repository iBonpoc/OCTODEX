/**
 * The client's sections (visual v2 «Клиент», #2350): «Обзор» (the gate code plate, the upcoming visits, «В работе» without the job
 * the «Сейчас» card already holds, «Последнее общение», «Закрыто»), «Работы» (the jobs with their visits, the closed ones and the
 * leads as groups — no second row of chips; the tech — his visits), «Сметы», «Счета» (the three figures, invoices, payments with who
 * took them, advances), «Объекты» (route, gate code with rights, access, people, jobs; the billing address last), «Журнал» (notes
 * «видно команде», open tasks, the feed by day). The «Сейчас» card (`ClientNowCard`) stands over the strip with the main step inside.
 * Built from src/ui only (GroupedList / ListGroup / GroupRow 56, StatGrid, NowCard, NumberTrio, Empty, Button).
 * Business rules are only called: money through the engine (clientMoneyOf, contractStatement in nextStep), rights (canSeeGateCode,
 * canSeeClientMoney), statuses (invoiceChip, estView, jobStatusView, leadStatusView), the stores' mutations with «Отменить».
 */
import { useState, type ReactElement, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import { peopleOf } from "@/data/people";
import { visitPropertyId } from "@/data/selectors";
import type { Customer, DB, Estimate, Invoice, Job, Person, Property, Visit } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeClientMoney, clientHistory, clientMoneyOf, clientOverdueOf, statusOf, type HistoryItem } from "@/features/clients";
import { clientRecords } from "@/features/clientRows";
import { dayOffsetOf, isoDayKey, todayKey } from "@/features/calendar";
import { invoiceChip } from "@/features/ContractStatement";
import { VoidInvoiceCards } from "@/features/invoice/VoidInvoice";
import { estView } from "@/features/boards";
import { jobStatusView } from "@/features/jobs";
import { leadStatusView, sourceName } from "@/features/leads";
import { NotesBlock } from "@/features/NotesBlock";
import { AdvancesBlock } from "@/features/payments/AdvancesBlock";
import { ModulePlaces } from "@/modules/ModulePlaces";
import { clientPlaceCtx } from "@/features/client/clientMeasure";
import { ClientDupCards } from "@/features/client/ClientDuplicates";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { billingLine } from "@/features/clientForm";
import { canSeeGateCode, propertyPeople, propertyTitle } from "@/features/properties";
import { isAssigned, isOpenVisit, visitWhen } from "@/features/schedule";
import { memberName } from "@/features/team";
import { plateHalves } from "@/features/planSlots";
import { visitStatus } from "@/features/visitStatus";
import { lateAfterOf } from "@/features/scheduleSettings";
import { invoiceTitle } from "@/features/invoiceTitle";
import { mailtoHref } from "@/features/contactLinks";
import {
  clientMainStep,
  clientNextStep,
  clientNowOf,
  clientStateOf,
  clientTileKeys,
  clientToBill,
  jobChain,
  jobFigures,
  workProgress,
  type ClientNow,
  type ClientState,
  type ClientTile,
} from "@/features/client/nextStep";
import { Button, StatusChip } from "@/ui/controls";
import { NumberTrio } from "@/ui/figures";
import { useDayWord } from "@/features/useDayWord";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { NowCard } from "@/ui/nowCard";
import { StatGrid, StatTile } from "@/ui/statTile";
import { statShown } from "@/ui/statTileLogic";
import { Sheet, useToast } from "@/ui/overlays";
import { Empty, ListRow } from "@/ui/surfaces";
import { ActionRow } from "@/ui/multiValueField";
import { Icon } from "@/ui/primitives";
import { clientMediaOf } from "@/features/client/clientMedia";
import type { MainAction } from "@/ui/templates";

/** what the five sections and the header share: read once per render of the client's screen */
export function useClientFacts(c: Customer) {
  const store = useStore();
  const { db, role, mode } = store;
  const office = role !== "tech";
  const r = clientRecords(db, c, role, mode);
  const m = clientMoneyOf(db, c.id);
  const overdue = office ? clientOverdueOf(db, c.id) : null;
  const toBillCents = office ? clientToBill(r.estimates, r.jobs, r.invoices) : 0;
  const jobIds = new Set(r.jobs.map((j) => j.id));
  const propIds = new Set(r.properties.map((p) => p.id));
  // the client's visits the role sees: the office all of them, the tech his own
  const visits = db.visits
    .filter((v) => (v.jobId ? jobIds.has(v.jobId) : propIds.has(visitPropertyId(db, v) ?? "")) && (office || isAssigned(v, db.me)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const today = todayKey();
  const now: ClientNow = clientNowOf({
    jobs: r.jobs,
    visits: visits.map((v) => ({ ...v, start: v.start })),
    invoices: r.invoices,
    estimates: r.estimates,
    leads: r.leads,
    today,
  });
  const status = statusOf(c);
  const state: ClientState = clientStateOf(status, { owesCents: office ? m.owesCents : 0, jobs: r.jobs.length, paidCents: office ? m.paidTotalCents : 0, toBillCents });
  const advanceCents = office ? (db.advances ?? []).filter((a) => a.customerId === c.id).reduce((s, a) => s + a.amountCents, 0) : 0;
  const hasMoney = office && (r.invoices.length > 0 || r.receipts.length > 0 || toBillCents > 0 || advanceCents > 0);
  const nextVisit = visits.find((v) => isOpenVisit(v) && dayOffsetOf(isoDayKey(v.start)) >= 0);
  // the tech's own visit of today or tomorrow: his «В путь»
  const techVisit = !office ? visits.find((v) => isOpenVisit(v) && [0, 1].includes(dayOffsetOf(isoDayKey(v.start))) && v.jobId) : undefined;
  const talks = clientHistory(db, c.id, role).filter((h) => h.kind === "talk" && ["phone", "sms", "mail"].includes(h.icon));
  return { db, role, office, r, m, overdue, toBillCents, visits, now, state, status, advanceCents, hasMoney, nextVisit, techVisit, talks, today };
}
export type ClientFacts = ReturnType<typeof useClientFacts>;

/** the main step of the client (the chain + the card's own steps) */
export function clientStepOf(f: ClientFacts, newEstimateHref: string | undefined) {
  const step = clientNextStep({ estimates: f.r.estimates, jobs: f.r.jobs, invoices: f.r.invoices, role: f.role, newEstimateHref });
  return clientMainStep({ role: f.role, state: f.state, step, now: f.now, techVisitId: f.techVisit?.id });
}

/** «2 дн. назад», «сегодня», «вчера»; older than a week — the date (LAYOUT-RULES §8 п.13) */
/** #2363 F46: the day of a past moment — the ONE rule (features/dayWords.ts): «Сегодня» / «вчера» / «пт, 19 нояб.» */
export function useAgo() {
  const dw = useDayWord();
  return (iso: string, mid?: boolean) => dw(iso, !!mid);
}

/** «Сегодня 8:30», «Завтра 9:00», «пт, 21 нояб. 10:00» — the day by the one rule, then the time */
function useWhen() {
  const { time } = useI18n();
  const dw = useDayWord();
  return (iso: string) => `${dw(iso)} ${time(iso)}`;
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/* ============================== Обзор ============================== */

/** #3061: the overview's look on the stand — «A» no tiles (crm-review, recommended), «B» a «Деньги» group with cents (design-review) */
const OVERVIEW_LOOK: "A" | "B" = "A";

export function ClientOverview({ c, f, onSection, withNow }: {
  c: Customer;
  f: ClientFacts;
  onSection: (k: "work" | "estimates" | "money" | "places" | "log") => void;
  /** the «Сейчас» card inside the section (the 1280 list's panel); on the client's screen it stands over the strip */
  withNow?: boolean;
}) {
  const { t, money, moneyWhole, time } = useI18n();
  const ago = useAgo();
  const when = useWhen();
  const store = useStore();
  const toast = useToast();
  const { db, r, office } = f;
  const money$ = canSeeClientMoney(f.role);
  // #3061: no tiles in variant A — the money is the «Сейчас» card's and the «Счета» tab's (crm-review: the tiles argued with the card)
  const nowJob = f.now && (f.now.kind === "working" || f.now.kind === "scheduled") ? f.now.job : undefined;
  const nowJobs = r.jobs.filter((j) => j.status !== "done" && !j.cancelledAt && j.id !== nowJob?.id);
  // the visits ahead (v2 «Сегодня 8:30–12:30 · Bathroom remodel · Alex»): the next two, not the one the card holds
  const nowVisitId = f.now && (f.now.kind === "working" || f.now.kind === "scheduled") ? f.now.visit.id : undefined;
  // v2 макет 3: the card's own visit is a row too — the card holds the job, the rows the days (not the visit twice: the card has no visit line)
  void nowVisitId;
  // #3072 (leader): one visit row for the whole app (useClientVisitRow) and one bound — every open visit (a missed one is «важно
  // сейчас» too), the overview keeps two
  const ahead = f.visits.filter(isOpenVisit).slice(0, 2);
  const visitRow = useClientVisitRow(f);
  const openTasks = r.tasks.filter((x) => !x.doneAt);
  const dw = useDayWord();
  const toggleTask = (x: (typeof openTasks)[number]) => {
    const res = store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() });
    toast.show(t("task.done"), res.undo);
  };

  // archive: on the client's screen the «Сейчас» card says it with its «Вернуть в активные»; «не обслуживаем» has no step — the plate
  const plate =
    f.state === "noService" || (f.state === "archived" && withNow) ? (
      <ListGroup testID="client-plate">
        <GroupRow
          lead={{ icon: f.state === "archived" ? "box" : "alert" }}
          title={f.state === "archived" ? t("proto.client.archivedTitle") : t("proto.client.noServiceTitle")}
          subtitle={f.state === "archived" ? t("proto.client.archivedHint") : [c.statusReason, t("client.noServiceHint")].filter(Boolean).join(" · ")}
        />
      </ListGroup>
    ) : withNow ? (
      <ClientNowCard f={f} />
    ) : null;
  return (
    <View style={{ gap: space[4] }} testID="client-overview">
      {plate}
      {/* #3060 (founder 27.11: «всё в одном блоке слито… или все вместе, или все раздельно»): every record of every section of the client
          is its own frame (#3017, #3022) — the overview's note, gate code and visits ahead too.
          #2363 F12/F20/F21: the pinned note, the access words and the visits ahead — quiet:
          a gate code is not a status, so no warm fill; the note takes 2 lines, never cut in the middle of a word */}
      {/* #3061: every group says what it is — «Важно знать» (the pinned notes, the access), «Впереди» (the visits) — no row without
          its title; every record its own frame (#3060) */}
      <GroupedList testID="client-top">
        {/* #3068 (founder 27.11: «в обзоре не нравится… важно знать… код ворот… заметка… прикреплена, откреплена»): no «Важно знать» —
            the access, the people and the notes of a place are in «Объекты», the client's pinned notes first in «Журнал» */}
        <ListGroup separate title={t("ov3061.ahead")} testID="client-ahead">
          {ahead.map((v) => visitRow(v, `client-ahead-${v.id}`))}
        </ListGroup>
      </GroupedList>
      {OVERVIEW_LOOK === "B" && office
        ? (() => {
            // #3061 вариант Б (design-review): «Деньги» — долг и оплачено, с центами (#2672); нечего сказать — нет блока
            const drawn = [
              f.m.owesCents > 0 ? <StatTile key="debt" testID="client-tile-debt" label={t("proto.client.tile.debt")} value={money(f.m.owesCents)} icon="invoice" warn={f.overdue ? t("card.sign.overdueDays", { d: f.overdue.days }) : undefined} onPress={() => onSection("money")} /> : null,
              f.m.paidTotalCents > 0 ? <StatTile key="paid" testID="client-tile-paid" label={t("proto.client.tile.paid")} value={money(f.m.paidTotalCents)} icon="wallet" onPress={f.hasMoney ? () => onSection("money") : undefined} /> : null,
            ].filter(Boolean);
            return drawn.length ? (
              <GroupedList testID="client-money">
                <ListGroup bare title={t("ov3061.money")}>
                  <StatGrid testID="client-tiles">{drawn}</StatGrid>
                </ListGroup>
              </GroupedList>
            ) : null;
          })()
        : null}
      <ClientDupCards c={c} />
      {/* a new client: the «Сейчас» card says «Работ пока нет» with its «Новая смета»; the panel of the 1280 list says it here */}
      {withNow && f.state === "new" && !r.estimates.length ? <Empty icon="wrench" title={t("proto.client.noJobs")} hint={t("proto.client.noJobsHint")} testID="client-new-empty" /> : null}
      <GroupedList testID="client-overview-groups">
        <ListGroup separate title={t("proto.client.inWork")} testID="client-in-work">
          {nowJobs.map((j) => (
            <GroupRow
              key={j.id}
              testID={`client-job-${j.id}`}
              lead={{ icon: "wrench" }}
              title={j.title || j.number || t("cc.kind.job")}
              // the status as a word of the line: a pill and a sum would leave the title no room at 390
              subtitle={[t(jobStatusView[j.status].label), j.number, jobVisitLine(f.visits, j, t), r.properties.length > 1 ? placeName(db, j) : null].filter(Boolean).join(" · ")}
              value={office ? money(j.amountCents) : undefined}
              onPress={() => router.push(`/job/${j.id}`)}
            />
          ))}
        </ListGroup>
        <ListGroup separate title={t("ov3061.tasks")} count={openTasks.length > 2 ? openTasks.length : undefined} testID="client-tasks">
          {openTasks.slice(0, 2).map((x) => (
            <GroupRow
              key={x.id}
              testID={`client-task-${x.id}`}
              lead={{ done: !!x.doneAt, onToggle: () => toggleTask(x), label: x.title, testID: `client-task-done-${x.id}` }}
              title={x.title}
              subtitle={x.dueAt ? when(x.dueAt) : undefined}
              onPress={() => onSection("log")}
            />
          ))}
        </ListGroup>
        <ListGroup separate title={t("proto.client.lastTalk")} all={{ label: t("ov3061.all"), onPress: () => onSection("log"), testID: "client-log-all" }} testID="client-last-talk">
          {f.talks.slice(0, 2).map((h) => (
            <GroupRow key={h.id} lead={{ icon: h.icon }} title={t(h.title)} subtitle={[ago(h.at), h.detail].filter(Boolean).join(" · ")} />
          ))}
        </ListGroup>
      </GroupedList>
      {/* add-on modules' place (spec 33 П24 А3): nothing unless a module is switched on */}
      <ModulePlaces
        place="client"
        ctx={clientPlaceCtx(db, c.id, r.leadIds, r.properties)}
      />
    </View>
  );
}

const placeName = (db: DB, j: Job) => {
  const p = db.properties.find((x) => x.id === j.propertyId);
  return p ? propertyTitle(p) : null;
};

/** «выезд 1 из 2» of a job */
function jobVisitLine(visits: Visit[], j: Job, t: (k: DictKey, p?: Record<string, string | number>) => string) {
  const mine = visits.filter((v) => v.jobId === j.id);
  if (!mine.length) return null;
  const doneN = mine.filter((v) => !isOpenVisit(v)).length;
  return t("proto.client.visitOf", { n: Math.min(doneN + 1, mine.length), m: mine.length });
}

/**
 * «Сейчас» (visual v2 «Клиент»): what is with the client this minute, with the job's three figures «Смета · Оплачено · Остаток» and
 * the ONE main step inside (its reason beside it). The title opens the record. Nothing going on — the step alone (a new client:
 * «Работ пока нет» + «Новая смета»).
 */
export function ClientNowCard({ f, main }: { f: ClientFacts; main?: MainAction }) {
  const { t, money, moneyWhole, time, day } = useI18n();
  const ago = useAgo();
  const when = useWhen();
  const { db } = f;
  const n = f.now;
  const tech = (v: { techId: string | null }) => memberName(db, v.techId, t) ?? t("proto.client.noTech");
  /** v2 макет 3: «Смета ✓ · задаток ✓ · работа» on the left, the work «3 из 5 · 62 %» on the right */
  const words = (j: Job) => {
    const e = f.r.estimates.find((x) => x.id === j.estimateId);
    const word = { estimate: t("px2.cv.estimate"), deposit: t("px2.cv.deposit"), work: t("px2.cv.work") } as const;
    const chain = jobChain(j, e, f.r.invoices).map((x) => (x.done ? `${word[x.key]} ✓` : word[x.key])).join(" · ");
    const w = workProgress(f.visits.filter((v) => v.jobId === j.id));
    return { caption: chain, value: w ? t("px2.cv.ofPct", { n: w.done, m: w.total, p: w.pct }) : undefined };
  };
  /** the job's pill: «◷ Идёт» on site; else the estimate it was made from («✓ Смета принята»); else the job's own status */
  const jobPill = (j: Job, going: boolean) => {
    const e = f.r.estimates.find((x) => x.id === j.estimateId);
    if (going) return { status: "info" as const, label: t("px2.cv.going") };
    if (e) return { status: estView[e.status].s, label: t(e.status === "approved" ? "px2.cv.accepted" : estView[e.status].l), draft: estView[e.status].d };
    return { status: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) };
  };
  /** the card's name: the estimate's (the figures are its), else the job's */
  const jobName = (j: Job) => f.r.estimates.find((x) => x.id === j.estimateId)?.title || j.title;
  const figures = (j: Job) => {
    const x = f.office ? jobFigures(j, f.r.invoices) : null;
    if (!x) return undefined;
    const e = f.r.estimates.find((e) => e.id === j.estimateId);
    return [
      { value: moneyWhole(x.contract), label: t(e ? "proto.client.stEstimate" : "w2b.job.contract") },
      { value: moneyWhole(x.paid), label: t("cl6.money.paid") },
      { value: moneyWhole(x.remaining), label: t("w2b.client.left") },
    ] as const;
  };
  if (f.role === "tech" && f.techVisit) {
    const v = f.techVisit;
    const j = findJob(db, v.jobId);
    return (
      <NowCard
        testID="client-now"
        kicker={`${t("proto.client.yourVisit")} · ${when(v.start)}`}
        title={j?.title ?? t("prop.h.visit")}
        sub={[visitWhen(v, time, t("plan5.allDay")), t("proto.client.points", { n: v.checklist.length })].join(" · ")}
        main={main}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  }
  if (!n) {
    if (main && f.state === "archived")
      return <NowCard testID="client-now" kicker={t("proto.client.now")} title={t("proto.client.archivedTitle")} sub={t("proto.client.archivedHint")} main={main} />;
    if (main) return <NowCard testID="client-now" kicker={t("proto.client.now")} title={f.state === "new" ? t("proto.client.noJobs") : t("proto.client.nowNothing")} main={main} />;
    return f.state === "new" || f.state === "archived" || f.state === "noService" ? null : <NowCard testID="client-now" kicker={t("proto.client.now")} empty={t("proto.client.nowNothing")} />;
  }
  switch (n.kind) {
    case "working":
    case "scheduled":
      // v2 макет 3: no kicker, «Bathroom remodel ✓ Смета принята», the way in words, three figures «word 12 / figure 22», the step
      return (
        <NowCard
          testID="client-now"
          bare
          kicker={t("proto.client.now")}
          status={jobPill(n.job, n.kind === "working")}
          title={jobName(n.job)}
          words={words(n.job)}
          trio={figures(n.job)}
          trioLook="plain"
          main={main}
          onPress={() => router.push(`/visit/${n.visit.id}`)}
        />
      );
    case "overdue":
      return (
        <NowCard
          testID="client-now"
          kicker={t("proto.client.now")}
          status={{ status: "bad", label: t(invoiceChip(n.invoice).l, invoiceChip(n.invoice).p) }}
          title={t("proto.client.overdueTitle")}
          // the invoice, its job and the debt once; the step goes without a reason that would name the invoice again
          sub={[n.invoice.number, money(n.owesCents), findJob(db, n.invoice.jobId)?.title].filter(Boolean).join(" · ")}
          main={main ? { ...main, reason: undefined } : undefined}
          onPress={() => router.push(`/invoice/${n.invoice.id}`)}
        />
      );
    case "waiting":
    case "draft":
      return (
        <NowCard
          testID="client-now"
          kicker={t("proto.client.now")}
          status={{ status: estView[n.estimate.status].s, label: t(estView[n.estimate.status].l), draft: estView[n.estimate.status].d }}
          title={n.estimate.title || n.estimate.number || t("cc.kind.estimate")}
          sub={[n.estimate.number, f.office ? money(n.estimate.totalCents) : null, n.estimate.sentAt ? day(n.estimate.sentAt) : null].filter(Boolean).join(" · ")}
          main={main}
          onPress={() => router.push(`/estimate/${n.estimate.id}`)}
        />
      );
    case "lead":
      return (
        <NowCard
          testID="client-now"
          kicker={`${t("proto.client.now")} · ${ago(n.lead.receivedAt)}`}
          title={t("proto.client.leadFrom", { source: sourceName(db, n.lead.source) })}
          sub={n.lead.service}
          main={main}
          onPress={() => router.push(`/lead/${n.lead.id}`)}
        />
      );
  }
}

/* ============================== Работы ============================== */

/** where the job is along «Смета · Депозит · Работа · Счёт»: the first step not done */
export function projectStep(e: Estimate | undefined, j: Job, invoices: Invoice[]): number {
  const live = invoices.filter((i) => i.status !== "void" && i.jobId === j.id);
  const steps = [
    !e || e.status === "approved",
    !e?.depositCents || !!e.depositPaidAt || live.some((i) => i.kind === "deposit" && i.paidCents >= i.totalCents),
    j.status === "done",
    live.length > 0 && live.every((i) => i.paidCents >= i.totalCents) && j.status === "done",
  ];
  const at = steps.findIndex((x) => !x);
  return at === -1 ? steps.length : at;
}

/** «Выезды» — the client's visits, newest first (the tech's «Работы», the office's own section — #2363 q76) */
/**
 * One row of a client's visit for the whole app (#3072, leader 27.11: «раскладка строки выезда одна на всё приложение»): the job is
 * the title, «вс, 29 нояб. · 1:00–3:00 PM · Alex, Dmitry» (+ the place with 2+ properties) the line, the status (icon + word) on the
 * right; two lines when they must on 390. `testID` — the row's own (`client-visit-<id>` by default).
 */
export function useClientVisitRow(f: ClientFacts) {
  const { t, day, time } = useI18n();
  const { db, r } = f;
  return (v: Visit, testID = `client-visit-${v.id}`) => {
    const job = findJob(db, v.jobId);
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    const people = (v.assigneeIds?.length ? v.assigneeIds : [v.techId]).map((id) => memberName(db, id, t)?.split(" ")[0]).filter(Boolean).join(", ");
    const end = new Date(new Date(v.start).getTime() + (v.durationMin || 0) * 60_000).toISOString();
    // «1:00–3:00 PM», but «10:00 AM–1:00 PM» across noon (rule 7; design review #3072: «10:00–1:00 PM» read as the night);
    // the range is glued (no-break space, no-break hyphen) so 390 never splits it
    const [from, to] = plateHalves(time(v.start), time(end));
    const range = `${from}\u2011${to}`.replace(/ /g, "\u00a0");
    return (
      <GroupRow
        key={v.id}
        testID={testID}
        title={job?.title ?? t("visit.title")}
        subtitle={[v.allDay ? day(v.start) : `${day(v.start)} · ${range}`, people, r.properties.length > 1 && job ? placeName(db, job) : null].filter(Boolean).join(" · ")}
        status={{ status: st.status, label: t(st.label) }}
        wrap
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  };
}

export function ClientVisits({ f, customerId }: { f: ClientFacts; customerId?: string }) {
  const { t } = useI18n();
  const { db, r } = f;
  const [picking, setPicking] = useState(false);
  // #3072 (design + crm review of #3060): «Впереди» and «Прошли» apart, each visit with its status (icon + word), all its people;
  // the row (design review): the job is the title, «вс, 29 нояб. · 1:00–3:00 PM · Alex, Dmitry» the line, the status on the right
  // crm review #3072: an open visit (missed, late, signed and waiting for payment) never sinks into «Прошли» — the past is the closed
  // ones only; «Впереди» is every open visit, the earliest first (a missed one on top: it wants a step)
  const ahead = f.visits.filter(isOpenVisit).sort((a, b) => a.start.localeCompare(b.start));
  const past = f.visits.filter((v) => !ahead.includes(v)).sort((a, b) => b.start.localeCompare(a.start));
  const planner = f.role === "director" || f.role === "dispatcher";
  const live = r.jobs.filter((j) => !j.cancelledAt && j.status !== "done");
  // a visit is planned on a job (docs/specs/03): one open job — its schedule; several — which one; none — a new job for the client
  const plan = () => {
    if (live.length === 1) return router.push(`/job/schedule?jobId=${live[0]!.id}` as Href);
    if (!live.length) return router.push((customerId ? `/job/new?customerId=${customerId}&then=schedule` : "/job/new?then=schedule") as Href);
    setPicking(true);
  };
  const row = useClientVisitRow(f);
  const add = planner ? <ActionRow testID="client-visit-plan" label={t("c3072.plan")} icon="plusCircle" onPress={plan} /> : null;
  return (
    <View style={{ gap: space[4] }} testID="client-visits">
      {f.visits.length === 0 ? <Empty icon="calendar" title={t("prop.noVisits")} action={add ?? undefined} /> : null}
      {f.visits.length ? add : null}
      {f.visits.length ? (
        <GroupedList>
          {/* #3022 / #3060: each record its own frame (DS §5.5) */}
          <ListGroup separate title={t("c3072.ahead")} count={ahead.length || undefined} testID="client-visits-ahead">
            {ahead.map((v) => row(v))}
          </ListGroup>
          <ListGroup separate title={t("c3072.past")} count={past.length || undefined} testID="client-visits-past">
            {past.map((v) => row(v))}
          </ListGroup>
        </GroupedList>
      ) : null}
      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("c3072.pickJob")}>
        <View testID="client-visit-pick">
          {live.map((j) => (
            <View key={j.id} testID={`client-visit-pick-${j.id}`}>
              <ListRow title={j.title || j.number || t("cc.kind.job")} subtitle={[j.number, placeName(db, j)].filter(Boolean).join(" · ")} left={<Icon name="wrench" />} onPress={() => { setPicking(false); router.push(`/job/schedule?jobId=${j.id}` as Href); }} />
            </View>
          ))}
          <ActionRow testID="client-visit-pick-new" label={t("c3072.newJob")} icon="plusCircle" onPress={() => { setPicking(false); router.push((customerId ? `/job/new?customerId=${customerId}&then=schedule` : "/job/new?then=schedule") as Href); }} />
        </View>
      </Sheet>
    </View>
  );
}

export function ClientWork({ c, f }: { c: Customer; f: ClientFacts }) {
  const { t, tn, money, day } = useI18n();
  const when = useWhen();
  const { db, r, office } = f;
  if (f.role === "tech") {
    // the tech: his own visits only (client-card.html §7 «Работы» → «Выезды»)
    return <ClientVisits f={f} customerId={c.id} />;
  }
  const live = r.jobs.filter((j) => !j.cancelledAt && j.status !== "done");
  const closed = r.jobs.filter((j) => j.status === "done" || j.cancelledAt);
  // #3060 (founder 27.11: «всё в одном блоке слито»; design + crm review): each job is its own frame; its visits are a line under it —
  // «2 выезда · следующий вс, 29 нояб.» — the list of visits itself is the section «Выезды» (nothing twice)
  const visitsLine = (j: Job) => {
    const vis = f.visits.filter((v) => v.jobId === j.id);
    if (!vis.length) return undefined;
    const now = Date.now();
    const next = vis.filter((v) => Date.parse(v.start) >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
    const last = vis.filter((v) => Date.parse(v.start) < now).sort((a, b) => b.start.localeCompare(a.start))[0];
    const at = next ? t("c3060.nextVisit", { when: day(next.start) }) : last ? t("c3060.lastVisit", { when: day(last.start) }) : null;
    return [tn("px1.visitsN", vis.length, { n: vis.length }), at].filter(Boolean).join(" · ");
  };
  const project = (j: Job) => (
    <GroupRow
      key={j.id}
      testID={`client-job-${j.id}`}
      lead={{ icon: "wrench" }}
      title={j.title || j.number || t("cc.kind.job")}
      subtitle={[t(jobStatusView[j.status].label), j.number, r.properties.length > 1 ? placeName(db, j) : null].filter(Boolean).join(" · ")}
      extra={visitsLine(j)}
      // #3072 (design review, rule 2): the status as an icon — beside the sum in the name's line (#3033) — and its word first in the line
      status={{ status: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) }}
      // the sum in the name's own line (#3033), so the visits' line under it is not cut on 390
      valueTop
      // #3072: a job without a price is «Без цены», not «$0.00» (reads as «free»)
      value={office ? (j.amountCents ? money(j.amountCents) : t("c3072.noPrice")) : undefined}
      valueMark={!j.amountCents}
      onPress={() => router.push(`/job/${j.id}`)}
    />
  );
  return (
    <View style={{ gap: space[4] }} testID="client-work">
      {r.jobs.length === 0 && r.leads.length === 0 ? <Empty icon="wrench" title={t("client.empty.jobs")} hint={t("proto.client.noJobsHint")} /> : null}
      <GroupedList>
        {/* #3072 (design review): every group titled, its number a CountPill (as «Впереди», «Прошли») — not «· N» in the words */}
        <ListGroup separate title={t("c3072.active")} count={live.length || undefined} testID="client-projects">
          {live.map(project)}
        </ListGroup>
        <ListGroup separate title={t("c3072.closed")} count={closed.length || undefined} testID="client-closed-jobs">
          {closed.map((j) => (
            <GroupRow
              key={j.id}
              testID={`client-job-${j.id}`}
              lead={{ icon: "wrench" }}
              title={j.title || j.number || ""}
              titleNote={j.title ? j.number : undefined}
              subtitle={r.properties.length > 1 ? placeName(db, j) ?? undefined : undefined}
              status={{ status: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) }}
              figureRight
              value={j.amountCents ? money(j.amountCents) : t("c3072.noPrice")}
              valueMark={!j.amountCents}
              onPress={() => router.push(`/job/${j.id}`)}
            />
          ))}
        </ListGroup>
        <ListGroup separate title={t("c3072.leads")} count={r.leads.length || undefined} testID="client-leads">
          {r.leads.map((l) => (
            <GroupRow
              key={l.id}
              testID={`client-lead-${l.id}`}
              lead={{ icon: "inbox" }}
              title={l.service ?? l.name ?? l.number ?? ""}
              titleNote={l.service || l.name ? l.number : undefined}
              subtitle={day(l.receivedAt)}
              status={{ status: leadStatusView[l.status].status, label: t(leadStatusView[l.status].label) }}
              onPress={() => router.push(`/lead/${l.id}`)}
            />
          ))}
        </ListGroup>
      </GroupedList>
    </View>
  );
}

/* ============================== Сметы ============================== */

/** the client's estimates, newest first: the title, the number and when, the sum and the status (visual v2 «Сметы 1») */
export function ClientEstimates({ f }: { f: ClientFacts }) {
  const { t, moneyWhole, day } = useI18n();
  const list = [...f.r.estimates].sort((a, b) => (b.savedAt ?? b.sentAt ?? "").localeCompare(a.savedAt ?? a.sentAt ?? ""));
  return (
    <View style={{ gap: space[4] }} testID="client-estimates">
      {list.length === 0 ? (
        <Empty icon="doc" title={t("client.empty.estimates")} />
      ) : (
        <ListGroup separate>
          {list.map((e) => (
            <GroupRow
              key={e.id}
              testID={`client-estimate-${e.id}`}
              lead={{ icon: "doc" }}
              title={e.title || e.number || t("cc.kind.estimate")}
              titleNote={e.title ? e.number : undefined}
              subtitle={e.sentAt ? day(e.sentAt) : undefined}
              figureRight
              value={moneyWhole(e.totalCents)}
              status={{ status: estView[e.status].s, label: t(estView[e.status].l), draft: estView[e.status].d }}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </ListGroup>
      )}
    </View>
  );
}

/* ============================== Деньги ============================== */

export function ClientMoney({ c, f }: { c: Customer; f: ClientFacts }) {
  const { t, money, moneyWhole, day } = useI18n();
  const { db, r } = f;
  const voided = (db.voidInvoices ?? []).filter((i) => i.customerId === c.id);
  return (
    <View style={{ gap: space[4] }} testID="client-money">
      {/* v2 «тройка цифр»: Долг · Ещё выставить · Оплачено (the advance is its own block below) */}
      <NumberTrio
        testID="client-money-figures"
        items={[
          { value: moneyWhole(f.m.owesCents), label: f.overdue ? `${t("w2b.client.debt")} · ${t("card.sign.overdueDays", { d: f.overdue.days })}` : t("w2b.client.debt") },
          { value: moneyWhole(f.toBillCents), label: t("proto.client.tile.toBill") },
          { value: moneyWhole(f.m.paidTotalCents), label: t("cl6.money.paid") },
        ]}
      />
      <GroupedList>
        <ListGroup separate title={t("client.invoices")} testID="client-invoices">
          {r.invoices.map((inv) => {
            const ic = invoiceChip(inv);
            return (
              <GroupRow
                key={inv.id}
                testID={`client-invoice-${inv.id}`}
                lead={{ icon: "invoice" }}
                title={(inv.title && invoiceTitle(inv, t)) || inv.number || t("cc.kind.invoice")}
                titleNote={inv.title ? inv.number : undefined}
                subtitle={[findJob(db, inv.jobId)?.title, inv.sentAt ? day(inv.sentAt) : null].filter(Boolean).join(" · ")}
                figureRight
                value={moneyWhole(inv.totalCents)}
                status={{ status: ic.s, label: t(ic.l, ic.p) }}
                onPress={() => router.push(`/invoice/${inv.id}`)}
              />
            );
          })}
        </ListGroup>
        <ListGroup separate title={t("client.receipts")} testID="client-receipts">
          {[...r.receipts].sort((a, b) => b.at.localeCompare(a.at)).map((p) => (
            <GroupRow
              key={p.id}
              testID={`client-receipt-${p.id}`}
              lead={{ icon: "dollar" }}
              title={t(`pay.${p.method}` as DictKey)}
              titleNote={p.receiptNumber ?? t("rcpt.title")}
              subtitle={[day(p.at), p.receivedBy ? t("proto.client.takenBy", { who: memberName(db, p.receivedBy, t) ?? "—" }) : null].filter(Boolean).join(" · ")}
              figureRight
              value={moneyWhole(p.amountCents)}
              onPress={() => router.push(`/receipt/${p.id}`)}
            />
          ))}
        </ListGroup>
      </GroupedList>
      <VoidInvoiceCards list={voided} testPrefix="client" />
      {/* spec 35 §4г: the client's money without an invoice — apply or refund it on its receipt */}
      <AdvancesBlock customerId={c.id} />
    </View>
  );
}

/* ============================== Объекты ============================== */

export function ClientPlaces({ c, f, onRoute, onCall, onSms }: { c: Customer; f: ClientFacts; onRoute: (p: Property) => void; onCall?: (p: Person, number: string) => void; onSms?: (p: Person) => void }) {
  const { t } = useI18n();
  const { db, r, office } = f;
  const [newProp, setNewProp] = useState<Property | null>(null);
  const add = office ? () => setNewProp(newProperty(c.id)) : undefined;
  return (
    <View style={{ gap: space[4] }} testID="client-places">
      {r.properties.length === 0 ? (
        <Empty
          icon="home2"
          title={t("client.empty.properties")}
          hint={t("client.empty.propertiesHint")}
          action={add ? <Button testID="client-empty-add-property" label={t("prop.add")} icon="plus" variant="secondary" onPress={add} /> : undefined}
        />
      ) : (
        <GroupedList>
          {r.properties.map((p, i) => <PlaceCard key={p.id} p={p} n={i + 1} f={f} onRoute={onRoute} onCall={onCall} onSms={onSms} />)}
          {office ? (
            // #3068 (crm/design review): the billing address is the client's, under its own title; the same as a place — said so
            <ListGroup title={t("client.row.billing")} testID="client-billing">
              <GroupRow
                lead={{ icon: "invoice" }}
                title={c.billing ? billingLine(c.billing) : propertyTitle(r.properties[0]!)}
                subtitle={c.billing ? undefined : t("ov3068.billingSame", { n: 1 })}
                chevron
                onPress={() => router.push(`/client/edit?id=${c.id}`)}
              />
            </ListGroup>
          ) : null}
          {add ? (
            <ListGroup testID="client-places-add">
              <GroupRow lead={{ icon: "plus" }} title={t("prop.add")} onPress={add} testID="client-add-property" />
            </ListGroup>
          ) : null}
        </GroupedList>
      )}
      <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
    </View>
  );
}

/**
 * #3068 (founder 27.11: «объект 1, объект 2… адрес, по нему какие-то комментарии, доступы на объекте, имена, работы»): one card a place,
 * under its title «Объект 1 · Home» — the address with the route, the access (the gate code by its rights, the words of the way in),
 * the notes of the place (pinned first, two), the people on site, the jobs there (three, with their status; «Все работы · N»).
 */
function PlaceCard({ p, n, f, onRoute, onCall, onSms }: { p: Property; n: number; f: ClientFacts; onRoute: (p: Property) => void; onCall?: (p: Person, number: string) => void; onSms?: (p: Person) => void }) {
  const { t, tn } = useI18n();
  const dial = useDialThenAsk();
  const dw = useDayWord();
  const { db, r, office } = f;
  const seen = canSeeGateCode(db, f.role, p.id);
  const people = propertyPeople(db, p);
  const jobs = r.jobs.filter((j) => j.propertyId === p.id).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.id.localeCompare(a.id));
  const notes = db.notes
    .filter((x) => x.subjectType === "property" && x.subjectId === p.id && !(x as { deletedAt?: string }).deletedAt && (x.visibility === "team" || x.authorId === db.me))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  const street = [p.address, p.unit].filter(Boolean).join(", ");
  const open = () => router.push(`/property/${p.id}`);
  return (
    // the review of #3060 (design): the label names the place («Home»), no label — «Объект N»; every record of the place its own frame
    // (#3060 «или все вместе, или все раздельно»), the kind said first in its line («Доступ · …», «Заметка · …»)
    <ListGroup separate title={p.label || t("ov3068.place", { n })} testID={`client-property-${p.id}`}>
      <GroupRow
        lead={{ icon: "home2" }}
        title={street || propertyTitle(p)}
        subtitle={[p.place ? [p.place.city, [p.place.state, p.place.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : p.city, p.stories ? tn("ov3068.stories", p.stories, { n: p.stories }) : null].filter(Boolean).join(" · ")}
        actions={[{ icon: "navigate", a11y: `${t("client.route")}: ${propertyTitle(p)}`, onPress: () => onRoute(p), testID: `client-property-route-${p.id}` }]}
        onPress={open}
      />
      {p.gateCode || p.accessNotes ? (
        <GroupRow
          lead={{ icon: "key" }}
          wrap
          title={p.gateCode ? (seen ? t("proto.client.gateIs", { code: p.gateCode }) : t("proto.client.gateLater")) : t("proto.client.access")}
          subtitle={p.gateCode ? [t("proto.client.access"), p.accessNotes].filter(Boolean).join(" · ") : p.accessNotes || undefined}
          testID={`client-property-gate-${p.id}`}
        />
      ) : null}
      {notes.slice(0, 2).map((x) => (
        <GroupRow
          key={x.id}
          testID={`client-property-note-${x.id}`}
          lead={{ icon: x.pinned ? "pushpin" : "note" }}
          wrap
          title={x.body}
          subtitle={`${t("proto.client.note")} · ${t(x.visibility === "team" ? "ov3061.pinnedTeam" : "ov3061.pinnedMine", { who: memberName(db, x.authorId, t)?.split(" ")[0] ?? "—", when: dw(x.at) })}`}
          onPress={open}
        />
      ))}
      {people.map((x) => (
        <GroupRow
          key={x.id}
          testID={`client-property-person-${x.id}`}
          lead={{ icon: "user" }}
          title={x.name}
          subtitle={t("proto.client.onSite")}
          // the review of #3060: the person on site is one tap away — the call (as the contacts panel: dial, then ask) and, a mobile, SMS
          actions={(() => {
            const ph = x.phones?.[0];
            if (!ph || !onCall) return undefined;
            return [
              { icon: "phone" as const, a11y: `${t("client.call")} ${x.name}: ${ph.number}`, testID: `client-property-call-${x.id}`, onPress: () => dial(ph.number, () => onCall(x, ph.number)) },
              ...(ph.label === "mobile" && onSms ? [{ icon: "sms" as const, a11y: `${t("cc.sms")} ${x.name}: ${ph.number}`, testID: `client-property-sms-${x.id}`, onPress: () => onSms(x) }] : []),
            ];
          })()}
        />
      ))}
      {jobs.slice(0, 3).map((j) => (
        <GroupRow
          key={j.id}
          wrap
          testID={`client-property-job-${j.id}`}
          lead={{ icon: "wrench" }}
          title={j.title || j.number || t("cc.kind.job")}
          subtitle={[j.number, jobVisitLine(f.visits, j, t)].filter(Boolean).join(" · ") || undefined}
          status={{ status: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) }}
          onPress={() => router.push(`/job/${j.id}`)}
        />
      ))}
      {jobs.length > 3 ? <GroupRow compact lead={{ icon: "wrench" }} title={t("ov3068.allJobs", { n: jobs.length })} chevron onPress={open} testID={`client-property-jobs-${p.id}`} /> : null}
    </ListGroup>
  );
}

/* ============================== Журнал ============================== */

/**
 * The log (#2350 «не больше одного ряда чипов»): no filter strip under the sections — the notes first («видно команде» / «только мне»
 * inside NotesBlock), the open tasks, the feed by day (calls, SMS, mail, documents), the photos and files as one row.
 */
export function ClientLog({ c, f }: { c: Customer; f: ClientFacts }) {
  const store = useStore();
  const { t, money, day } = useI18n();
  const toast = useToast();
  const ago = useAgo();
  const { db, r, office } = f;
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  const feed = clientHistory(db, c.id, f.role).filter((h) => h.icon !== "note");
  // the feed by day: «Сегодня», «18 нояб.»
  const days: [string, HistoryItem[]][] = [];
  for (const h of feed) {
    const k = ago(h.at) === t("common.today") ? t("common.today") : day(h.at);
    const last = days[days.length - 1];
    if (last && last[0] === k) last[1].push(h);
    else days.push([k, [h]]);
  }
  const openT = r.tasks.filter((x) => !x.doneAt);
  const doneN = r.tasks.length - openT.length;
  const newTask = () => setTaskEdit({ subjectType: "customer", subjectId: c.id, title: "", assigneeId: db.me });
  // #3076: the same count as the screen «Фото и файлы» (a visit's photo kept also as a file row is one photo)
  const files = clientMediaOf(db, f.visits, c.id, new Set(r.jobs.map((j) => j.id))).total;
  return (
    <View style={{ gap: space[4] }} testID="client-log">
      <View testID="client-notes">
        <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={r.leadIds.map((id) => ({ type: "lead" as const, id }))} />
      </View>
      <GroupedList testID="client-feed">
        {/* #3076 (crm-reviewer): over the feed — a long history never hides it */}
        {/* #3085: always there — the way to «＋» even before the first photo; the number only when there is one */}
        <ListGroup separate>
          <GroupRow lead={{ icon: "image" }} title={t("c3076.title")} value={files ? String(files) : undefined} chevron onPress={() => router.push(`/client/files/${c.id}`)} testID="client-files-row" />
        </ListGroup>
        <ListGroup
          separate
          title={t("client.row.tasks")}
          all={office ? { label: t("task.new"), onPress: newTask, testID: "client-task-new" } : undefined}
          testID="client-tasks-open"
        >
          {openT.map((x) => (
            <GroupRow
              key={x.id}
              testID={`client-task-${x.id}`}
              lead={{ icon: "check" }}
              title={x.title}
              subtitle={[x.dueAt ? day(x.dueAt) : null, memberName(db, x.assigneeId, t)].filter(Boolean).join(" · ")}
              actions={[{ icon: "check", a11y: `${t("client.taskDone")}: ${x.title}`, testID: `client-task-done-btn-${x.id}`, onPress: () => toast.show(t("client.taskDoneToast"), store.saveTask({ ...x, doneAt: new Date().toISOString() }).undo) }]}
              onPress={() => setTaskEdit(x)}
            />
          ))}
          {doneN ? <GroupRow compact key="done" testID="client-tasks-done" lead={{ icon: "history" }} title={t("client.doneTasks", { n: doneN })} onPress={() => router.push("/tasks")} /> : null}
        </ListGroup>
        {days.map(([k, hs]) => (
          <ListGroup separate key={k} title={k}>
            {hs.map((h) => (
              <GroupRow
                key={h.id}
                compact={!h.detail}
                lead={{ icon: h.icon }}
                title={t(h.title)}
                subtitle={h.detail}
                value={h.cents !== undefined ? money(h.cents) : undefined}
                onPress={h.href ? () => router.push(h.href as never) : undefined}
              />
            ))}
          </ListGroup>
        ))}
      </GroupedList>
      <TaskSheet value={taskEdit} onClose={() => setTaskEdit(null)} />
    </View>
  );
}

/* ============================== the header's panel: contacts, addresses, facts ============================== */

const PHONE_KEY: Record<string, DictKey> = { mobile: "phone.mobile", home: "phone.home", work: "phone.work", other: "phone.other" };

/**
 * The panel under the header (client-card.html (б)): «Контакты · N» — each person with the role and the documents' language, each
 * phone with its type, ★ the main one and its own «тел» / «смс»; «Адреса · N» with «путь»; «Сведения» — the number, created and
 * responsible (not in the model: prototype), source, tax, where invoices go. A phone calls through dialThenAsk («Чем кончился?»).
 */
export function ClientDetails({ c, f, onCall, onSms, onRoute }: { c: Customer; f: ClientFacts; onCall: (p: Person, number: string) => void; onSms: (p: Person) => void; onRoute: (p: Property) => void }) {
  const { t } = useI18n();
  const dial = useDialThenAsk();
  const people = peopleOf(c);
  const { db, r, office } = f;
  const star = (on: boolean | undefined, many: number) => (on && many > 1 ? " ★" : "");
  return (
    <View style={{ gap: space[4] }} testID="client-details">
      <ListGroup title={`${t("proto.client.contacts")} · ${people.length}`} testID="client-people">
        {people.flatMap((p, pi) => [
          // the client himself is the header's name: his phones come first, without his name again (#2350, audit 2.4)
          pi === 0 && (!p.name || p.name === c.name) ? null : <GroupRow
            key={`h${p.id}`}
            compact
            lead={{ initials: initials(p.name || c.name) }}
            title={p.name || c.name}
            subtitle={[t(`person.role.${p.role}` as DictKey), p.language ? t("proto.client.docLang", { lang: p.language.toUpperCase() }) : null].filter(Boolean).join(" · ")}
          />,
          ...p.phones.map((ph, i) => (
            <GroupRow
              key={`${p.id}-ph${i}`}
              compact
              testID={`client-phone-${p.id}-${i}`}
              title={ph.number}
              subtitle={`${t(PHONE_KEY[ph.label] ?? "phone.other")}${star(ph.primary, p.phones.length)}`}
              actions={[
                { icon: "phone", a11y: `${t("client.call")} ${p.name || c.name}: ${ph.number}`, testID: `client-phone-call-${p.id}-${i}`, onPress: () => dial(ph.number, () => onCall(p, ph.number)) },
                ...(ph.label === "mobile" ? [{ icon: "sms" as const, a11y: `${t("cc.sms")} ${p.name || c.name}: ${ph.number}`, testID: `client-phone-sms-${p.id}-${i}`, onPress: () => onSms(p) }] : []),
              ]}
            />
          )),
          ...p.emails.map((e, i) => (
            <GroupRow
              key={`${p.id}-em${i}`}
              compact
              title={e.address}
              subtitle={`${t("co.email")}${star(e.primary, p.emails.length)}`}
              actions={[{ icon: "mail", a11y: `${t("visit.message")}: ${e.address}`, testID: `client-mail-${p.id}-${i}`, onPress: () => { const u = mailtoHref(e.address); if (u) Linking.openURL(u).catch(() => {}); } }]}
            />
          )),
        ])}
      </ListGroup>
      <ListGroup title={`${t("proto.client.addresses")} · ${r.properties.length}`} testID="client-addresses">
        {r.properties.map((p) => (
          <GroupRow
            key={p.id}
            compact
            title={propertyTitle(p)}
            subtitle={[p.city, p.label].filter(Boolean).join(" · ")}
            actions={[{ icon: "navigate", a11y: `${t("client.route")}: ${propertyTitle(p)}`, testID: `client-address-route-${p.id}`, onPress: () => onRoute(p) }]}
          />
        ))}
      </ListGroup>
      {/* #3023 (founder: «сведения пересобрать… адрес для счетов, налог»; design review 27.11): what the invoices need — only when it is
          not the default (a billing address of its own, no sales tax); the value large, its name small under it, as iOS Contacts */}
      {office && (c.billing || c.taxExempt) ? (
        <ListGroup title={t("oc.client.forInvoices")} testID="client-for-invoices">
          {c.billing ? <GroupRow compact title={billingLine(c.billing)} subtitle={t("client.row.billing")} /> : null}
          {c.taxExempt ? <GroupRow compact title={[t("client.f.taxExempt"), c.taxExemptNote].filter(Boolean).join(" · ")} subtitle={t("proto.client.tax")} /> : null}
        </ListGroup>
      ) : null}
      {c.number || (office && c.sourceId) ? (
        <ListGroup title={t("proto.client.facts")} testID="client-facts">
          {c.number ? <GroupRow compact title={c.number} subtitle={t("proto.client.number")} /> : null}
          {office && c.sourceId ? <GroupRow compact title={sourceName(db, c.sourceId)} subtitle={t("proto.client.tile.source")} /> : null}
        </ListGroup>
      ) : null}
      {statusOf(c) === "do_not_service" ? <StatusChip status="bad" label={t("client.noServiceHint")} /> : null}
    </View>
  );
}

