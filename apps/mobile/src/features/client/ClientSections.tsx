/**
 * The client's five sections (prototype v2, docs/design/client-card.html §4–§7, BUILD-SPEC §2.4): «Обзор» («Сейчас», tiles 2×2,
 * access, «В работе», «Последнее общение», «Закрыто»), «Работы» (projects as chains «Смета · Депозит · Работа · Счёт»; the tech —
 * his visits), «Деньги» (tiles, invoices, payments with who took them, advances), «Объекты» (route, gate code with rights, access,
 * people, jobs; the billing address last), «Журнал» (one feed with filters: calls, SMS, notes, tasks, files).
 * Built from src/ui only (GroupedList / ListGroup / GroupRow 56, StatGrid, NowCard, ChoiceChips strip, Steps, Empty, Button).
 * Business rules are only called: money through the engine (clientMoneyOf, contractStatement in nextStep), rights (canSeeGateCode,
 * canSeeClientMoney), statuses (invoiceChip, estView, jobStatusView, leadStatusView), the stores' mutations with «Отменить».
 */
import { useState, type ReactNode } from "react";
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
import { ClientDupCards } from "@/features/client/ClientDuplicates";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { billingLine } from "@/features/clientForm";
import { canSeeGateCode, propertyPeople, propertyTitle } from "@/features/properties";
import { isAssigned, isOpenVisit, visitWhen } from "@/features/schedule";
import { memberName } from "@/features/team";
import { invoiceTitle } from "@/features/invoiceTitle";
import { mailtoHref } from "@/features/contactLinks";
import {
  clientMainStep,
  clientNextStep,
  clientNowOf,
  clientStateOf,
  clientTileKeys,
  clientToBill,
  type ClientNow,
  type ClientState,
  type ClientTile,
} from "@/features/client/nextStep";
import { Button, ChoiceChips, StatusChip, Steps } from "@/ui/controls";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { NowCard } from "@/ui/nowCard";
import { StatGrid, StatTile } from "@/ui/statTile";
import { useToast } from "@/ui/overlays";
import { Empty } from "@/ui/surfaces";

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
export function useAgo() {
  const { t, day } = useI18n();
  return (iso: string) => {
    const d = -dayOffsetOf(isoDayKey(iso));
    if (d <= 0) return t("common.today");
    if (d === 1) return t("proto.client.yesterday");
    if (d < 7) return t("proto.client.daysAgo", { n: d });
    return day(iso);
  };
}

/** «Сегодня 8:30», «Завтра 9:00», «пт, 21 нояб. 10:00» */
function useWhen() {
  const { t, day, time } = useI18n();
  return (iso: string) => {
    const off = dayOffsetOf(isoDayKey(iso));
    const d = off === 0 ? t("common.today") : off === 1 ? t("common.tomorrow") : day(iso);
    return `${d} ${time(iso)}`;
  };
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/* ============================== Обзор ============================== */

export function ClientOverview({ c, f, onSection }: { c: Customer; f: ClientFacts; onSection: (k: "work" | "money" | "places" | "log") => void }) {
  const { t, money, moneyWhole, time } = useI18n();
  const ago = useAgo();
  const when = useWhen();
  const { db, r, office } = f;
  const money$ = canSeeClientMoney(f.role);
  const tiles = clientTileKeys(f.role, f.state, f.toBillCents);
  const nowJobs = r.jobs.filter((j) => j.status !== "done" && !j.cancelledAt);
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
  function dayWord(iso: string) {
    const off = dayOffsetOf(isoDayKey(iso));
    return off === 0 ? t("common.today") : off === 1 ? t("common.tomorrow") : when(iso).split(" ").slice(0, -1).join(" ");
  }

  const nowCard = <ClientNowCard f={f} />;
  return (
    <View style={{ gap: space[4] }} testID="client-overview">
      {f.state === "archived" || f.state === "noService" ? (
        <ListGroup testID="client-plate">
          <GroupRow
            lead={{ icon: f.state === "archived" ? "box" : "alert" }}
            title={f.state === "archived" ? t("proto.client.archivedTitle") : t("proto.client.noServiceTitle")}
            subtitle={f.state === "archived" ? t("proto.client.archivedHint") : [c.statusReason, t("client.noServiceHint")].filter(Boolean).join(" · ")}
          />
        </ListGroup>
      ) : (
        nowCard
      )}
      {tiles.length ? <StatGrid testID="client-tiles">{tiles.map(tile)}</StatGrid> : null}
      {place && (place.accessNotes || place.gateCode) ? (
        <ListGroup testID="client-access">
          <GroupRow
            lead={{ icon: "key" }}
            title={`${t("proto.client.access")} · ${propertyTitle(place)}`}
            subtitle={[place.gateCode ? (gateSeen ? t("proto.client.gateIs", { code: place.gateCode }) : t("proto.client.gateLater")) : null, place.accessNotes].filter(Boolean).join(" · ")}
            onPress={() => onSection("places")}
          />
        </ListGroup>
      ) : null}
      <ClientDupCards c={c} />
      {f.state === "new" && !r.estimates.length ? <Empty icon="wrench" title={t("proto.client.noJobs")} hint={t("proto.client.noJobsHint")} testID="client-new-empty" /> : null}
      <GroupedList testID="client-overview-groups">
        <ListGroup title={t("proto.client.inWork")} testID="client-in-work">
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
        <ListGroup title={t("proto.client.lastTalk")} all={{ label: t("proto.client.allLog"), onPress: () => onSection("log"), testID: "client-log-all" }} testID="client-last-talk">
          {f.talks.slice(0, 2).map((h) => (
            <GroupRow key={h.id} lead={{ icon: h.icon }} title={t(h.title)} subtitle={[ago(h.at), h.detail].filter(Boolean).join(" · ")} />
          ))}
        </ListGroup>
        <ListGroup title={t("proto.client.closed")} testID="client-closed">
          {done ? (
            <GroupRow
              testID={`client-job-${done.id}`}
              lead={{ icon: "wrench" }}
              title={done.title || done.number || t("cc.kind.job")}
              subtitle={[placeName(db, done), t(jobStatusView.done.label)].filter(Boolean).join(" · ")}
              value={office ? money(done.amountCents) : undefined}
              onPress={() => router.push(`/job/${done.id}`)}
            />
          ) : null}
        </ListGroup>
      </GroupedList>
      {/* add-on modules' place (spec 33 П24 А3): nothing unless a module is switched on */}
      <ModulePlaces
        place="client"
        ctx={{
          customerId: c.id,
          leadIds: r.leadIds,
          places: r.properties.map((p) => ({ id: p.id, address: p.address, ...(p.city ? { city: p.city } : {}), leadIds: db.leads.filter((l) => l.propertyId === p.id).map((l) => l.id) })),
        }}
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

/** «Сейчас» in its frame: what is with the client this minute; the whole card opens it */
function ClientNowCard({ f }: { f: ClientFacts }) {
  const { t, money, time, day } = useI18n();
  const ago = useAgo();
  const when = useWhen();
  const { db } = f;
  const n = f.now;
  const tech = (v: { techId: string | null }) => memberName(db, v.techId, t) ?? t("proto.client.noTech");
  if (f.role === "tech" && f.techVisit) {
    const v = f.techVisit;
    const j = findJob(db, v.jobId);
    return (
      <NowCard
        testID="client-now"
        kicker={`${t("proto.client.yourVisit")} · ${when(v.start)}`}
        title={j?.title ?? t("prop.h.visit")}
        sub={[visitWhen(v, time, t("plan5.allDay")), t("proto.client.points", { n: v.checklist.length })].join(" · ")}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  }
  if (!n)
    return f.state === "new" ? null : <NowCard testID="client-now" kicker={t("proto.client.now")} empty={t("proto.client.nowNothing")} />;
  switch (n.kind) {
    case "working":
      return (
        <NowCard
          testID="client-now"
          kicker={t("proto.client.now")}
          status={{ status: "info", label: t("proto.client.going") }}
          title={n.job.title}
          sub={t("proto.client.techSince", { who: tech(n.visit), at: time(n.visit.start) })}
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
          sub={[n.invoice.number, findJob(db, n.invoice.jobId)?.title, money(n.owesCents)].filter(Boolean).join(" · ")}
          onPress={() => router.push(`/invoice/${n.invoice.id}`)}
        />
      );
    case "scheduled":
      return (
        <NowCard
          testID="client-now"
          kicker={t("proto.client.now")}
          status={{ status: "info", label: t(jobStatusView[n.job.status].label) }}
          title={n.job.title}
          sub={t("proto.client.visitBy", { when: when(n.visit.start), who: tech(n.visit) })}
          onPress={() => router.push(`/visit/${n.visit.id}`)}
        />
      );
    case "waiting":
    case "draft":
      return (
        <NowCard
          testID="client-now"
          kicker={t("proto.client.now")}
          status={{ status: estView[n.estimate.status].s, label: t(estView[n.estimate.status].l) }}
          title={n.estimate.title || n.estimate.number || t("cc.kind.estimate")}
          sub={[n.estimate.number, f.office ? money(n.estimate.totalCents) : null, n.estimate.sentAt ? day(n.estimate.sentAt) : null].filter(Boolean).join(" · ")}
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
          onPress={() => router.push(`/lead/${n.lead.id}`)}
        />
      );
  }
}

/* ============================== Работы ============================== */

type WorkFilter = "active" | "all" | "leads";

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

export function ClientWork({ c, f }: { c: Customer; f: ClientFacts }) {
  const { t, money, day } = useI18n();
  const when = useWhen();
  const { db, r, office } = f;
  const [filter, setFilter] = useState<WorkFilter>("active");
  if (f.role === "tech") {
    // the tech: his own visits only (client-card.html §7 «Работы» → «Выезды»)
    return f.visits.length === 0 ? (
      <Empty icon="calendar" title={t("prop.noVisits")} />
    ) : (
      <GroupedList testID="client-visits">
        <ListGroup>
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
  const live = r.jobs.filter((j) => !j.cancelledAt && j.status !== "done");
  const closed = r.jobs.filter((j) => j.status === "done" || j.cancelledAt);
  const loose = r.estimates.filter((e) => !r.jobs.some((j) => j.estimateId === e.id));
  const items = [
    { key: "active" as const, label: `${t("proto.client.active")} ${live.length + loose.length}` },
    { key: "all" as const, label: `${t("proto.client.all")} ${r.jobs.length + loose.length}` },
    { key: "leads" as const, label: `${t("client.row.leads")} ${r.leads.length}` },
  ];
  const project = (j: Job) => {
    const e = r.estimates.find((x) => x.id === j.estimateId);
    const inv = r.invoices.filter((i) => i.jobId === j.id);
    const vis = f.visits.filter((v) => v.jobId === j.id);
    return (
      <ListGroup key={j.id} testID={`client-project-${j.id}`}>
        <GroupRow
          testID={`client-job-${j.id}`}
          lead={{ icon: "wrench" }}
          title={j.title || j.number || t("cc.kind.job")}
          subtitle={[j.number, placeName(db, j)].filter(Boolean).join(" · ")}
          value={office ? money(j.amountCents) : undefined}
          onPress={() => router.push(`/job/${j.id}`)}
        />
        <View style={{ padding: space[4] }} testID={`client-project-steps-${j.id}`}>
          <Steps labels={[t("proto.client.stEstimate"), t("proto.client.stDeposit"), t("proto.client.stJob"), t("proto.client.stInvoice")]} current={projectStep(e, j, r.invoices)} />
        </View>
        {e ? (
          <GroupRow compact testID={`client-estimate-${e.id}`} lead={{ icon: "doc" }} title={`${t("cc.kind.estimate")} · ${t(estView[e.status].l)}`} subtitle={[e.number, e.approvedAt ? day(e.approvedAt) : null].filter(Boolean).join(" · ")} onPress={() => router.push(`/estimate/${e.id}`)} />
        ) : null}
        {vis.map((v) => (
          <GroupRow compact key={v.id} testID={`client-visit-${v.id}`} lead={{ icon: "calendar" }} title={when(v.start)} subtitle={memberName(db, v.techId, t)} onPress={() => router.push(`/visit/${v.id}`)} />
        ))}
        {inv.map((i) => {
          const ic = invoiceChip(i);
          return <GroupRow compact key={i.id} testID={`client-invoice-${i.id}`} lead={{ icon: "invoice" }} title={[i.number, i.title ? invoiceTitle(i, t) : null].filter(Boolean).join(" · ")} value={money(i.totalCents)} status={{ status: ic.s, label: t(ic.l, ic.p) }} onPress={() => router.push(`/invoice/${i.id}`)} />;
        })}
      </ListGroup>
    );
  };
  const estimateRow = (e: Estimate) => (
    <GroupRow key={e.id} testID={`client-estimate-${e.id}`} lead={{ icon: "doc" }} title={e.title || e.number || t("cc.kind.estimate")} subtitle={e.title ? e.number : undefined} value={money(e.totalCents)} status={{ status: estView[e.status].s, label: t(estView[e.status].l) }} onPress={() => router.push(`/estimate/${e.id}`)} />
  );
  const body =
    filter === "leads" ? (
      r.leads.length === 0 ? (
        <Empty icon="inbox" title={t("client.empty.leads")} />
      ) : (
        <ListGroup>
          {r.leads.map((l) => (
            <GroupRow key={l.id} testID={`client-lead-${l.id}`} lead={{ icon: "inbox" }} title={l.service ?? l.name ?? l.number ?? ""} subtitle={[l.number, day(l.receivedAt)].filter(Boolean).join(" · ")} status={{ status: leadStatusView[l.status].status, label: t(leadStatusView[l.status].label) }} onPress={() => router.push(`/lead/${l.id}`)} />
          ))}
        </ListGroup>
      )
    ) : r.jobs.length + loose.length === 0 ? (
      <Empty icon="wrench" title={t("client.empty.jobs")} hint={t("proto.client.noJobsHint")} />
    ) : (
      <>
        {loose.length ? <ListGroup title={t("client.row.estimates")} testID="client-estimates">{loose.map(estimateRow)}</ListGroup> : null}
        {live.map(project)}
        {filter === "all" && closed.length ? (
          <>
            <ListGroup title={t("proto.client.closedMany")} testID="client-closed-jobs">
              {closed.map((j) => (
                <GroupRow key={j.id} testID={`client-job-${j.id}`} lead={{ icon: "wrench" }} title={j.title || j.number || ""} subtitle={[j.number, placeName(db, j)].filter(Boolean).join(" · ")} value={money(j.amountCents)} status={{ status: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) }} onPress={() => router.push(`/job/${j.id}`)} />
              ))}
            </ListGroup>
          </>
        ) : null}
        {filter === "active" && closed.length ? (
          <ListGroup title={t("proto.client.closedMany")}>
            <GroupRow lead={{ icon: "history" }} title={t("proto.client.closedN", { n: closed.length })} onPress={() => setFilter("all")} />
          </ListGroup>
        ) : null}
      </>
    );
  return (
    <View style={{ gap: space[4] }} testID="client-work">
      <ChoiceChips layout="strip" testID="client-work-filter" items={items} value={filter} onChange={setFilter} />
      <GroupedList>{body}</GroupedList>
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
      <StatGrid testID="client-money-tiles">
        <StatTile testID="client-money-debt" label={t("proto.client.tile.debt")} value={moneyWhole(f.m.owesCents)} icon="invoice" warn={f.overdue ? t("card.sign.overdueDays", { d: f.overdue.days }) : undefined} />
        <StatTile testID="client-money-tobill" label={t("proto.client.tile.toBill")} value={moneyWhole(f.toBillCents)} icon="doc" />
        <StatTile testID="client-money-paid" label={t("proto.client.tile.paid")} value={moneyWhole(f.m.paidTotalCents)} icon="wallet" />
        <StatTile testID="client-money-advance" label={t("proto.client.tile.advance")} value={moneyWhole(f.advanceCents)} icon="dollar" />
      </StatGrid>
      <GroupedList>
        <ListGroup title={t("client.invoices")} testID="client-invoices">
          {r.invoices.map((inv) => {
            const ic = invoiceChip(inv);
            return (
              <GroupRow
                key={inv.id}
                testID={`client-invoice-${inv.id}`}
                lead={{ icon: "invoice" }}
                title={[inv.number, (inv.title && invoiceTitle(inv, t)) || null].filter(Boolean).join(" · ") || t("cc.kind.invoice")}
                subtitle={[findJob(db, inv.jobId)?.title, inv.sentAt ? day(inv.sentAt) : null].filter(Boolean).join(" · ")}
                value={money(inv.totalCents)}
                status={{ status: ic.s, label: t(ic.l, ic.p) }}
                onPress={() => router.push(`/invoice/${inv.id}`)}
              />
            );
          })}
        </ListGroup>
        <ListGroup title={t("client.receipts")} testID="client-receipts">
          {[...r.receipts].sort((a, b) => b.at.localeCompare(a.at)).map((p) => (
            <GroupRow
              key={p.id}
              testID={`client-receipt-${p.id}`}
              lead={{ icon: "dollar" }}
              title={[p.receiptNumber ?? t("rcpt.title"), t(`pay.${p.method}` as DictKey)].join(" · ")}
              subtitle={[day(p.at), p.receivedBy ? t("proto.client.takenBy", { who: memberName(db, p.receivedBy, t) ?? "—" }) : null].filter(Boolean).join(" · ")}
              value={money(p.amountCents)}
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

type LogFilter = "all" | "calls" | "sms" | "notes" | "tasks" | "files";

export function ClientLog({ c, f }: { c: Customer; f: ClientFacts }) {
  const store = useStore();
  const { t, money, day } = useI18n();
  const toast = useToast();
  const ago = useAgo();
  const { db, r, office } = f;
  const [filter, setFilter] = useState<LogFilter>("all");
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  const history = clientHistory(db, c.id, f.role);
  const items: { key: LogFilter; label: string }[] = [
    { key: "all", label: t("proto.client.logAll") },
    { key: "calls", label: t("proto.client.logCalls") },
    { key: "sms", label: t("proto.client.logSms") },
    { key: "notes", label: t("client.row.notes") },
    { key: "tasks", label: t("client.row.tasks") },
    { key: "files", label: t("client.row.files") },
  ];
  const feed = history.filter((h) => (filter === "all" ? h.icon !== "note" : filter === "calls" ? h.icon === "phone" : filter === "sms" ? h.icon === "sms" || h.icon === "mail" : false));
  // the feed by day: «СЕГОДНЯ», «18 НОЯБ.»
  const days: [string, HistoryItem[]][] = [];
  for (const h of feed) {
    const k = ago(h.at) === t("common.today") ? t("common.today") : day(h.at);
    const last = days[days.length - 1];
    if (last && last[0] === k) last[1].push(h);
    else days.push([k, [h]]);
  }
  const openT = r.tasks.filter((x) => !x.doneAt);
  const doneT = r.tasks.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const newTask = () => setTaskEdit({ subjectType: "customer", subjectId: c.id, title: "", assigneeId: db.me });
  return (
    <View style={{ gap: space[4] }} testID="client-log">
      <ChoiceChips layout="strip" testID="client-log-filter" items={items} value={filter} onChange={setFilter} />
      {filter === "all" || filter === "notes" ? (
        // «Заметка…» on top, pinned first, a private note is the author's only (NotesBlock: the team / «только мне» with a lock)
        <View testID="client-notes">
          <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={r.leadIds.map((id) => ({ type: "lead" as const, id }))} />
        </View>
      ) : null}
      {filter === "tasks" ? (
        <>
          {office ? <Button testID="client-task-new" label={t("task.new")} icon="plus" variant="secondary" size="sm" onPress={newTask} /> : null}
          {openT.length + doneT.length === 0 ? <Empty icon="check" title={t("client.empty.tasks")} hint={office ? t("client.empty.tasksHint") : undefined} /> : null}
          <GroupedList>
            <ListGroup testID="client-tasks-open">
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
            </ListGroup>
            <ListGroup title={t("client.doneTasks", { n: doneT.length })} testID="client-tasks-done">
              {doneT.map((x) => (
                <GroupRow
                  key={x.id}
                  compact
                  testID={`client-task-done-${x.id}`}
                  lead={{ icon: "check" }}
                  title={x.title}
                  subtitle={t("client.doneOn", { date: day(x.doneAt!) })}
                  actions={[{ icon: "undo", a11y: `${t("client.taskReopen")}: ${x.title}`, testID: `client-task-reopen-${x.id}`, onPress: () => toast.show(t("client.taskReopened"), store.saveTask({ ...x, doneAt: undefined }).undo) }]}
                />
              ))}
            </ListGroup>
          </GroupedList>
        </>
      ) : null}
      {filter === "files" ? (
        r.photos.length + r.files.length === 0 ? (
          <Empty icon="camera" title={t("client.empty.files")} hint={t("client.empty.filesHint")} />
        ) : (
          <ListGroup>
            <GroupRow lead={{ icon: "image" }} title={t("client.photos", { n: r.photos.length + r.files.length })} subtitle={t("client.photosHint")} />
          </ListGroup>
        )
      ) : null}
      {filter === "all" || filter === "calls" || filter === "sms" ? (
        days.length === 0 ? (
          filter === "all" ? null : <Empty icon="clock" title={t("client.empty.history")} hint={t("client.empty.historyHint")} />
        ) : (
          <GroupedList testID="client-feed">
            {days.map(([k, hs]) => (
              <ListGroup key={k} title={k}>
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
        )
      ) : null}
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
        {people.flatMap((p) => [
          <GroupRow
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
      <ListGroup title={t("proto.client.facts")} testID="client-facts">
        {c.number ? <GroupRow compact title={t("proto.client.number")} subtitle={c.number} /> : null}
        {/* not in the model (client-card.html «НЕТ В МОДЕЛИ»): shown marked «(прототип)», the model is not changed */}
        {office ? <GroupRow compact title={t("proto.client.created")} subtitle={t("proto.client.proto")} /> : null}
        {office && c.sourceId ? <GroupRow compact title={t("proto.client.tile.source")} subtitle={sourceName(db, c.sourceId)} /> : null}
        {office ? <GroupRow compact title={t("proto.client.owner")} subtitle={`${memberName(db, db.me, t) ?? "—"} ${t("proto.client.proto")}`} /> : null}
        {office ? <GroupRow compact title={t("proto.client.tax")} subtitle={c.taxExempt ? [t("client.f.taxExempt"), c.taxExemptNote].filter(Boolean).join(" · ") : t("proto.client.taxed")} /> : null}
        {office ? <GroupRow compact title={t("client.row.billing")} subtitle={c.billing ? billingLine(c.billing) : t("client.row.billingSame")} /> : null}
      </ListGroup>
      {statusOf(c) === "do_not_service" ? <StatusChip status="bad" label={t("client.noServiceHint")} /> : null}
    </View>
  );
}

