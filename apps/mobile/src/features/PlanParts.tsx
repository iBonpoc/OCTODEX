import { useState, type ReactNode } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { router } from "expo-router";
import { component, radius, rhythm, space, spaceHalf } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, DB, ID, Task, Visit } from "@/data/types";
import { findJob } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { todayKey, type DayKey } from "@/features/calendar";
import { lateAfterOf, scheduleSettingsOf } from "@/features/scheduleSettings";
import { visitStatus } from "@/features/visits";
import { overlapSigns } from "@/features/listSigns";
import { AssignSheet } from "@/features/sheets";
import { collapseEmpty, groupByDay, itemTimes, timeLead, type PlanItem } from "@/features/planFeed";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { assigneesOf, canReschedule, daysSince, liveAssignees, unassignedSoon, visitWho, waitingJobs } from "@/features/schedule";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Avatar, TextField } from "@/ui/controls";
import { CountPill, HatchPlate, TimeSlot } from "@/ui/figures";
import { StatusPill } from "@/ui/statusPill";
import { StatusNote } from "@/ui/statusNote";
import { nearIndex, plateHalves, problemSummary, quietStatuses } from "@/features/planSlots";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";
import { GroupedList, GroupRow, ListGroup, type RowLead } from "@/ui/groupedList";
/** the day strip moved to src/ui (BUILD-PLAN §1, поток В); re-exported so plan.tsx keeps its imports until wave 3 */
export { DayCell, DayStrip, WeekStrip, stripDays } from "@/ui/dayStrip";
import { NO_UNDO } from "@/data/undo";

/**
 * Parts of «План» on the template «Календарь» (LAYOUT-RULES §3, BUILD-SPEC §2.2, wave 3 Э2): the day's rows — the hour on
 * the left, the client, «– конец · работа · мастер», a StatusPill only when it says something (not «Запланирован»); the
 * swipe «Открыть» / «Перенести · Назначить» (the same on a long press and to VoiceOver — GroupRow); «Не назначено · N» and
 * «Без даты · N» as sheets behind one row each; the search and the filters — FilterBar «значки в шапке»; «＋» — the header's menu.
 */

const TASK_ROUTE: Record<Task["subjectType"], string> = { lead: "/lead", customer: "/client", job: "/job", estimate: "/estimate", property: "/property" };

/**
 * «Накладка» (docs/specs/03 П3c п. 8): an open visit crossing another of its people's says so where its status says nothing
 * («Запланирован») — a warn pill on its first row, a word on the others (quietStatuses), as the late and the missed.
 */
export function withOverlap(db: Pick<DB, "visits">, v: Visit, st: ReturnType<typeof visitStatus>): ReturnType<typeof visitStatus> {
  return st.status === "neutral" && overlapSigns(db, v).length ? { status: "warn", label: "card.sign.overlap" } : st;
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
  // the hour on the left (GroupRow `lead.time`: «9:00» big, «AM» small); «весь день» / a carried-over span — a calendar icon
  const hm = span ? null : timeLead(time(x.start));
  const lead: RowLead = hm ? { time: hm.top, sub: hm.bottom || undefined } : { icon: "calendar" };
  let row;
  if (x.kind === "visit") {
    const v = x.visit;
    const { client } = visitWho(db, v);
    const st = withOverlap(db, v, visitStatus(v, db.members, Date.now(), lateAfterOf(db)));
    const late = st.label === "late.enRoute" || st.label === "late.notLeft";
    const nobody = !liveAssignees(v, db.members).length;
    const work = findJob(db, v.jobId)?.title ?? (v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"));
    const movable = canReschedule(v);
    row = (
      <GroupRow
        testID={`plan-row-${v.id}`}
        lead={lead}
        title={client || "—"}
        // #2363 F10: the state is the pill only — never glued into the line
        subtitle={[span, work, nobody ? null : names].filter(Boolean).join(" · ")}
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
        lead={lead}
        title={tk.title}
        subtitle={[span, t("plan5.task"), names].filter(Boolean).join(" · ")}
        status={x.done ? { status: "ok", label: t("plan5.done") } : undefined}
        onPress={() => router.push(`${TASK_ROUTE[tk.subjectType]}/${tk.subjectId}`)}
      />
    );
  } else {
    const e = x.event;
    const kind = x.kind === "timeOff" ? t("plan5.timeOff") : t("plan5.event");
    row = <GroupRow lead={lead} title={e.title || kind} subtitle={[span, e.title ? kind : null, names || t("plan5.company")].filter(Boolean).join(" · ")} onPress={onEvent ? () => onEvent(e) : undefined} />;
  }
  return row;
}

/**
 * The Day on a phone as visual v2 «время и интервал» (docs/design/visual-v2.html, кадр 2): the day's title with its count «06»,
 * one summary «3 опаздывают · 1 пропущен» instead of a pill on every row (audit 12 §2.3), then a TimeSlot per item — the hour column
 * 44 (the hour, the length), the interval plate «8:30 ▸ 12:30 PM» (the nearest visit of today in the accent's tone), the client and
 * «работа · мастер» in two lines. A problem is a pill on its first row only; the tech's initials stand where no pill is. «Назначить»
 * is «Не назначено · N» over the day, «Перенести» — the visit itself («Когда и кто»).
 */
export function PlanDay({ items, day, title, testID }: { items: PlanItem[]; day: DayKey; title: string; testID?: string }) {
  const { db } = useStore();
  const { t, tn, time, duration, dayOf } = useI18n();
  const { c } = useTheme();
  const rows = items.filter((x) => x.day === day);
  const now = Date.now();
  const near = day === todayKey() ? nearIndex(rows, now) : -1;
  const st = rows.map((x) => (x.kind === "visit" ? withOverlap(db, x.visit, visitStatus(x.visit, db.members, now, lateAfterOf(db))) : x.kind === "task" && x.done ? { status: "ok" as const, label: "plan5.done" as const } : undefined));
  const shown = quietStatuses(st.map((s) => s?.status));
  const kinds = st.map((s) => (!s ? null : s.label === "st.missed" ? "missed" : s.label === "late.enRoute" || s.label === "late.notLeft" ? "late" : null));
  const sum = problemSummary(kinds);
  const sumText = sum ? [sum.late ? tn("w2a.lateN", sum.late) : null, sum.missed ? tn("w2a.missedN", sum.missed) : null].filter(Boolean).join(" · ") : null;
  // v2 макет 2: the line «сейчас» stands after the last item begun by now (today only)
  const nowAt = day === todayKey() ? rows.filter((x) => !(x.allDay || x.at === "") && Date.parse(x.start) <= now).length : -1;
  const nowLine = nowAt >= 0 && rows.length ? <NowLine key="now" label={time(new Date(now).toISOString())} /> : null;
  return (
    <View testID={testID} style={{ gap: space[2] }}>
      {/* «Выезды сегодня 6» — the count is the CountPill of every section head (#2363 F08); the miles and the road time of the day are not in the data */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[4] - space[2], marginBottom: rhythm.headGap - space[2] }}>
        <T v="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
          {day === todayKey() ? t("px1.plan.today") : `${t("px1.plan.day")} · ${dayOf(day)}`}
        </T>
        {/* #2363 F08: one counter for every section head — CountPill, no leading zero */}
        <CountPill n={rows.length} testID="plan-day-count" />
        {/* #2363 F28: «⚠ 2 опаздывают» on the right of the head (where v2 has «41 mi · 1 ч 50») — nothing below moves */}
        <View style={{ flex: 1 }} />
        {sumText ? (
          <View testID="plan-summary" style={{ flexShrink: 1 }}>
            <StatusNote tone={sum!.missed ? "bad" : "warn"}>{sumText}</StatusNote>
          </View>
        ) : null}
      </View>
      {nowAt === 0 ? nowLine : null}
      {rows.flatMap((x, i) => {
        const el = ((): ReactNode => {
        const span = x.allDay || x.at === "";
        const from = span ? itemTimes(x, time, t("plan5.allDay")).when : time(x.start);
        const to = span || !x.end ? "" : time(x.end);
        const [a, b] = to ? plateHalves(from, to) : [from, ""];
        const hour = span ? "" : timeLead(time(x.start)).top;
        const len = !span && x.end ? duration((Date.parse(x.end) - Date.parse(x.start)) / 60_000) : undefined;
        const names = x.people.map((id) => memberName(db, id, t)).filter(Boolean).join(", ");
        const s = st[i];
        // #2363 F10/N1: a pill only on the exceptions (late, missed, a problem) — one word, on every such row; the line never
        // carries the state («Опаздывает · в пути · …» was glued into it)
        const odd = !!s && (kinds[i] !== null || s.status === "bad" || s.status === "warn");
        const pill = s && odd ? { status: s.status, label: kinds[i] === "late" ? t("st.late") : t(s.label) } : undefined;
        void shown;
        const word = null;
        if (x.kind === "visit") {
          const v = x.visit;
          const { client } = visitWho(db, v);
          const nobody = !liveAssignees(v, db.members).length;
          const work = findJob(db, v.jobId)?.title ?? (v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"));
          const first = x.people[0] ? db.members.find((m) => m.id === x.people[0]) : undefined;
          // the tech's initials where no pill stands; a visit nobody is on is assigned from «Не назначено · N» over the day (a button
          // inside the card would be a button in a button)
          const right = pill || !first ? undefined : <Avatar initials={first.initials} s={component.avatar.sm} sub={first.kind === "sub"} />;
          return (
            <TimeSlot
              key={`visit:${x.id}`}
              testID={`plan-row-${v.id}`}
              hour={hour}
              length={len}
              from={a}
              to={b}
              near={i === near}
              title={client || "—"}
              // v2 макет 2 «Bathroom remodel · Alex»: the job's name before its «: details», the tech by the first name
              line={[word, work.split(":")[0]?.trim(), nobody ? null : x.people.map((id) => memberName(db, id, t)?.split(/\s+/)[0]).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
              status={pill}
              right={right}
              oneLine
              // v2 макет 2: «в дороге · 30 мин» — the minutes since the tech left (`enRouteAt`), a hatched plate, not a progress
              top={v.step === "en_route" && v.enRouteAt ? <HatchPlate testID={`plan-road-${v.id}`} label={t("px1.plan.road", { d: duration(Math.max(1, Math.round((now - Date.parse(v.enRouteAt)) / 60_000))) })} /> : undefined}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        }
        if (x.kind === "task") {
          const tk = x.task;
          return (
            <TimeSlot
              key={`task:${x.id}`}
              hour={hour}
              from={a}
              to={b}
              title={tk.title}
              line={[t("plan5.task"), names].filter(Boolean).join(" · ")}
              status={pill}
              onPress={() => router.push(`${TASK_ROUTE[tk.subjectType]}/${tk.subjectId}`)}
            />
          );
        }
        const e = x.event;
        const kind = x.kind === "timeOff" ? t("plan5.timeOff") : t("plan5.event");
        return (
          <TimeSlot
            key={`${x.kind}:${x.id}`}
            hour={hour}
            length={len}
            from={a}
            to={b}
            title={e.title || kind}
            line={[e.title ? kind : null, names || t("plan5.company")].filter(Boolean).join(" · ")}
          />
        );
        })();
        return i + 1 === nowAt ? [el, nowLine] : [el];
      })}
    </View>
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

/**
 * «8:20 ●——» — the line «сейчас» of today's Day (v2 макет 2 `.now`): the time 12/700 `accText` in the hour column, a dot 8 and a
 * hairline of the accent from the cards' edge to the screen's (85 %).
 */
function NowLine({ label }: { label: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const k = component.timeSlot;
  const dot = space[2];
  return (
    <View testID="plan-now" accessibilityRole="text" accessibilityLabel={t("px1.plan.nowA11y", { time: label })} style={{ flexDirection: "row", alignItems: "center", height: dot + spaceHalf.hair, marginVertical: -spaceHalf.hair }}>
      <View style={{ width: k.timeW + space[2] + spaceHalf.hair - dot / 2 }}>
        <T v="micro" w="bold" style={{ color: c.accText }} numberOfLines={1}>
          {timeLead(label).top}
        </T>
      </View>
      <View style={{ width: dot, height: dot, borderRadius: radius.pill, backgroundColor: c.acc }} />
      <View style={{ flex: 1, height: component.hairline, backgroundColor: c.acc, opacity: NOW_OPACITY }} />
    </View>
  );
}
const NOW_OPACITY = 0.85;
