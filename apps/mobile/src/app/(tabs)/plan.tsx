import { findJob } from "@/data/jobs";
import { lateAfterOf } from "@/features/scheduleSettings";
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { addDays, addMonths, isoDayKey, monthGrid, todayKey, weekDays, type DayKey } from "@/features/calendar";
import { formatDayKey } from "@/features/zone";
import { VisitCard, sortByStart, visitStatus } from "@/features/visits";
import { overlapSigns } from "@/features/listSigns";
import { AssignSheet } from "@/features/sheets";
import { DndProvider, Draggable, DropZone, useDragFrom } from "@/features/dnd";
import { useToast } from "@/ui/overlays";
import { Avatar, Button, ChoiceChips, IconButton, Segmented, StatusChip } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, CardList, Empty, Grid, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { assigneesOf, canPlan, canReschedule, isAssigned, planFilter, type PlanWho } from "@/features/schedule";
import { FeedView, PlanAddSheet, PlanWhoChips, UnassignedSoon, WaitingJobs } from "@/features/PlanParts";
import { daysFrom, planItems } from "@/features/planFeed";
import { EventSheet, type EventSheetState } from "@/features/EventForm";

/** the Feed shows a week from the picked day; the arrows move it by a week */
const FEED_DAYS = 7;

type Mode = "feed" | "day" | "week" | "month";

/**
 * Plan: Feed (wave 5, 13 §3.2: everything by days — visits, tasks with a time, events, days off), Day (by person, drag & drop between people), Week (7 days, each visit a card), Month (calendar with
 * visit counts; tap a day → Day). Arrows move by day / week / month; "Today" jumps back.
 */
export default function Plan() {
  const { t, dayOf, lang } = useI18n();
  const { db, role } = useStore();
  const [mode, setMode] = usePersistentState<Mode>("octo.planMode.v1", "day");
  const [date, setDate] = useState<DayKey>(todayKey());
  const planner = canPlan([role]);
  // «Чей план» (§7.2 п. 3): the office picks a person; a tech sees only his own
  const [who, setWho] = usePersistentState<PlanWho>("octo.planWho.v1", "all");
  const whoNow: PlanWho = planner && (who === "all" || who === "me" || db.members.some((m) => m.id === who)) ? who : "all";
  const [adding, setAdding] = useState(false);
  const [ev, setEv] = useState<EventSheetState>(null);
  const mine = (v: Visit) => (role === "tech" ? isAssigned(v, db.me) : planFilter(v, whoNow, db.me));
  const visitsOn = (k: DayKey) => db.visits.filter((v) => isoDayKey(v.start) === k && mine(v)).sort(sortByStart);
  const step = (n: number) => setDate(mode === "feed" ? addDays(date, FEED_DAYS * n) : mode === "day" ? addDays(date, n) : mode === "week" ? addDays(date, 7 * n) : addMonths(date, n));
  const week = weekDays(date);
  // days of «План» are the company's calendar days (П4b): labels of day keys, no zone of their own
  const monthName = formatDayKey(date, { month: "long", year: "numeric" }, lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU");
  const feedDays = useMemo(() => daysFrom(date, addDays(date, FEED_DAYS - 1)), [date]);
  const [showDone, setShowDone] = usePersistentState<boolean>("octo.planShowDone.v1", false);
  const feedItems = useMemo(
    () => (mode === "feed" ? planItems(db, { from: feedDays[0]!, to: feedDays[FEED_DAYS - 1]! }, whoNow, role, { showDone }) : []),
    [mode, db.visits, db.tasks, db.calendarEvents, db.me, feedDays, whoNow, role, showDone],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const label = mode === "feed" ? t("plan5.days", { from: dayOf(feedDays[0]!), to: dayOf(feedDays[FEED_DAYS - 1]!) }) : mode === "day" ? dayOf(date) : mode === "week" ? `${dayOf(week[0]!)} – ${dayOf(week[6]!)}` : monthName;

  return (
    <Screen
      title={t("plan.title")}
      help={t("help.plan")}
      hintKey="plan"
      fab="plan"
      fabOn={planner ? { planAdd: () => setAdding(true) } : undefined}
      right={
        <RowView>
        <Segmented
          value={mode}
          onChange={setMode}
          items={[
            { key: "feed", label: t("plan5.feed") },
            { key: "day", label: t("plan.day") },
            { key: "week", label: t("plan.week") },
            { key: "month", label: t("plan.month") },
          ]}
        />
        </RowView>
      }
    >
      {planner ? <PlanWhoChips who={whoNow} onChange={setWho} /> : null}
      {planner ? <WaitingJobs /> : null}
      {/* «Не назначено» today and tomorrow on top (13 §3.2); the Day keeps its own block of its day (drag from it) */}
      {planner && mode !== "day" ? <UnassignedSoon /> : null}
      <RowView style={{ justifyContent: "space-between" }}>
        <IconButton icon="chevronLeft" label={t("plan.prev")} onPress={() => step(-1)} />
        <T v="heading" style={{ flex: 1, textAlign: "center" }} numberOfLines={1}>
          {label}
        </T>
        {date !== todayKey() ? <Button label={t("common.today")} size="sm" variant="secondary" onPress={() => setDate(todayKey())} /> : null}
        <IconButton icon="chevronRight" label={t("plan.next")} onPress={() => step(1)} />
      </RowView>

      {mode === "feed" ? (
        <>
          {/* chips, not a switch: a switch that is on is yellow, and the screen keeps one yellow (rule 2) */}
          <ChoiceChips
            value={showDone ? "show" : "hide"}
            onChange={(k) => setShowDone(k === "show")}
            items={[
              { key: "hide", label: t("plan5.hideDone") },
              { key: "show", label: t("plan5.showDone") },
            ]}
          />
          <FeedView days={feedDays} items={feedItems} onEvent={planner ? (e) => setEv({ kind: e.kind, event: e }) : undefined} />
        </>
      ) : mode === "day" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            <ChoiceChips
              value={date}
              onChange={setDate}
              nowrap
              items={week.map((k) => {
                const n = visitsOn(k).length;
                const name = k === todayKey() ? t("common.today") : dayOf(k);
                return { key: k, label: n ? `${name} · ${n}` : name };
              })}
            />
          </ScrollView>
          <DayView date={date} visits={visitsOn(date)} who={whoNow} onAdd={planner ? () => setAdding(true) : undefined} />
        </>
      ) : mode === "week" ? (
        <WeekView days={week} visitsOn={visitsOn} openDay={(k) => { setDate(k); setMode("day"); }} />
      ) : (
        <MonthView date={date} visitsOn={visitsOn} openDay={(k) => { setDate(k); setMode("day"); }} />
      )}
      {planner ? <PlanAddSheet visible={adding} onClose={() => setAdding(false)} onEvent={(kind) => setEv({ kind })} /> : null}
      {planner ? <EventSheet state={ev} onClose={() => setEv(null)} /> : null}
    </Screen>
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
    const m = db.members.find((x) => x.id === to);
    const list = [...assigneesOf(v).filter((x) => x !== from && x !== to), to];
    toast.show(online ? t("toast.assigned", { name: m?.name ?? "" }) : t("offline.queued"), assignVisit(v.id, from === "none" ? [to] : list));
  };
  const drag = (v: Visit, card: ReactNode, from: string = v.techId ?? "none") =>
    canAssign && canReschedule(v) ? (
      <Draggable key={`${v.id}:${from}`} id={`${v.id}:${from}`} from={from} onDrop={(z) => drop(v, from, z)}>
        {card}
      </Draggable>
    ) : (
      <View key={v.id}>{card}</View>
    );
  const unassigned = visits.filter((v) => !v.techId);
  const only = role === "tech" || who === "me" ? db.me : who === "all" ? null : who;
  const people = db.members.filter((m) => m.roles.includes("tech") && !m.pending && (!only || m.id === only));
  return (
    <DndProvider key={date}>
      {visits.length === 0 ? (
        <Empty icon="calendar" title={t("plan.empty")} action={onAdd ? <Button label={t("plan.emptyBook")} icon="plus" variant="secondary" onPress={onAdd} /> : undefined} />
      ) : null}
      {canAssign && unassigned.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <T v="heading" tone="warn">
            {t("plan.unassigned")} · {unassigned.length}
          </T>
          <Grid>
            {unassigned.map((v) => (
              <View key={v.id} style={{ gap: space[2] }}>
                {drag(v, <VisitCard v={v} />, "none")}
                <Button label={t("plan.assign")} icon="user" onPress={() => setAssign(v.id)} />
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

/** 7 days; each visit is a card (time · client · tech); tap the day title to open the Day view. */
function WeekView({ days, visitsOn, openDay }: { days: DayKey[]; visitsOn: (k: DayKey) => Visit[]; openDay: (k: DayKey) => void }) {
  const { t, dayOf, time } = useI18n();
  const { db } = useStore();
  return (
    <Grid>
      {days.map((k) => {
        const vs = visitsOn(k);
        const today = k === todayKey();
        return (
          <View key={k} style={{ gap: space[2] }}>
            <SectionTitle
              title={`${today ? `${t("common.today")} · ` : ""}${dayOf(k)}`}
              right={<Button label={vs.length ? t("plan.visits", { n: vs.length }) : t("plan.free")} size="sm" variant="ghost" onPress={() => openDay(k)} />}
            />
            {vs.length ? (
              <CardList>
                {vs.map((v) => {
                  const job = findJob(db, v.jobId);
                  const p = db.properties.find((x) => x.id === job?.propertyId);
                  const c = db.customers.find((x) => x.id === p?.customerId);
                  const tech = db.members.find((m) => m.id === v.techId);
                  const st = visitStatus(v, Date.now(), lateAfterOf(db));
                  return (
                    <ItemCard
                      key={v.id}
                      status={tech ? st.status : "warn"}
                      title={`${time(v.start)} · ${c?.name ?? "—"}`}
                      subtitle={[job?.title, tech?.name ?? t("plan.unassigned")].filter(Boolean).join(" · ")}
                      right={<RowView>{overlapSigns(db, v).map((s) => <StatusChip key={s.key} status={s.tone} label={t(s.key, s.params)} />)}<StatusChip status={tech ? st.status : "warn"} label={tech ? t(st.label) : t("st.unassigned")} /></RowView>}
                      onPress={() => router.push(`/visit/${v.id}`)}
                    />
                  );
                })}
              </CardList>
            ) : null}
          </View>
        );
      })}
    </Grid>
  );
}

/** Month calendar: weekday header, 6 weeks × 7 days, number of visits per day; unassigned visits mark the day. */
function MonthView({ date, visitsOn, openDay }: { date: DayKey; visitsOn: (k: DayKey) => Visit[]; openDay: (k: DayKey) => void }) {
  const { lang } = useI18n();
  const { c } = useTheme();
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
          {row.map((x) => {
            const vs = visitsOn(x.key);
            const unassigned = vs.some((v) => !v.techId);
            const today = x.key === todayKey();
            const selected = x.key === date;
            return (
              <Press
                key={x.key}
                onPress={() => openDay(x.key)}
                visibleHeight={component.rowCompact}
                accessibilityRole="button"
                accessibilityLabel={`${x.key}: ${vs.length}`}
                containerStyle={{ flex: 1, minWidth: 0 }}
                style={{
                  minHeight: component.rowCompact + space[4],
                  borderRadius: component.checkbox.radius,
                  borderWidth: selected ? component.selectedBorder : component.hairline,
                  borderColor: selected ? c.acc : c.bd,
                  backgroundColor: today ? c.surf2 : c.in,
                  opacity: x.inMonth ? 1 : component.dimOpacity,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: space[1],
                }}
              >
                <T v="caption" w={today ? "bold" : "regular"} tabular>
                  {Number(x.key.slice(8))}
                </T>
                {vs.length ? <StatusChip status={unassigned ? "warn" : "info"} label={String(vs.length)} soft /> : null}
              </Press>
            );
          })}
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
