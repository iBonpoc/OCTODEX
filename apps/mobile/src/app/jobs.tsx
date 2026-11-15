import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Job, JobStatus } from "@/data/types";
import { useI18n } from "@/i18n";
import { jobStatusView } from "@/features/jobs";
import { jobEstimateNumber, jobPeople, matchJob, nextVisitOf, visitPeople } from "@/features/jobList";
import { categoryLabel } from "@/features/serviceCategories";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { memberLabel } from "@/features/team";
import { canSeeJob } from "@/features/access";

type Filter = JobStatus | "all";
/** the lane of «Работы» (spec 31 §13): in the order of the work, «Все» last */
const LANE: readonly Filter[] = ["unscheduled", "scheduled", "in_progress", "done", "all"];
/** the «Не назначен» row of «Мастер» */
const NOBODY = "__nobody";
/** desktop row columns (docs/specs/06-list-cards.md, «Работы») */
const COLUMNS: FactKey[] = ["addr", "work", "when", "resp"];

/** All jobs by stage: waiting for a date → scheduled → in progress → done. Each job is a list card (spec 06, PR8). */
export default function Jobs() {
  const { db, role, mode } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  // the tech never sees amounts (spec 06 §7.6)
  const office = role !== "tech";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  // the tech: only jobs with a visit of his (#868; jobs_select in the database)
  const work = db.jobs.filter((j) => canSeeJob(db, { role, mode, me: db.me }, j.id));
  const inLane = (j: Job, x: Filter) => x === "all" || j.status === x;
  const count = (x: Filter) => work.filter((j) => inLane(j, x)).length;
  // spec 31 §6 п.7, §13: a chip the person picked is kept on this device and wins; until then «Ждут даты» when there are
  // such jobs (they need an action, S8b), else «Запланированы». The search is not kept.
  const key = filterStoreKey("jobs");
  const [kept, setF] = usePersistentState<Filter | null>(`${key}.status`, null);
  const [whoIds, setWho] = usePersistentState<string[]>(`${key}.people`, []);
  const [tradeIds, setTrades] = usePersistentState<string[]>(`${key}.trades`, []);
  const [q, setQ] = useState("");
  const f: Filter = kept && LANE.includes(kept) ? kept : count("unscheduled") ? "unscheduled" : "scheduled";
  const peopleOf = (j: Job) => jobPeople(db, j).map((m) => m.id);
  const base = work.filter((j) => inLane(j, f));
  // «Мастер»: everyone who is the master of some job, by name, then «Не назначен»; the office's only (a tech sees his own)
  const masters = [...new Map(work.flatMap((j) => jobPeople(db, j)).map((m) => [m.id, m])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const who = whoIds.filter((id) => id === NOBODY || masters.some((m) => m.id === id));
  // «Направление»: only when the jobs have more than one (the trade tag on the card)
  const trades = [...new Set(work.map((j) => j.serviceCategoryId).filter((x): x is string => !!x))];
  const tradeOn = tradeIds.filter((id) => trades.includes(id));
  const passWho = (j: Job) => !who.length || (peopleOf(j).length ? peopleOf(j).some((id) => who.includes(id)) : who.includes(NOBODY));
  const passTrade = (j: Job) => !tradeOn.length || tradeOn.includes(j.serviceCategoryId ?? "");
  const list = base.filter((j) => matchJob(db, j, q) && passWho(j) && passTrade(j));
  const toggle = (ids: string[], set: (v: string[]) => void) => (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const card = (j: Job) => {
    const p = db.properties.find((x) => x.id === j.propertyId);
    const c = db.customers.find((x) => x.id === p?.customerId);
    const v = nextVisitOf(db, j.id);
    const st = jobStatusView[j.status];
    const addr = p ? `${p.address}, ${p.city}` : undefined;
    const trade = categoryLabel(db.serviceCategories.find((x) => x.id === j.serviceCategoryId), t as never);
    return (
      <ListCard
        key={j.id}
        title={c?.name ?? "—"}
        lead={{ kind: "icon", icon: "wrench" }}
        value={office ? money(j.amountCents) : undefined}
        valueLabel={office ? t("card.val.total") : undefined}
        // read only: a job has no hand moves (statusMoves) — the date comes from scheduling, «done» from the visit's payment
        status={{ tone: st.status, label: t(st.label) }}
        trade={trade || undefined}
        facts={{
          phone: c?.phone,
          email: c?.phone ? undefined : c?.email,
          addr,
          work: j.title,
          when: v && j.status !== "unscheduled" ? day(v.start) : undefined,
          resp: visitPeople(db, v).map((m) => memberLabel(m, t)).filter(Boolean).join(", ") || undefined,
          links: jobEstimateNumber(db, j),
        }}
        // contact buttons only open the phone / map / mail: nothing is written
        contact={{ phone: c?.phone, email: c?.email, addr }}
        density={device === "desktop" ? "row" : "rich"}
        columns={COLUMNS}
        onPress={() => router.push(`/job/${j.id}`)}
      />
    );
  };
  return (
    <Screen title={t("jobs.title")} back={back} help={t("jobs.help")} hintKey="jobs">
      {/* spec 31 (variant Б): the search and «Фильтр» in one row, one lane of statuses; «Мастер», «Направление» in the sheet */}
      <FilterBar<Filter>
        search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchJobs") }}
        value={f}
        onChange={setF}
        items={LANE.map((k) => ({ key: k, label: k === "all" ? t("cat.all") : t(jobStatusView[k].label), count: count(k) }))}
        groups={[
          ...(office && masters.length > 1
            ? [{
                key: "people",
                title: t("card.filter.masters"),
                options: [
                  ...masters.map((m) => ({ key: m.id, label: memberLabel(m, t) ?? m.name, count: base.filter((j) => peopleOf(j).includes(m.id)).length, on: who.includes(m.id) })),
                  { key: NOBODY, label: t("card.filter.nobody"), count: base.filter((j) => !peopleOf(j).length).length, on: who.includes(NOBODY) },
                ],
                onToggle: toggle(who, setWho),
              }]
            : []),
          ...(office && trades.length > 1
            ? [{
                key: "trades",
                title: t("card.filter.trades"),
                options: trades.map((id) => ({ key: id, label: categoryLabel(db.serviceCategories.find((x) => x.id === id), t as never) || "—", count: base.filter((j) => j.serviceCategoryId === id).length, on: tradeOn.includes(id) })),
                onToggle: toggle(tradeOn, setTrades),
              }]
            : []),
        ]}
        onReset={() => { setWho([]); setTrades([]); }}
      />
      {list.length === 0 ? (
        <Empty icon="wrench" title={t("jobs.empty")} />
      ) : device === "tablet" ? (
        <CardGrid>{list.map(card)}</CardGrid>
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={COLUMNS} value={office ? t("card.val.total") : undefined} /> : null}
          <CardList>{list.map(card)}</CardList>
        </>
      )}
    </Screen>
  );
}
