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
import { router } from "expo-router";
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
import { useToast } from "@/ui/overlays";
import { Empty } from "@/ui/surfaces";
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
  const { db, r, office } = f;
  const money$ = canSeeClientMoney(f.role);
  // what the «Сейчас» card already says is not said again (#2350): its job's figures (debt / to bill / paid), its visit
  const nowJob = f.now && (f.now.kind === "working" || f.now.kind === "scheduled") ? f.now.job : undefined;
  const covered = new Set<ClientTile>([
    ...(nowJob && jobFigures(nowJob, r.invoices) ? (["toBill", "paid", "debt"] as const) : []),
    ...(f.now?.kind === "overdue" ? (["debt"] as const) : []),
    // the next visit is a row of «впереди» (or the card's own) — never a tile beside it saying the same
    "nextVisit",
  ]);
  const shownTiles = clientTileKeys(f.role, f.state, f.toBillCents).filter((k) => !covered.has(k));
  // a lone tile is a wall of one: the line it would say is in the sections (v2 «тройка цифр», not a 2×2 of leftovers)
  const tiles = shownTiles;
  const nowJobs = r.jobs.filter((j) => j.status !== "done" && !j.cancelledAt && j.id !== nowJob?.id);
  // the visits ahead (v2 «Сегодня 8:30–12:30 · Bathroom remodel · Alex»): the next two, not the one the card holds
  const nowVisitId = f.now && (f.now.kind === "working" || f.now.kind === "scheduled") ? f.now.visit.id : undefined;
  // v2 макет 3: the card's own visit is a row too — the card holds the job, the rows the days (not the visit twice: the card has no visit line)
  void nowVisitId;
  const ahead = f.visits.filter((v) => isOpenVisit(v) && dayOffsetOf(isoDayKey(v.start)) >= 0).slice(0, 2);
  // the pinned notes of the client (v2 «Gate code 4512 · small dog / закреплено · видят мастера»): the warm plate first
  const pinned = db.notes.filter((n) => n.subjectType === "customer" && n.subjectId === c.id && n.pinned && !(n as { deletedAt?: string }).deletedAt);
  const aheadRow = useAheadRow(f);
  const openTasks = r.tasks.filter((x) => !x.doneAt);
  const done = r.jobs.filter((j) => j.status === "done").sort((a, b) => b.id.localeCompare(a.id))[0];
  const place = r.properties.find((p) => p.accessNotes || p.gateCode) ;
  const gateSeen = place ? canSeeGateCode(db, f.role, place.id) : false;
  const lastTalk = f.talks[0];
  const [main] = peopleOf(c);

  const tile = (k: ClientTile): ReactNode => {
    switch (k) {
      case "debt":
        return <StatTile key={k} testID="client-tile-debt" label={t("proto.client.tile.debt")} value={moneyWhole(f.m.owesCents)} icon="invoice" warn={f.overdue ? t("card.sign.overdueDays", { d: f.overdue.days }) : undefined} onPress={() => onSection("money")} />;
      case "paid":
        return <StatTile key={k} testID="client-tile-paid" label={t("proto.client.tile.paid")} value={moneyWhole(f.m.paidTotalCents)} icon="wallet" onPress={money$ && f.hasMoney ? () => onSection("money") : undefined} />;
      case "toBill":
        return <StatTile key={k} testID="client-tile-tobill" label={t("proto.client.tile.toBill")} value={moneyWhole(f.toBillCents)} icon="doc" onPress={() => onSection("money")} />;
      case "nextVisit":
        return f.nextVisit ? (
          <StatTile key={k} testID="client-tile-next" label={`${t("proto.client.tile.next")} · ${dayWord(f.nextVisit.start)}`} value={time(f.nextVisit.start)} icon="calendar" onPress={() => router.push(`/visit/${f.nextVisit!.id}`)} />
        ) : null;
      case "contact":
        return lastTalk ? <StatTile key={k} testID="client-tile-contact" label={`${t("proto.client.tile.contact")} · ${t(lastTalk.title)}`} value={ago(lastTalk.at)} icon="phone" onPress={() => onSection("log")} /> : null;
      case "reminded": {
        const since = r.invoices.filter((i) => i.sentAt && i.paidCents < i.totalCents).map((i) => i.sentAt!).sort()[0];
        const n = since ? f.talks.filter((h) => h.at >= since).length : 0;
        return <StatTile key={k} testID="client-tile-reminded" label={`${t("proto.client.tile.reminded")}${n ? ` · ${ago(f.talks[0]!.at)}` : ""}`} value={n ? String(n) : t("proto.client.never")} icon="bell" onPress={() => onSection("log")} />;
      }
      case "lastJob":
        return done ? <StatTile key={k} testID="client-tile-lastjob" label={`${t("proto.client.tile.lastJob")} · ${done.title}`} value={done.number ?? "—"} icon="wrench" onPress={() => router.push(`/job/${done.id}`)} /> : null;
      case "approved": {
        const ok = r.estimates.filter((e) => e.status === "approved").length;
        return r.estimates.length ? <StatTile key={k} testID="client-tile-approved" label={t("proto.client.tile.approved")} value={`${ok}/${r.estimates.length}`} icon="check" onPress={() => onSection("work")} /> : null;
      }
      case "source":
        return c.sourceId ? <StatTile key={k} testID="client-tile-source" label={t("proto.client.tile.source")} value={sourceName(db, c.sourceId)} icon="star" /> : null;
      case "gate":
        return place?.gateCode ? <StatTile key={k} testID="client-tile-gate" label={t("proto.client.tile.gate")} value={gateSeen ? place.gateCode : "•••"} warn={gateSeen ? undefined : t("proto.client.gateLater")} icon="key" /> : null;
      case "onSite":
        return main ? <StatTile key={k} testID="client-tile-onsite" label={t("proto.client.tile.onSite")} value={main.name.split(" ")[0] ?? main.name} icon="user" /> : null;
      case "tomorrow": {
        const tm = f.visits.find((v) => isOpenVisit(v) && dayOffsetOf(isoDayKey(v.start)) === 1);
        return tm ? <StatTile key={k} testID="client-tile-tomorrow" label={t("common.tomorrow")} value={time(tm.start)} icon="calendar" onPress={() => router.push(`/visit/${tm.id}`)} /> : null;
      }
    }
  };
  const dw = useDayWord();
  const dayWord = (iso: string) => dw(iso);

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
      <GroupedList testID="client-top">
        <ListGroup separate testID="client-top-group">
          {pinned.map((n) => (
            <GroupRow
              key={n.id}
              testID={`client-pinned-${n.id}`}
              lead={{ icon: "key" }}
              wrap
              title={n.body.split("\n")[0]!}
              subtitle={t(n.visibility === "team" ? "px2.cv.pinnedTeam" : "px2.cv.pinnedMine")}
              onPress={() => onSection("log")}
            />
          ))}
          {place && (place.accessNotes || place.gateCode) ? (
            <GroupRow
              testID="client-access"
              lead={{ icon: "key" }}
              wrap
              title={place.gateCode ? (gateSeen ? t("proto.client.gateIs", { code: place.gateCode }) : t("proto.client.gateLater")) : t("proto.client.access")}
              subtitle={[place.accessNotes, r.properties.length > 1 ? propertyTitle(place) : null].filter(Boolean).join(" · ") || undefined}
              onPress={r.properties.length > 1 ? () => onSection("places") : () => router.push(`/property/${place.id}`)}
            />
          ) : null}
          {ahead.map((v) => aheadRow(v))}
        </ListGroup>
      </GroupedList>
      {(() => {
        // only the tiles that have something to say; a lone one is dropped (its line is in the sections)
        // (a tile whose value says nothing — «$0» — draws nothing: StatTile's own rule, statShown)
        const drawn = tiles.map(tile).filter((n): n is ReactElement<{ value: string }> => !!n && statShown(String((n as ReactElement<{ value: string }>).props.value)));
        return drawn.length >= 2 ? <StatGrid testID="client-tiles">{drawn}</StatGrid> : null;
      })()}
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
          {openTasks.slice(0, 2).map((x) => (
            <GroupRow key={x.id} testID={`client-task-${x.id}`} lead={{ icon: "check" }} title={x.title} subtitle={[t("proto.client.task"), x.dueAt ? when(x.dueAt) : null].filter(Boolean).join(" · ")} onPress={() => onSection("log")} />
          ))}
        </ListGroup>
        <ListGroup separate title={t("proto.client.lastTalk")} all={{ label: t("proto.client.allLog"), onPress: () => onSection("log"), testID: "client-log-all" }} testID="client-last-talk">
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

/** «8:30» of «8:30 AM» (the field's day: v2 draws the hours without AM / PM, the full time is on the visit) */
const bareTime = (s: string) => plateHalves(s, s)[0];

/**
 * A day row of the overview (v2 макет 3): «Сегодня 8:30–12:30 / Bathroom remodel · Alex» with «◷ Скоро» (today: «◷ Идёт» once on
 * site), another day «Завтра 9:00 / Final walkthrough…» with «Длит. 1 ч 30 мин» on the right. A visit of one task says the task.
 */
/** «Сегодня 8:30–12:30 / Bathroom remodel · Alex  ◷ Скоро» — a row of the overview's top group (#2363 F02: the time is never cut,
 *  the pill is one word: «Опаздывает», not «Опаздывает · не выехал» — the detail is on the visit itself) */
function useAheadRow(f: ClientFacts) {
  const { t, time, day, duration } = useI18n();
  const dw = useDayWord();
  const { db } = f;
  return (v: Visit) => {
    const off = dayOffsetOf(isoDayKey(v.start));
    const dayWord = dw(v.start);
    const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
    const going = v.step === "on_site" || v.step === "working";
    const today = off === 0;
    const tech = memberName(db, v.techId, t)?.split(" ")[0];
    const past = new Date(v.start).getTime() <= Date.now();
    const own = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    const ownWord = own.label === "late.enRoute" || own.label === "late.notLeft" ? "st.late" : own.label;
    const todayPill = going ? { status: "info" as const, label: t("px2.cv.going") } : past ? { status: own.status, label: t(ownWord) } : { status: "info" as const, label: t("px2.cv.soon") };
    const job = findJob(db, v.jobId);
    const jobWord = (job?.estimateId ? f.r.estimates.find((e) => e.id === job.estimateId)?.title : undefined) || job?.title;
    const line = v.scope.length === 1 ? v.scope[0]! : [jobWord, tech].filter(Boolean).join(" · ");
    return (
      <GroupRow
        key={v.id}
        testID={`client-ahead-${v.id}`}
        lead={{ icon: "calendar" }}
        title={today ? `${dayWord} ${bareTime(time(v.start))}–${bareTime(time(end))}` : `${dayWord} ${bareTime(time(v.start))}`}
        subtitle={line || undefined}
        status={today ? todayPill : undefined}
        cols={today ? undefined : [{ label: t("px2.cv.dur"), value: duration(v.durationMin) }]}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  };
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
export function ClientVisits({ f }: { f: ClientFacts }) {
  const { t } = useI18n();
  const when = useWhen();
  const { db } = f;
  return f.visits.length === 0 ? (
      <Empty icon="calendar" title={t("prop.noVisits")} />
    ) : (
      <GroupedList testID="client-visits">
        {/* #3022 (founder 26.11: «там тоже нужно разделить все списки»): each record its own frame, as the lists (#3017) */}
        <ListGroup separate>
          {[...f.visits].reverse().map((v) => (
            <GroupRow
              key={v.id}
              testID={`client-visit-${v.id}`}
              lead={{ icon: "calendar" }}
              title={findJob(db, v.jobId)?.title ?? t("prop.h.visit")}
              subtitle={[when(v.start), memberName(db, v.techId, t)].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          ))}
        </ListGroup>
      </GroupedList>
    );
}

export function ClientWork({ f }: { c: Customer; f: ClientFacts }) {
  const { t, money, day } = useI18n();
  const when = useWhen();
  const { db, r, office } = f;
  if (f.role === "tech") {
    // the tech: his own visits only (client-card.html §7 «Работы» → «Выезды»)
    return <ClientVisits f={f} />;
  }
  const live = r.jobs.filter((j) => !j.cancelledAt && j.status !== "done");
  const closed = r.jobs.filter((j) => j.status === "done" || j.cancelledAt);
  // one job, one group: its row and its visits under it (the estimate and the invoices are their own sections — nothing twice)
  const project = (j: Job) => {
    const vis = f.visits.filter((v) => v.jobId === j.id);
    return (
      <ListGroup key={j.id} testID={`client-project-${j.id}`}>
        <GroupRow
          testID={`client-job-${j.id}`}
          lead={{ icon: "wrench" }}
          title={j.title || j.number || t("cc.kind.job")}
          subtitle={[t(jobStatusView[j.status].label), j.number, r.properties.length > 1 ? placeName(db, j) : null].filter(Boolean).join(" · ")}
          value={office ? money(j.amountCents) : undefined}
          onPress={() => router.push(`/job/${j.id}`)}
        />
        {vis.map((v) => (
          <GroupRow compact key={v.id} testID={`client-visit-${v.id}`} lead={{ icon: "calendar" }} title={when(v.start)} subtitle={memberName(db, v.techId, t)} onPress={() => router.push(`/visit/${v.id}`)} />
        ))}
      </ListGroup>
    );
  };
  return (
    <View style={{ gap: space[4] }} testID="client-work">
      {r.jobs.length === 0 && r.leads.length === 0 ? <Empty icon="wrench" title={t("client.empty.jobs")} hint={t("proto.client.noJobsHint")} /> : null}
      <GroupedList>
        {live.map(project)}
        <ListGroup separate title={t("w2b.client.closedJobs", { n: closed.length })} testID="client-closed-jobs">
          {closed.map((j) => (
            <GroupRow
              key={j.id}
              testID={`client-job-${j.id}`}
              lead={{ icon: "wrench" }}
              title={j.title || j.number || ""}
              titleNote={j.title ? j.number : undefined}
              subtitle={[t(jobStatusView[j.status].label), r.properties.length > 1 ? placeName(db, j) : null].filter(Boolean).join(" · ")}
              figureRight
              value={money(j.amountCents)}
              onPress={() => router.push(`/job/${j.id}`)}
            />
          ))}
        </ListGroup>
        <ListGroup separate title={t("w2b.client.leads", { n: r.leads.length })} testID="client-leads">
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

export function ClientPlaces({ c, f, onRoute }: { c: Customer; f: ClientFacts; onRoute: (p: Property) => void }) {
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
          {r.properties.map((p) => {
            const seen = canSeeGateCode(db, f.role, p.id);
            const people = propertyPeople(db, p);
            const jobs = r.jobs.filter((j) => j.propertyId === p.id);
            const open = jobs.filter((j) => j.status !== "done" && !j.cancelledAt).length;
            return (
              <ListGroup key={p.id} testID={`client-property-${p.id}`}>
                <GroupRow
                  lead={{ icon: "home2" }}
                  title={propertyTitle(p)}
                  subtitle={[p.city, p.label, p.stories ? t("proto.client.stories", { n: p.stories }) : null].filter(Boolean).join(" · ")}
                  actions={[{ icon: "navigate", a11y: `${t("client.route")}: ${propertyTitle(p)}`, onPress: () => onRoute(p), testID: `client-property-route-${p.id}` }]}
                  onPress={() => router.push(`/property/${p.id}`)}
                />
                {p.gateCode ? (
                  <GroupRow compact lead={{ icon: "key" }} title={seen ? t("proto.client.gateIs", { code: p.gateCode }) : t("proto.client.tile.gate")} subtitle={seen ? (office ? t("proto.client.gateRule") : undefined) : t("proto.client.gateLater")} testID={`client-property-gate-${p.id}`} />
                ) : null}
                {p.accessNotes ? <GroupRow compact lead={{ icon: "alert" }} title={t("proto.client.access")} subtitle={p.accessNotes} /> : null}
                {people.length ? <GroupRow compact lead={{ icon: "users" }} title={t("proto.client.onSite")} subtitle={people.map((x) => x.name).join(" · ")} /> : null}
                {jobs.length ? (
                  <GroupRow compact lead={{ icon: "wrench" }} title={t("proto.client.jobsHere", { n: jobs.length })} subtitle={open ? t("prop.openJobs", { n: open }) : undefined} onPress={() => router.push(`/property/${p.id}`)} />
                ) : null}
              </ListGroup>
            );
          })}
          {office ? (
            <ListGroup testID="client-billing">
              <GroupRow lead={{ icon: "invoice" }} title={t("client.row.billing")} subtitle={c.billing ? billingLine(c.billing) : t("client.row.billingSame")} onPress={() => router.push(`/client/edit?id=${c.id}`)} />
            </ListGroup>
          ) : null}
        </GroupedList>
      )}
      <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
    </View>
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
  const files = r.photos.length + r.files.length;
  return (
    <View style={{ gap: space[4] }} testID="client-log">
      <View testID="client-notes">
        <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={r.leadIds.map((id) => ({ type: "lead" as const, id }))} />
      </View>
      <GroupedList testID="client-feed">
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
        {files ? (
          <ListGroup separate>
            <GroupRow lead={{ icon: "image" }} title={t("w2b.client.files", { n: files })} subtitle={t("client.photosHint")} />
          </ListGroup>
        ) : null}
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

