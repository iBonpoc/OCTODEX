import { useState } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { visitDueCents } from "@/features/visitDue";
import { View } from "react-native";
import { router } from "expo-router";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID, Task, Visit } from "@/data/types";
import { findJob } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { todayKey, type DayKey } from "@/features/calendar";
import { lateAfterOf, scheduleSettingsOf } from "@/features/scheduleSettings";
import { visitStatus } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { collapseEmpty, groupByDay, itemTimes, timeLead, type DayLoad, type PlanItem } from "@/features/planFeed";
import { overlapSigns } from "@/features/listSigns";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { assigneesOf, canPlan, canReschedule, daysSince, liveAssignees, unassignedSoon, visitWho, waitingJobs } from "@/features/schedule";
import { jobStatusView } from "@/features/jobs";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, ChoiceChips, IconButton, TextField } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Divider, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { ListCard, type CardLead } from "@/ui/listCard";
import type { Density, FactKey } from "@/ui/listCardLayout";
import { SwipeRow } from "@/ui/swipeRow";
/** the day strip moved to src/ui (BUILD-PLAN §1, поток В); re-exported so plan.tsx keeps its imports until wave 3 */
export { DayCell, DayStrip, WeekStrip, stripDays } from "@/ui/dayStrip";
import { NO_UNDO } from "@/data/undo";
import { StatusNote } from "@/ui/statusNote";

/** desktop row columns of the Plan's cards (06 §5 «Визиты»: адрес · работа · кто) */
const PLAN_COLUMNS: readonly FactKey[] = ["addr", "work", "by"];

/**
 * Parts of the Plan tab for the office (docs/specs/03 §7.2, wave П3b): «Ждут даты», «Чей план», «+».
 * Only for those who plan (canPlan): a tech and sales never see them.
 */

/** «Ждут даты · N» (S8b / S9a on the screen): jobs without a date, the oldest first → «Запланировать» */
export function WaitingJobs() {
  const { db } = useStore();
  const { t, money } = useI18n();
  const density = usePlanDensity();
  const [all, setAll] = useState(false);
  const list = waitingJobs(db);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 2);
  return (
    <View style={{ gap: space[2] }}>
      <StatusNote tone="warn" v="heading">
        {t("plan.waiting", { n: list.length })}
      </StatusNote>
      <CardList>
        {shown.map(({ job, since }) => {
          const property = db.properties.find((p) => p.id === job.propertyId);
          const customer = db.customers.find((c) => c.id === property?.customerId);
          const d = daysSince(since);
          const ago = d === null ? undefined : d === 0 ? t("plan.signedToday") : t("plan.signedAgo", { n: d });
          return (
            <ListCard
              key={job.id}
              title={customer?.name ?? job.title}
              when={ago}
              lead={{ kind: "icon", icon: "calendar" }}
              // only the planner sees this block (plan.tsx): the sum of the job is the office's (06 §7.6)
              value={job.amountCents > 0 ? money(job.amountCents) : undefined}
              valueLabel={job.amountCents > 0 ? t("card.val.total") : undefined}
              status={{ tone: jobStatusView[job.status].status, label: t(jobStatusView[job.status].label) }}
              facts={{ num: job.number, addr: property?.address, work: job.title }}
              action={{ label: t("plan.schedule"), icon: "calendar", onPress: () => router.push(`/job/schedule?jobId=${job.id}`) }}
              density={density}
              columns={PLAN_COLUMNS}
              onPress={() => router.push(`/job/${job.id}`)}
            />
          );
        })}
      </CardList>
      {list.length > 2 && !all ? <Button label={t("plan.showAll")} variant="ghost" size="sm" onPress={() => setAll(true)} /> : null}
    </View>
  );
}

/** «+»: what to put in the plan — an inspection at a property (the visit form) or a job from «Ждут даты» */
export function PlanAddSheet({ visible, onClose, onEvent, day: onDay }: { visible: boolean; onClose: () => void; onEvent?: (kind: CalendarEventKind) => void; day?: DayKey }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [propertyId, setPropertyId] = useState<ID | null>(null);
  const propHeld = useHeldSheet(propertyId); // the sheet goes out before it is unmounted (#1163)
  const pid = propHeld.value;
  const waiting = waitingJobs(db);
  const needle = q.trim().toLowerCase();
  const properties = db.properties
    .map((p) => ({ p, c: db.customers.find((c) => c.id === p.customerId) }))
    .filter(({ p, c }) => !needle || `${c?.name ?? ""} ${p.address} ${p.city}`.toLowerCase().includes(needle))
    .slice(0, 8);
  const close = () => { setQ(""); onClose(); };
  return (
    <>
      <Sheet visible={visible && !propertyId} onClose={close} title={t("plan.addTitle")}>
        <View style={{ gap: space[3] }}>
          {onEvent ? (
            // wave 5: an event or a day off (the «＋» of the Plan will have them too — the shell's FAB set)
            <View>
              <ListRow title={t("plan5.addEvent")} onPress={() => { close(); onEvent("event"); }} />
              <Divider />
              <ListRow title={t("plan5.addTimeOff")} onPress={() => { close(); onEvent("time_off"); }} />
            </View>
          ) : null}
          {waiting.length ? (
            <View>
              <T v="heading">{t("plan.addJob")}</T>
              {waiting.map(({ job }, i) => (
                <View key={job.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow title={job.title} subtitle={db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId)?.name} onPress={() => { close(); router.push(`/job/schedule?jobId=${job.id}${onDay ? `&day=${onDay}` : ""}`); }} />
                </View>
              ))}
            </View>
          ) : null}
          <T v="heading">{t("plan.addInspection")}</T>
          <TextField type="search" value={q} onChangeText={setQ} placeholder={t("plan.search")} icon="search" />
          <View>
            {properties.map(({ p, c }, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={c?.name ?? p.address} subtitle={[p.address, p.city].filter(Boolean).join(", ")} onPress={() => setPropertyId(p.id)} />
              </View>
            ))}
          </View>
        </View>
      </Sheet>
      {pid ? (
        <VisitFormSheet
          key={propHeld.opening}
          visible={propHeld.visible}
          onExited={propHeld.onExited}
          onClose={() => { setPropertyId(null); close(); }}
          title={t("vf.addInspection")}
          saveLabel={t("lead.next.book")}
          init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, propertyId: pid, day: onDay }}
          onSave={(v) => {
            const visitId = uid();
            const r = store.addInspection(pid, { ...v, visitId });
            toast.show(t("vf.inspectionSaved", { date: day(v.start), time: time(v.start) }), r.undo);
            return visitId;
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- wave 5 «План» (13 §3.2): Лента and «Не назначено» on top ---------- */

const TASK_ROUTE: Record<Task["subjectType"], string> = { lead: "/lead", customer: "/client", job: "/job", estimate: "/estimate", property: "/property" };

/** «Не назначено» today and tomorrow, on top of the Plan (office only; the same rule as «Требует внимания») */
export function UnassignedSoon() {
  const { db } = useStore();
  const { t, time } = useI18n();
  const density = usePlanDensity();
  const [assign, setAssign] = useState<ID | null>(null);
  const list = unassignedSoon(db);
  if (!list.length) return null;
  return (
    <View style={{ gap: space[2] }} testID="plan-unassigned-soon">
      <StatusNote tone="warn" v="heading">
        {t("plan5.unassigned", { n: list.length })}
      </StatusNote>
      <CardList>
        {list.map(({ v, dd }) => {
          const { client } = visitWho(db, v);
          const property = db.properties.find((p) => p.id === visitPropertyId(db, v));
          return (
            <ListCard
              key={v.id}
              title={client || "—"}
              // 24 §B: the day in words goes under the name, the hour to the left block
              when={[dd === 0 ? t("plan5.today") : t("plan5.tomorrow"), v.allDay ? t("plan5.allDay") : null].filter(Boolean).join(" · ")}
              lead={v.allDay ? { kind: "icon", icon: "calendar" } : timeLead(time(v.start))}
              // «Весь день» goes under the name with the day: «Завтра · Весь день»
              // the visit's own status: «Не назначен» (warn) — the same chip as in the Feed
              status={{ tone: visitStatus(v, db.members, Date.now(), lateAfterOf(db)).status, label: t(visitStatus(v, db.members, Date.now(), lateAfterOf(db)).label) }}
              tags={[v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job")]}
              facts={{ addr: property?.address, num: findJob(db, v.jobId)?.number }}
              action={{ label: t("plan.assign"), icon: "user", onPress: () => setAssign(v.id) }}
              density={density}
              columns={PLAN_COLUMNS}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </CardList>
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </View>
  );
}

/**
 * «Лента» and the days of the Week: the days one under another, every item a card. A run of empty days is one row
 * («Вс, 8 – Чт, 12 нояб. · свободно», 24 §B); today stays its own row. The planner gets a quiet «＋» on a free row: the
 * add sheet opens on its first day (not the accent: one yellow per screen — the FAB).
 */
export function FeedView({ days, items, onEvent, onAdd }: { days: DayKey[]; items: PlanItem[]; onEvent?: (e: CalendarEvent) => void; onAdd?: (day: DayKey) => void }) {
  const { t, dayOf } = useI18n();
  const today = todayKey();
  return (
    <View style={{ gap: space[4] }} testID="plan-feed">
      {collapseEmpty(groupByDay(items, days), today).map((r) => {
        if (r.kind === "day") {
          // today stays its own day, with a header, even when empty («На сегодня ничего нет», 24 §B)
          return (
            <View key={r.day} style={{ gap: space[2] }}>
              <SectionTitle title={`${r.day === today ? `${t("common.today")} · ` : ""}${dayOf(r.day)}`} />
              {r.items.length ? (
                <CardList>
                  {r.items.map((x) => (
                    <FeedCard key={`${x.kind}:${x.id}:${r.day}`} x={x} onEvent={onEvent} />
                  ))}
                </CardList>
              ) : (
                <FreeRow label={t("plan5.freeToday")} a11y={t("plan5.freeA11y", { from: dayOf(r.day), to: dayOf(r.day) })} onAdd={onAdd ? () => onAdd(r.day) : undefined} />
              )}
            </View>
          );
        }
        // a run of empty days, or one empty day
        const label = r.from === r.to ? t("plan5.freeDay", { day: dayOf(r.from) }) : t("plan5.freeRun", { from: dayOf(r.from), to: dayOf(r.to) });
        return <FreeRow key={`free:${r.from}`} label={label} a11y={t("plan5.freeA11y", { from: dayOf(r.from), to: dayOf(r.to) })} onAdd={onAdd ? () => onAdd(r.from) : undefined} />;
      })}
    </View>
  );
}

/** A free row: the words in mut, a quiet «＋» for the planner (not the accent: one yellow per screen — the FAB) */
function FreeRow({ label, a11y, onAdd }: { label: string; a11y: string; onAdd?: () => void }) {
  return (
    <View testID="plan-free">
      <RowView style={{ justifyContent: "space-between", minHeight: component.rowCompact }}>
        <T v="caption" tone="mut" style={{ flex: 1 }}>
          {label}
        </T>
        {onAdd ? <IconButton icon="plus" label={a11y} onPress={onAdd} /> : null}
      </RowView>
    </View>
  );
}

function FeedCard({ x, onEvent, onAssign, endOnly }: {
  x: PlanItem;
  onEvent?: (e: CalendarEvent) => void;
  /** the Day: a visit nobody is on gets «Назначить» */
  onAssign?: (id: ID) => void;
  /** the Day: the start is the big hour on the left — under the name only «– end» (one thing once, LAYOUT-RULES П7) */
  endOnly?: boolean;
}) {
  const { db, role } = useStore();
  const { t, time, money } = useI18n();
  const density = usePlanDensity();
  const wide = density === "row";
  const names = x.people.map((id) => memberName(db, id, t)).filter(Boolean).join(", ");
  // the hour goes to the left block, the whole span «9:00 AM – 11:00 AM» under the name (recipe C, 06 §3)
  const { when, until } = itemTimes(x, time, t("plan5.allDay"));
  // «Весь день» and the carried-over part of a span (it began on an earlier day) have no hour of this day: a calendar
  // icon on the left, the words («Весь день» / «– 2:00 AM») under the name
  const lead: CardLead = x.allDay || x.at === "" ? { kind: "icon", icon: "calendar" } : timeLead(time(x.start));
  const span = endOnly && lead.kind === "time" ? until : until ? `${when} ${until}` : when;
  if (x.kind === "visit") {
    const v = x.visit;
    const job = findJob(db, v.jobId);
    const { client } = visitWho(db, v);
    const property = db.properties.find((p) => p.id === visitPropertyId(db, v));
    const customer = db.customers.find((c) => c.id === property?.customerId);
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    // the chip says «Опаздывает»; «в пути» / «не выехал» is a grey tag next to it (24 §B: the name is never cut)
    const late = st.label === "late.enRoute" ? t("plan5.lateEnRoute") : st.label === "late.notLeft" ? t("plan5.lateNotLeft") : null;
    const addr = property ? [property.address, property.city].filter(Boolean).join(", ") : undefined;
    // «к оплате» only to the office and only when there is a sum (06 §7.6; руководитель 07.11, В2)
    const due = canPlan([role]) && visitDueCents(db, v) > 0;
    return (
      <ListCard
        title={client || "—"}
        when={span}
        lead={lead}
        value={due ? money(visitDueCents(db, v)) : undefined}
        valueLabel={due ? t("card.val.toPay") : undefined}
        status={{ tone: st.status, label: late ? t("st.late") : t(st.label) }}
        signs={overlapSigns(db, v).map((o) => ({ tone: o.tone, label: t(o.key, o.params) }))}
        tags={[...(late ? [late] : []), v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job")]}
        // the Feed is an overview of the day: on a phone and a tablet only what 06 §5 asks of a visit (where, who), ~4 visits
        // a screen; the job, its number and the call / route buttons — on the 1280 row-card and on the visit's screen
        facts={wide ? { num: job?.number, addr, work: job?.title, by: names || t("plan.unassigned") } : { addr, by: names || t("plan.unassigned") }}
        contact={wide ? { phone: customer?.phone, addr } : undefined}
        action={onAssign && !liveAssignees(v, db.members).length && canReschedule(v) ? { label: t("plan.assign"), icon: "user", onPress: () => onAssign(v.id) } : undefined}
        density={density}
        columns={PLAN_COLUMNS}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  }
  if (x.kind === "task") {
    const tk = x.task;
    return (
      <ListCard
        title={tk.title}
        when={span}
        lead={lead}
        status={{ tone: x.done ? "ok" : "neutral", label: x.done ? t("plan5.done") : t("plan5.task") }}
        facts={{ by: names }}
        density={density}
        columns={PLAN_COLUMNS}
        onPress={() => router.push(`${TASK_ROUTE[tk.subjectType]}/${tk.subjectId}`)}
      />
    );
  }
  const e = x.event;
  const kind = x.kind === "timeOff" ? t("plan5.timeOff") : t("plan5.event");
  return (
    <ListCard
      title={e.title || kind}
      when={span}
      lead={lead}
      status={{ tone: "neutral", label: kind }}
      facts={{ by: names || t("plan5.company") }}
      density={density}
      columns={PLAN_COLUMNS}
      onPress={onEvent ? () => onEvent(e) : undefined}
    />
  );
}


/**
 * The day's list by time (LAYOUT-RULES §3 «Календарь»): every item one card — the hour big on the left, the client, the
 * address small, who, the status as icon + word. No hour grid and no rows for the empty windows. A visit: a swipe right
 * opens it, a swipe left shows «Перенести» · «Назначить» (the same sheets as the visit's «Когда и кто»); the web and a
 * screen reader keep the card's tap (→ the visit, where both are) and «Назначить» on a visit nobody is on.
 */
export function DayList({ day, items, onEvent, onAdd }: { day: DayKey; items: PlanItem[]; onEvent?: (e: CalendarEvent) => void; onAdd?: () => void }) {
  const { db, role } = useStore();
  const { t, dayOf } = useI18n();
  const planner = canPlan([role]);
  const [assign, setAssign] = useState<ID | null>(null);
  const [move, setMove] = useState<ID | null>(null);
  const list = items.filter((x) => x.day === day);
  return (
    <View style={{ gap: space[3] }} testID="plan-day-list">
      {list.length === 0 ? (
        <FreeRow label={day === todayKey() ? t("plan5.freeToday") : t("plan.empty")} a11y={t("plan5.freeA11y", { from: dayOf(day), to: dayOf(day) })} onAdd={onAdd} />
      ) : (
        list.map((x) => {
          const card = <FeedCard x={x} onEvent={onEvent} onAssign={planner ? setAssign : undefined} endOnly />;
          const key = `${x.kind}:${x.id}`;
          if (x.kind !== "visit") return <View key={key}>{card}</View>;
          const v = x.visit;
          const open = planner && canReschedule(v);
          return (
            <SwipeRow
              key={key}
              testID={`plan-swipe-${v.id}`}
              round={radius.card}
              left={[{ key: "open", label: t("swipe.open"), icon: "eye", full: true, onPress: () => router.push(`/visit/${v.id}`) }]}
              right={
                open
                  ? [
                      { key: "move", label: t("vw.reschedule"), icon: "calendar", onPress: () => setMove(v.id) },
                      { key: "assign", label: t("plan.assign"), icon: "user", onPress: () => setAssign(v.id) },
                    ]
                  : []
              }
            >
              {card}
            </SwipeRow>
          );
        })
      )}
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
      <MoveVisitSheet visit={db.visits.find((v) => v.id === move)} onClose={() => setMove(null)} />
    </View>
  );
}

/** «Перенести» from the Plan: the same form and the same store calls as the visit's «Когда и кто» (VisitForm WhenWho) */
function MoveVisitSheet({ visit, onClose }: { visit?: Visit; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const held = useHeldSheet(visit ?? null);
  const v = held.value;
  if (!v) return null;
  const people = assigneesOf(v);
  return (
    <VisitFormSheet
      key={held.opening}
      visible={held.visible}
      onExited={held.onExited}
      onClose={onClose}
      title={t("vw.reschedule")}
      saveLabel={t("vw.reschedule")}
      withNote={false}
      init={{ durationMin: v.durationMin, techIds: people, start: v.start, exceptId: v.id, propertyId: visitPropertyId(db, v), jobId: v.jobId, allDay: v.allDay, allowAllDay: !!v.jobId && v.kind !== "inspection" }}
      onSave={(f) => {
        const undoMove = store.rescheduleVisit(v.id, f.start, f.durationMin, f.allDay);
        const undoTech = f.assigneeIds.join() !== people.join() ? store.assignVisit(v.id, f.assigneeIds) : NO_UNDO;
        toast.show(f.allDay ? t("job5.allDaySaved", { date: day(f.start) }) : t("vf.rescheduled", { date: day(f.start), time: time(f.start) }), store.undoTogether([undoMove, undoTech]));
        return v.customerNotifiedAt ? v.id : null;
      }}
    />
  );
}

/** desktop: a row-card with columns (06 §4); phone and tablet: the regular card in one column — the Feed is a timeline */
function usePlanDensity(): Density {
  const { device } = useDevice();
  return device === "desktop" ? "row" : "regular";
}
