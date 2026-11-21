import { useState } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID, Task, Visit } from "@/data/types";
import { findJob } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { todayKey, type DayKey } from "@/features/calendar";
import { lateAfterOf, scheduleSettingsOf } from "@/features/scheduleSettings";
import { visitStatus } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { collapseEmpty, groupByDay, itemTimes, timeLead, type PlanItem } from "@/features/planFeed";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { assigneesOf, canReschedule, daysSince, liveAssignees, unassignedSoon, visitWho, waitingJobs } from "@/features/schedule";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow, RowView } from "@/ui/surfaces";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { FilterRow } from "@/ui/filterBar";
import type { FilterGroup } from "@/ui/filterBarRules";
import { useTheme } from "@/theme/ThemeProvider";
/** the day strip moved to src/ui (BUILD-PLAN §1, поток В); re-exported so plan.tsx keeps its imports until wave 3 */
export { DayCell, DayStrip, WeekStrip, stripDays } from "@/ui/dayStrip";
import { NO_UNDO } from "@/data/undo";

/**
 * Parts of «План» on the template «Календарь» (LAYOUT-RULES §3, BUILD-SPEC §2.2, wave 3 Э2): the day's rows — the hour on
 * the left, the client, «– конец · работа · мастер», a StatusPill only when it says something (not «Запланирован»); the
 * swipe «Открыть» / «Перенести · Назначить» (the same on a long press and to VoiceOver — GroupRow); «Не назначено · N» and
 * «Без даты · N» as sheets behind one row each; the search and the filters behind the header's icons; «＋» — the header's menu.
 */

const TASK_ROUTE: Record<Task["subjectType"], string> = { lead: "/lead", customer: "/client", job: "/job", estimate: "/estimate", property: "/property" };

/** the hour column on the left of a row: «9:00» big, «AM» small; «весь день» / a carried-over span — a calendar icon */
function HourLead({ x }: { x: PlanItem }) {
  const { time } = useI18n();
  const { c } = useTheme();
  const hm = x.allDay || x.at === "" ? null : timeLead(time(x.start));
  return (
    <View style={{ width: size.hitMin, marginLeft: space[4], alignItems: "flex-end" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {hm ? (
        <>
          <T v="heading" w="semibold" tabular numberOfLines={1}>
            {hm.top}
          </T>
          {hm.bottom ? (
            <T v="micro" tone="mut" numberOfLines={1}>
              {hm.bottom}
            </T>
          ) : null}
        </>
      ) : (
        <Icon name="calendar" s={size.iconMd} color={c.mut} />
      )}
    </View>
  );
}

export type RowHandlers = {
  onEvent?: (e: CalendarEvent) => void;
  /** the planner: «Назначить» (a visit nobody is on gets it as the row's icon, every visit in the swipe) */
  onAssign?: (id: ID) => void;
  /** the planner: «Перенести» in the swipe */
  onMove?: (id: ID) => void;
};

/**
 * One item of the day as a row (GroupRow) with the hour on the left. Everything the old card said once is said once (П7):
 * the start is the hour, under the name only «– end», the work and who; «Без мастера» is the pill, not a word under the name.
 */
export function PlanRow({ x, onEvent, onAssign, onMove }: { x: PlanItem } & RowHandlers) {
  const { db } = useStore();
  const { t, time } = useI18n();
  const names = x.people.map((id) => memberName(db, id, t)).filter(Boolean).join(", ");
  const { when, until } = itemTimes(x, time, t("plan5.allDay"));
  // the hour is the lead; only a span that began earlier / «весь день» say it under the name — the end is on the visit
  // (a phone row has ~200 pt for the line: «работа · мастер» first, as in the wireframe v2 №2)
  void until;
  const span = x.allDay || x.at === "" ? when : null;
  let row;
  if (x.kind === "visit") {
    const v = x.visit;
    const { client } = visitWho(db, v);
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    const late = st.label === "late.enRoute" || st.label === "late.notLeft";
    const nobody = !liveAssignees(v, db.members).length;
    const work = findJob(db, v.jobId)?.title ?? (v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"));
    const movable = canReschedule(v);
    row = (
      <GroupRow
        testID={`plan-row-${v.id}`}
        title={client || "—"}
        subtitle={[span, work, nobody ? null : names, late ? (st.label === "late.enRoute" ? t("plan5.lateEnRoute") : t("plan5.lateNotLeft")) : null].filter(Boolean).join(" · ")}
        // «Запланирован» is every row — no pill; the rest is a pill «значок + слово» (rule 2)
        status={st.status === "neutral" ? undefined : { status: st.status, label: late ? t("st.late") : t(st.label) }}
        actions={onAssign && nobody && movable ? [{ icon: "user", a11y: t("proto.plan.assignA11y", { name: client || "—" }), onPress: () => onAssign(v.id), testID: `plan-assign-${v.id}` }] : []}
        swipe={{
          left: [{ key: "open", label: t("swipe.open"), icon: "eye", full: true, onPress: () => router.push(`/visit/${v.id}`) }],
          right: onAssign && onMove && movable
            ? [
                { key: "move", label: t("vw.reschedule"), icon: "calendar", onPress: () => onMove(v.id) },
                { key: "assign", label: t("plan.assign"), icon: "user", onPress: () => onAssign(v.id) },
              ]
            : [],
        }}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  } else if (x.kind === "task") {
    const tk = x.task;
    row = (
      <GroupRow
        title={tk.title}
        subtitle={[span, t("plan5.task"), names].filter(Boolean).join(" · ")}
        status={x.done ? { status: "ok", label: t("plan5.done") } : undefined}
        onPress={() => router.push(`${TASK_ROUTE[tk.subjectType]}/${tk.subjectId}`)}
      />
    );
  } else {
    const e = x.event;
    const kind = x.kind === "timeOff" ? t("plan5.timeOff") : t("plan5.event");
    row = <GroupRow title={e.title || kind} subtitle={[span, e.title ? kind : null, names || t("plan5.company")].filter(Boolean).join(" · ")} onPress={onEvent ? () => onEvent(e) : undefined} />;
  }
  return (
    <RowView gap={0} style={{ alignItems: "center" }}>
      <HourLead x={x} />
      <View style={{ flex: 1, minWidth: 0 }}>{row}</View>
    </RowView>
  );
}

/** the day's rows, for the template's `items` */
export function planRows(items: PlanItem[], day: DayKey, h: RowHandlers) {
  return items.filter((x) => x.day === day).map((x) => <PlanRow key={`${x.kind}:${x.id}`} x={x} {...h} />);
}

/**
 * The Week: the seven days one under another, a group per day; a run of empty days is one quiet line
 * («Вс, 8 – Чт, 12 нояб. · свободно», 24 §B) — the empty windows are not drawn as rows (LAYOUT-RULES §3).
 */
export function WeekList({ days, items, h, onDay }: { days: DayKey[]; items: PlanItem[]; h: RowHandlers; onDay: (k: DayKey) => void }) {
  const { t, dayOf } = useI18n();
  const today = todayKey();
  return (
    <View testID="plan-week-list">
      <GroupedList>
        {collapseEmpty(groupByDay(items, days), today).map((r) => {
          if (r.kind === "day" && r.items.length) {
            return (
              <ListGroup
                key={r.day}
                title={`${r.day === today ? `${t("common.today")} · ` : ""}${dayOf(r.day)}`}
                all={{ label: t("plan.day"), onPress: () => onDay(r.day), testID: `plan-week-day-${r.day}` }}
              >
                {r.items.map((x) => (
                  <PlanRow key={`${x.kind}:${x.id}:${r.day}`} x={x} {...h} />
                ))}
              </ListGroup>
            );
          }
          const from = r.kind === "day" ? r.day : r.from;
          const to = r.kind === "day" ? r.day : r.to;
          const label = from === today && to === today ? t("plan5.freeToday") : from === to ? t("plan5.freeDay", { day: dayOf(from) }) : t("plan5.freeRun", { from: dayOf(from), to: dayOf(to) });
          return (
            <View key={`free:${from}`} testID="plan-free" style={{ paddingHorizontal: space[1] }}>
              <T v="caption" tone="mut">
                {label}
              </T>
            </View>
          );
        })}
      </GroupedList>
    </View>
  );
}

/** «Не назначено · N» (today and tomorrow, the office): a sheet of rows, each with «Назначить» */
export function UnassignedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const { t, time } = useI18n();
  const [assign, setAssign] = useState<ID | null>(null);
  const list = unassignedSoon(db);
  return (
    <>
      <Sheet visible={visible && !assign} onClose={onClose} title={t("plan5.unassigned", { n: list.length })}>
        <GroupedList testID="plan-unassigned-sheet">
          <ListGroup>
            {list.map(({ v, dd }) => {
              const { client } = visitWho(db, v);
              return (
                <GroupRow
                  key={v.id}
                  title={client || "—"}
                  subtitle={[dd === 0 ? t("plan5.today") : t("plan5.tomorrow"), v.allDay ? t("plan5.allDay") : time(v.start), v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job")].join(" · ")}
                  lead={{ icon: "user" }}
                  actions={[{ icon: "user", a11y: t("proto.plan.assignA11y", { name: client || "—" }), onPress: () => setAssign(v.id), testID: `plan-unassigned-assign-${v.id}` }]}
                  onPress={() => { onClose(); router.push(`/visit/${v.id}`); }}
                />
              );
            })}
          </ListGroup>
        </GroupedList>
      </Sheet>
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </>
  );
}

/** «Без даты · N» (S8b / S9a): jobs without a date, the oldest first; the row's icon → «Запланировать» */
export function WaitingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const { t, money } = useI18n();
  const list = waitingJobs(db);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("plan.waiting", { n: list.length })}>
      <GroupedList testID="plan-waiting-sheet">
        <ListGroup>
          {list.map(({ job, since }) => {
            const property = db.properties.find((p) => p.id === job.propertyId);
            const customer = db.customers.find((c) => c.id === property?.customerId);
            const d = daysSince(since);
            const ago = d === null ? null : d === 0 ? t("plan.signedToday") : t("plan.signedAgo", { n: d });
            const name = customer?.name ?? job.title;
            return (
              <GroupRow
                key={job.id}
                title={name}
                subtitle={[customer ? job.title : null, ago].filter(Boolean).join(" · ")}
                lead={{ icon: "calendar" }}
                // only the planner opens this sheet: the job's sum is the office's (06 §7.6)
                value={job.amountCents > 0 ? money(job.amountCents) : undefined}
                actions={[{ icon: "calendar", a11y: t("proto.plan.scheduleA11y", { name }), onPress: () => { onClose(); router.push(`/job/schedule?jobId=${job.id}`); }, testID: `plan-waiting-schedule-${job.id}` }]}
                onPress={() => { onClose(); router.push(`/job/${job.id}`); }}
              />
            );
          })}
        </ListGroup>
      </GroupedList>
    </Sheet>
  );
}

/** the search of the Plan, opened by the header's magnifier (founder 21.11: not a row of circles of its own) */
export function PlanSearch({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return <TextField testID="plan-search-field" type="search" icon="search" value={value} onChangeText={onChange} placeholder={placeholder} label={placeholder} autoFocus />;
}

/**
 * «Фильтры» of the Plan behind the header's icon (founder 21.11): the same groups as FilterBar's sheet, rows FilterRow;
 * what is on is a chip «Мастер: Ivan ✕» under the strip (PlanChosen).
 */
export function PlanFilterSheet({ visible, onClose, groups }: { visible: boolean; onClose: () => void; groups: FilterGroup[] }) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("fix.filters.title")}>
      <View style={{ gap: space[4] }} testID="plan-filter-sheet">
        {groups.filter((g) => g.options.length).map((g) => (
          <View key={g.key} style={{ gap: space[1] }}>
            <T v="micro" w="semibold" tone="mut" style={{ textTransform: "uppercase" }}>
              {g.title}
            </T>
            {g.options.map((o) => (
              <FilterRow key={o.key} label={o.label} on={o.on} single={g.single} onToggle={() => g.onToggle(o.key)} />
            ))}
          </View>
        ))}
        <Button label={t("fix.filters.done")} variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** what is on in «Фильтры»: a chip per choice («Мастер: Ivan ✕»), «Сбросить» */
export function PlanChosen({ groups, onReset }: { groups: FilterGroup[]; onReset: () => void }) {
  const { t } = useI18n();
  const on = groups.flatMap((g) => g.options.filter((o) => o.on).map((o) => ({ g, o })));
  if (!on.length) return null;
  return (
    <View testID="plan-chosen" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
      {on.map(({ g, o }) => (
        <Button
          key={`${g.key}:${o.key}`}
          label={g.single ? `${g.title}: ${o.label}` : o.label}
          icon="close"
          size="sm"
          variant="secondary"
          accessibilityLabel={t("card.filter.remove", { v: g.single ? `${g.title}: ${o.label}` : o.label })}
          onPress={() => g.onToggle(o.key)}
        />
      ))}
      <Button label={t("fix.filters.reset")} variant="ghost" size="sm" onPress={onReset} />
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

/** «Перенести» from the Plan: the same form and the same store calls as the visit's «Когда и кто» (VisitForm WhenWho) */
export function MoveVisitSheet({ visit, onClose }: { visit?: Visit; onClose: () => void }) {
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
