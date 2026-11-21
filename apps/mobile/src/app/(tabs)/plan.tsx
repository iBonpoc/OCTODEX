import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useDevice } from "@/theme/ThemeProvider";
import type { Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { usePlanShowDone } from "@/features/prefs";
import { isoDayKey, monthGrid, todayKey, weekDays, type DayKey } from "@/features/calendar";
import { formatDayKey } from "@/features/zone";
import { VisitCard, sortByStart } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { DndProvider, Draggable, DropZone, useDragFrom } from "@/features/dnd";
import { useToast } from "@/ui/overlays";
import { Avatar, Button, Segmented } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Grid, RowView } from "@/ui/surfaces";
import { canPlan, canReschedule, hiddenAssignees, isAssigned, liveAssignees, moveAssignee, planFilter, unassignedSoon, waitingJobs, type PlanWho } from "@/features/schedule";
import { memberName } from "@/features/team";
import { DayCell, MoveVisitSheet, PlanAddSheet, UnassignedSheet, WaitingSheet, WeekList, planRows, stripDays, type RowHandlers } from "@/features/PlanParts";
import { FilterBar, useFilterHeader } from "@/ui/filterBar";
import type { FilterGroup } from "@/ui/filterBarRules";
import { dayLoads, matchPlanItem, matchVisit, planItems, type DayLoad } from "@/features/planFeed";
import { EventSheet, type EventSheetState } from "@/features/EventForm";
import { StatusNote } from "@/ui/statusNote";
import { CalendarScreen, type IconAction } from "@/ui/templates";

type Mode = "day" | "week" | "month";

/**
 * «План» on the template «Календарь» (LAYOUT-RULES §3, BUILD-SPEC §2.2, wave 3 Э2; founder 21.11): the header «План» with the
 * search and «Фильтры» as icons and «＋» as the header's menu (one filled accent on the screen — the picked day); the views
 * «День · Неделя · Месяц»; the strip of days (the month, «Сегодня», a dot = something in the day); then «Не назначено · N»,
 * the day's rows by time (the hour on the left; the swipe «Открыть» / «Перенести · Назначить»), «Без даты · N».
 * Week — the seven days, a group per day; Month — 6 × 7 cells, a cell → the Day. 820 / 1280: the Day is the board by person.
 */
export default function Plan() {
  const { t, dayOf } = useI18n();
  const { db, role } = useStore();
  const { wide, device } = useDevice();
  const [kept, setMode] = usePersistentState<Mode | "feed">("octo.planMode.v1", "day");
  // «Лента» is gone (BUILD-SPEC §2.2: День · Неделя · Месяц): a kept «feed» opens as the Week
  const mode: Mode = kept === "feed" ? "week" : kept;
  const [date, setDate] = useState<DayKey>(todayKey());
  const planner = canPlan([role]);
  // «Чей план» (§7.2 п. 3): the office picks a person; a tech sees only his own
  const [who, setWho] = usePersistentState<PlanWho>("octo.planWho.v1", "all");
  // a person no longer at work (switched off or deleted, S22) is not a choice any more: back to «Все»
  const whoNow: PlanWho = planner && (who === "all" || who === "me" || db.members.some((m) => m.id === who && !m.pending)) ? who : "all";
  const [adding, setAdding] = useState(false);
  const [ev, setEv] = useState<EventSheetState>(null);
  const [sheet, setSheet] = useState<"unassigned" | "undated" | null>(null);
  const [assign, setAssign] = useState<string | null>(null);
  const [move, setMove] = useState<string | null>(null);
  // the search (client, address, work; a task or an event by its title) — not kept, like every list's (spec 31 §6 п.7)
  const [q, setQ] = useState("");
  const mine = (v: Visit) => (role === "tech" ? isAssigned(v, db.me) : planFilter(v, whoNow, db.me));
  const visitsOn = (k: DayKey) => db.visits.filter((v) => isoDayKey(v.start) === k && mine(v) && matchVisit(db, v, q)).sort(sortByStart);
  const week = weekDays(date);
  // wave 7б-1: a personal setting, the same on every device and in «Мои настройки → План»
  const [showDone, setShowDone] = usePlanShowDone();
  // spec 31: «Мастер» — one at a time; «Выполненные» (Week, Month — the Day shows the day's whole run)
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending && m.id !== db.me).sort((a, b) => a.name.localeCompare(b.name));
  const meTech = db.members.some((m) => m.id === db.me && m.roles.includes("tech"));
  const filterGroups: FilterGroup[] = [
    ...(planner
      ? [{
          key: "people",
          title: t("card.filter.masters"),
          searchable: true,
          single: true,
          options: [
            ...(meTech ? [{ key: "me", label: t("plan.who.me"), on: whoNow === "me" }] : []),
            ...techs.map((m) => ({ key: m.id, label: m.name, on: whoNow === m.id })),
          ],
          onToggle: (k: string) => setWho(whoNow === k ? "all" : k),
        }]
      : []),
    ...(mode !== "day" ? [{ key: "done", title: t("card.filter.show"), options: [{ key: "done", label: t("card.filter.done"), on: showDone }], onToggle: () => setShowDone(!showDone) }] : []),
  ];
  const reset = () => { setWho("all"); setShowDone(false); };
  // the strip: four weeks around the day (Day, Month), the seven days of the week (Week)
  const strip = useMemo(() => (mode === "week" ? week : stripDays(date)), [date, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const range: DayKey[] = mode === "month" ? [...new Set([...monthGrid(date).map((x) => x.key), ...strip])].sort() : strip;
  const from = range[0];
  const to = range[range.length - 1];
  const items = useMemo(
    () => (from && to ? planItems(db, { from, to }, whoNow, role, { showDone: showDone || mode === "day" }).filter((it) => matchPlanItem(db, it, q)) : []),
    [from, to, db.visits, db.tasks, db.calendarEvents, db.me, whoNow, role, showDone, q, mode],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  // a day off is the day's only when one person's plan is shown (a tech's own, or a person picked)
  const loads = useMemo(() => dayLoads(items, db.members, role === "tech" || whoNow !== "all"), [items, db.members, role, whoNow]);
  const [addDay, setAddDay] = useState<DayKey | undefined>(undefined);
  const addOn = (k: DayKey) => { setAddDay(k); setAdding(true); };
  const h: RowHandlers = planner ? { onEvent: (e) => setEv({ kind: e.kind, event: e }), onAssign: setAssign, onMove: setMove } : {};
  const desktop = device === "desktop";
  // phone and tablet: the search and «Фильтры» are icons of the header (FilterBar «значки в шапке», founder 21.11: no row of
  // circles of its own); 1280: FilterBar's one row (the search panel and a button per group)
  const fh = useFilterHeader({ search: { value: q }, groups: filterGroups, searchA11y: t("proto.plan.searchA11y"), testID: "plan" });
  const icons: IconAction[] = desktop ? [] : fh.icons;
  // the 820 / 1280 board by person has its own «Не назначено» on top (one thing once, П7)
  const soon = planner && !(mode === "day" && wide) ? unassignedSoon(db).length : 0;
  const waiting = planner ? waitingJobs(db).length : 0;
  const dayItems = planRows(items, date, h);
  const today = todayKey();
  // Week, Month and the 820 / 1280 board by person are not the day's rows: they stand where the template draws its body
  const other: ReactNode =
    mode === "week" ? (
      <WeekList days={week} items={items} h={h} onDay={(k) => { setDate(k); setMode("day"); }} />
    ) : mode === "month" ? (
      <MonthView date={date} loads={loads} openDay={(k) => { setDate(k); setMode("day"); }} />
    ) : wide ? (
      <DayView date={date} visits={visitsOn(date)} who={whoNow} onAdd={planner ? () => addOn(date) : undefined} />
    ) : null;
  const empty = (
    <Empty
      icon="calendar"
      title={date === today ? t("plan5.freeToday") : t("plan.empty")}
      action={planner ? <Button label={t("proto.plan.emptyAdd")} icon="plus" variant="secondary" size="sm" onPress={() => addOn(date)} /> : undefined}
    />
  );

  return (
    <>
      <CalendarScreen
        testID="plan"
        title={t("plan.title")}
        headerIcons={icons}
        create={planner ? {
          a11y: t("proto.plan.create"),
          items: [
            { key: "visit", label: t("proto.plan.add.visit"), icon: "calendar" },
            { key: "event", label: t("proto.plan.add.event"), icon: "clock" },
            { key: "time_off", label: t("proto.plan.add.timeOff"), icon: "user" },
          ],
        } : undefined}
        onCreate={(k) => (k === "visit" ? addOn(date) : setEv({ kind: k === "event" ? "event" : "time_off", day: date }))}
        views={
          <Segmented
            value={mode}
            onChange={setMode}
            testID="plan-mode"
            full
            items={[
              { key: "day", label: t("plan.day") },
              { key: "week", label: t("plan.week") },
              { key: "month", label: t("plan.month") },
            ]}
          />
        }
        view={mode}
        filters={
          <FilterBar<string>
            items={[]}
            value=""
            onChange={() => undefined}
            search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchPlan") }}
            groups={filterGroups}
            onReset={reset}
            header={desktop ? undefined : fh.state}
          />
        }
        days={strip}
        day={date}
        onDay={setDate}
        loads={loads}
        dayTitle={date === today ? `${t("common.today")} · ${dayOf(date)}` : dayOf(date)}
        unassigned={soon ? { label: t("proto.plan.unassigned", { n: soon }), onPress: () => setSheet("unassigned") } : undefined}
        items={dayItems}
        empty={empty}
        body={other}
        undated={waiting ? { label: t("proto.plan.undated", { n: waiting }), onPress: () => setSheet("undated") } : undefined}
      />
      {planner ? (
        <>
          <PlanAddSheet visible={adding} day={addDay} onClose={() => { setAdding(false); setAddDay(undefined); }} />
          <EventSheet state={ev} onClose={() => setEv(null)} />
          <UnassignedSheet visible={sheet === "unassigned"} onClose={() => setSheet(null)} />
          <WaitingSheet visible={sheet === "undated"} onClose={() => setSheet(null)} />
          <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
          <MoveVisitSheet visit={db.visits.find((v) => v.id === move)} onClose={() => setMove(null)} />
        </>
      ) : null}
    </>
  );
}

/** One day by person; unassigned first; drag a card onto another person to reassign. */
function DayView({ date, visits, who, onAdd }: { date: DayKey; visits: Visit[]; who: PlanWho; onAdd?: () => void }) {
  const { t } = useI18n();
  const { db, role, assignVisit, online } = useStore();
  const toast = useToast();
  const [assign, setAssign] = useState<string | null>(null);
  const canAssign = canPlan([role]);
  // a card dragged from one person's column onto another: that person is replaced, the others stay (wave П3a)
  const drop = (v: Visit, from: string, to: string) => {
    if (from === to) return;
    // the others stay — but only people at work: a switched-off or deleted person left on the list makes the server refuse (S22)
    const gone = hiddenAssignees(v, db.members).map((id) => memberName(db, id, t) ?? "").filter(Boolean);
    const said = online ? t("toast.assigned", { name: memberName(db, to, t) ?? "" }) : t("offline.queued");
    toast.show(gone.length ? `${said} · ${t("acct.takenOff", { names: gone.join(", ") })}` : said, assignVisit(v.id, moveAssignee(v, from, to, db.members)));
  };
  const drag = (v: Visit, card: ReactNode, from: string = v.techId ?? "none") =>
    canAssign && canReschedule(v) ? (
      <Draggable key={`${v.id}:${from}`} id={`${v.id}:${from}`} from={from} onDrop={(z) => drop(v, from, z)}>
        {card}
      </Draggable>
    ) : (
      <View key={v.id}>{card}</View>
    );
  // nobody who can come — nobody at all, or only a deleted account (S22): otherwise the visit fell out of every column
  const unassigned = visits.filter((v) => !liveAssignees(v, db.members).length);
  const only = role === "tech" || who === "me" ? db.me : who === "all" ? null : who;
  const people = db.members.filter((m) => m.roles.includes("tech") && !m.pending && (!only || m.id === only));
  return (
    <DndProvider key={date}>
      {visits.length === 0 ? (
        <Empty icon="calendar" title={t("plan.empty")} action={onAdd ? <Button label={t("plan.emptyBook")} icon="plus" variant="secondary" onPress={onAdd} /> : undefined} />
      ) : null}
      {canAssign && unassigned.length > 0 ? (
        <View style={{ gap: space[2] }} testID="plan-unassigned">
          <StatusNote tone="warn" v="heading">
            {t("plan.unassigned")} · {unassigned.length}
          </StatusNote>
          <Grid>
            {unassigned.map((v) => (
              <View key={v.id} style={{ gap: space[2] }}>
                {drag(v, <VisitCard v={v} />, "none")}
                {/* secondary: the one yellow on the Day is «＋» (rule 2; two visits nobody is on gave two yellows) */}
                <Button label={t("plan.assign")} icon="user" variant="secondary" onPress={() => setAssign(v.id)} />
              </View>
            ))}
          </Grid>
        </View>
      ) : null}
      <RaisedGrid ids={people.map((m) => m.id)}>
        {people.map((m) => {
          const vs = visits.filter((v) => isAssigned(v, m.id));
          return (
            <DropZone key={m.id} id={m.id} style={{ gap: space[2] }}>
              <RowView>
                <Avatar initials={m.initials} s={component.avatar.sm} sub={m.kind === "sub"} />
                <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
                  {m.name}
                </T>
                <T v="caption" tone="mut">
                  {vs.length ? t("plan.visits", { n: vs.length }) : t("plan.free")}
                </T>
              </RowView>
              {vs.length === 0 ? (
                <Card inner>
                  <T v="caption" tone="mut">
                    {t("plan.free")}
                  </T>
                </Card>
              ) : (
                vs.map((v) => drag(v, <VisitCard v={v} />, m.id))
              )}
            </DropZone>
          );
        })}
      </RaisedGrid>
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </DndProvider>
  );
}

/** Month calendar: weekday header, 6 weeks × 7 days; each day is the same cell as the Week strip (24 §B). */
function MonthView({ date, loads, openDay }: { date: DayKey; loads: Map<DayKey, DayLoad>; openDay: (k: DayKey) => void }) {
  const { lang } = useI18n();
  const cells = monthGrid(date);
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: space[1] }}>
        {weeks[0]!.map((x) => (
          <T key={x.key} v="micro" tone="mut" center style={{ flex: 1 }}>
            {formatDayKey(x.key, { weekday: "short" }, loc)}
          </T>
        ))}
      </View>
      {weeks.map((row) => (
        <View key={row[0]!.key} style={{ flexDirection: "row", gap: space[1] }}>
          {row.map((x) => (
            <DayCell key={x.key} day={x.key} load={loads.get(x.key)} selected={x.key === date} dim={!x.inMonth} onPress={() => openDay(x.key)} />
          ))}
        </View>
      ))}
    </Card>
  );
}

/** Grid that lifts the column a card is dragged from above its neighbours. */
function RaisedGrid({ ids, children }: { ids: string[]; children: ReactNode[] }) {
  const from = useDragFrom();
  const i = from ? ids.indexOf(from) : -1;
  return <Grid raise={i >= 0 ? i : undefined}>{children}</Grid>;
}
