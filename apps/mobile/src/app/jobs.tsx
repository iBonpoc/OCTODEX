import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Job, JobStatus } from "@/data/types";
import { useI18n } from "@/i18n";
import { jobStatusView } from "@/features/jobs";
import { jobEstimateNumber, jobPeople, matchJob, nextVisitOf, visitPeople } from "@/features/jobList";
import { categoryLabel } from "@/features/serviceCategories";
import { FilterBar, useFilterHeader } from "@/ui/filterBar";
import { useDevice } from "@/theme/ThemeProvider";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { Empty, Screen } from "@/ui/surfaces";
import { openContact } from "@/ui/listCard";
import { mapsUrl, type OS } from "@/ui/listCardLayout";
import { Platform } from "react-native";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { telHref } from "@/features/contactLinks";
import { initialsOf } from "@/features/invoice/moneySummary";
import { memberLabel } from "@/features/team";
import { canSeeJob } from "@/features/access";
import { shortAddress } from "@/features/shortAddress";
import { dayKeyIn } from "@/features/zone";

type Filter = JobStatus | "all" | "cancelled";
/** «пт, 20 нояб.» → «Пт, 20 нояб.»: a day word as a group title */
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** the lane of «Работы» (spec 31 §13): in the order of the work, «Все» last */
const LANE: readonly Filter[] = ["unscheduled", "scheduled", "in_progress", "done", "all", "cancelled"];
/** the «Не назначен» row of «Мастер» */
const NOBODY = "__nobody";

/**
 * All jobs by stage: waiting for a date → scheduled → in progress → done. Lists B (#2992, design/crm review 27.11): each job is a row
 * of one group (rule 12) — initials · the client, «когда · что делаем» (the tech: «когда · адрес»: he drives there) · on the right
 * the sum (the office) or «Позвонить» (the tech never sees amounts, spec 06 §7.6). The status word only where the chip does not
 * already say it («Все», «Отменённые»). The nearest visit first.
 */
export default function Jobs() {
  const { db, role, mode } = useStore();
  const { t, money, day, time } = useI18n();
  // the tech never sees amounts (spec 06 §7.6)
  const office = role !== "tech";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  // the tech: only jobs with a visit of his (#868; jobs_select in the database)
  const work = db.jobs.filter((j) => canSeeJob(db, { role, mode, me: db.me }, j.id));
  // #2015: the cancelled ones are their own lane (db.cancelledJobs), outside «Все»
  const cancelled = (db.cancelledJobs ?? []).filter((j) => canSeeJob(db, { role, mode, me: db.me }, j.id));
  const inLane = (j: Job, x: Filter) => x === "all" || j.status === x;
  const laneJobs = (x: Filter) => (x === "cancelled" ? cancelled : work.filter((j) => inLane(j, x)));
  const count = (x: Filter) => laneJobs(x).length;
  // spec 31 §6 п.7, §13: a chip the person picked is kept on this device and wins; until then «Ждут даты» when there are
  // such jobs (they need an action, S8b), else «Запланированы». The search is not kept.
  const key = filterStoreKey("jobs");
  const [kept, setF] = usePersistentState<Filter | null>(`${key}.status`, null);
  const [whoIds, setWho] = usePersistentState<string[]>(`${key}.people`, []);
  const [tradeIds, setTrades] = usePersistentState<string[]>(`${key}.trades`, []);
  const [q, setQ] = useState("");
  const f: Filter = kept && LANE.includes(kept) ? kept : count("unscheduled") ? "unscheduled" : "scheduled";
  const peopleOf = (j: Job) => jobPeople(db, j).map((m) => m.id);
  const base = laneJobs(f);
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
  const startOf = (j: Job) => nextVisitOf(db, j.id)?.start ?? "\uffff";
  const rows = [...list].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const showStatus = f === "all" || f === "cancelled";
  const row = (j: Job) => {
    const p = db.properties.find((x) => x.id === j.propertyId);
    const c = db.customers.find((x) => x.id === p?.customerId);
    const v = nextVisitOf(db, j.id);
    const st = f === "cancelled" ? { status: "neutral" as const, label: "job.cancel.status" as const } : jobStatusView[j.status];
    // the day is the group's title (layout review 27.11): the row says the hour only
    const when = v && j.status !== "unscheduled" ? time(v.start) : undefined;
    const who = visitPeople(db, v).map((m) => memberLabel(m, t)).filter(Boolean).join(", ") || undefined;
    const tel = telHref(c?.phone);
    const addrFull = p ? [p.address, p.city].filter(Boolean).join(", ") : "";
    return (
      <GroupRow
        key={j.id}
        testID={`job-row-${j.id}`}
        title={c?.name ?? "—"}
        // #3018 (founder #3017): 1 — the client; 2 — the address; 3 — the sum (office) · when · what · who (not «me» to the tech)
        // with «Позвонить · Маршрут» on the right the phone in the name's line pushed the deeds into a 4th line: the call button IS the phone
        subtitle={p ? shortAddress(p.address, p.city) : undefined}
        // line 3 — the sum first, never cut (#2672; the tech never sees it), then when · what · who
        extra={[office ? money(j.amountCents) : undefined, when, j.title, office ? who : undefined].filter(Boolean).join(" · ") || undefined}
        wrap
        lead={{ initials: initialsOf(c?.name) }}
        // read only: a job has no hand moves (statusMoves) — the date comes from scheduling, «done» from the visit's payment
        status={showStatus ? { status: st.status, label: t(st.label) } : undefined}
        // founder #3018: «Давай маршрут. А нельзя сделать несколько кнопок? Позвонить, маршрут» — two icons, call first (the order of
        // contactActions: call, SMS, map), each its 44 zone; only what the job has
        actions={[
          ...(tel ? [{ icon: "phone" as const, a11y: `${t("client.call")} ${c?.name ?? ""}`, onPress: () => openContact({ kind: "call", icon: "phone", url: tel, value: c?.phone ?? "" }), testID: `job-row-call-${j.id}` }] : []),
          ...(addrFull ? [{ icon: "route" as const, a11y: `${t("client.route")}: ${addrFull}`, onPress: () => openContact({ kind: "map", icon: "map", url: mapsUrl(addrFull, Platform.OS as OS), value: addrFull }), testID: `job-row-route-${j.id}` }] : []),
        ]}
        onPress={() => router.push(`/job/${j.id}`)}
      />
    );
  };
  const groups = [
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
  ];
  const { device } = useDevice();
  // #3031: the search is the header's first circle on a phone / tablet (one place on every list); 1280 keeps the field in the row
  const fh = useFilterHeader({ search: { value: q }, groups, testID: "jobs" });
  const filterHead = device === "desktop" ? undefined : fh;
  return (
    <Screen
      headerIcons={filterHead?.icons} title={t("jobs.title")} back={back} help={t("jobs.help")} hintKey="jobs">
      {/* spec 31 (variant Б): the search and «Фильтр» in one row, one lane of statuses; «Мастер», «Направление» in the sheet */}
      <FilterBar<Filter> header={filterHead?.state}
        search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchJobs") }}
        value={f}
        onChange={setF}
        items={LANE.map((k) => ({ key: k, label: k === "all" ? t("cat.all") : k === "cancelled" ? t("job.cancel.lane") : t(jobStatusView[k].label), count: count(k) }))}
        groups={groups}
        onReset={() => { setWho([]); setTrades([]); }}
      />
      {list.length === 0 ? (
        <Empty icon="wrench" title={t("jobs.empty")} />
      ) : (
        <GroupedList testID="jobs-list">
          {[...rows.reduce((m, j) => {
            const v = nextVisitOf(db, j.id);
            const k = v && j.status !== "unscheduled" ? dayKeyIn(v.start) : "";
            return m.set(k, [...(m.get(k) ?? []), j]);
          }, new Map<string, Job[]>())].map(([k, js]) => (
            <ListGroup key={k || "none"} separate title={k ? cap(day(nextVisitOf(db, js[0]!.id)!.start)) : t("task.noDate")} testID={`jobs-day-${k || "none"}`}>
              {js.map(row)}
            </ListGroup>
          ))}
        </GroupedList>
      )}
    </Screen>
  );
}
