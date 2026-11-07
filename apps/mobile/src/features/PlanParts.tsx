import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID, Task } from "@/data/types";
import { findJob } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { todayKey, type DayKey } from "@/features/calendar";
import { lateAfterOf, scheduleSettingsOf } from "@/features/scheduleSettings";
import { visitStatus } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { collapseEmpty, groupByDay, itemTimes, type DayLoad, type PlanItem } from "@/features/planFeed";
import { overlapSigns } from "@/features/listSigns";
import { formatDayKey, wallToInstant } from "@/features/zone";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { daysSince, unassignedSoon, visitWho, waitingJobs, type PlanWho } from "@/features/schedule";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, ChoiceChips, IconButton, StatusChip, TextField } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Divider, ItemCard, ListRow, RowView, SectionTitle } from "@/ui/surfaces";

/**
 * Parts of the Plan tab for the office (docs/specs/03 §7.2, wave П3b): «Ждут даты», «Чей план», «+».
 * Only for those who plan (canPlan): a tech and sales never see them.
 */

/** «Ждут даты · N» (S8b / S9a on the screen): jobs without a date, the oldest first → «Запланировать» */
export function WaitingJobs() {
  const { db } = useStore();
  const { t, money } = useI18n();
  const [all, setAll] = useState(false);
  const list = waitingJobs(db);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 2);
  return (
    <View style={{ gap: space[2] }}>
      <T v="heading" tone="warn">
        {t("plan.waiting", { n: list.length })}
      </T>
      <CardList>
        {shown.map(({ job, since }) => {
          const property = db.properties.find((p) => p.id === job.propertyId);
          const customer = db.customers.find((c) => c.id === property?.customerId);
          const d = daysSince(since);
          const ago = d === null ? undefined : d === 0 ? t("plan.signedToday") : t("plan.signedAgo", { n: d });
          return (
            <ItemCard
              key={job.id}
              title={customer?.name ?? job.title}
              subtitle={[job.title, money(job.amountCents), ago].filter(Boolean).join(" · ")}
              right={<Button label={t("plan.schedule")} icon="calendar" size="sm" variant="secondary" onPress={() => router.push(`/job/schedule?jobId=${job.id}`)} />}
              onPress={() => router.push(`/job/${job.id}`)}
            />
          );
        })}
      </CardList>
      {list.length > 2 && !all ? <Button label={t("plan.showAll")} variant="ghost" size="sm" onPress={() => setAll(true)} /> : null}
    </View>
  );
}

/** «Чей план»: Все · Я · people (techs of the company) */
export function PlanWhoChips({ who, onChange }: { who: PlanWho; onChange: (w: PlanWho) => void }) {
  const { db } = useStore();
  const { t } = useI18n();
  const people = db.members.filter((m) => m.roles.includes("tech") && !m.pending && m.id !== db.me);
  const meTech = db.members.some((m) => m.id === db.me && m.roles.includes("tech"));
  return (
    <ChoiceChips
      value={who}
      onChange={onChange}
      items={[
        { key: "all", label: t("plan.who.all") },
        ...(meTech ? [{ key: "me", label: t("plan.who.me") }] : []),
        ...people.map((m) => ({ key: m.id, label: m.name.split(" ")[0] ?? m.name })),
      ]}
    />
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
                  <ListRow title={job.title} subtitle={db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId)?.name} onPress={() => { close(); router.push(`/job/schedule?jobId=${job.id}`); }} />
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
      {propertyId ? (
        <VisitFormSheet
          visible
          onClose={() => { setPropertyId(null); close(); }}
          title={t("vf.addInspection")}
          saveLabel={t("lead.next.book")}
          init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, propertyId, start: onDay ? wallToInstant(onDay, 9 * 60) : undefined }}
          onSave={(v) => {
            const visitId = uid();
            const r = store.addInspection(propertyId, { ...v, visitId });
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
  const [assign, setAssign] = useState<ID | null>(null);
  const list = unassignedSoon(db);
  if (!list.length) return null;
  return (
    <View style={{ gap: space[2] }} testID="plan-unassigned-soon">
      <T v="heading" tone="warn">
        {t("plan5.unassigned", { n: list.length })}
      </T>
      <CardList>
        {list.map(({ v, dd }) => {
          const { client } = visitWho(db, v);
          const property = db.properties.find((p) => p.id === visitPropertyId(db, v));
          return (
            <ItemCard
              key={v.id}
              status="warn"
              title={`${dd === 0 ? t("plan5.today") : t("plan5.tomorrow")} · ${v.allDay ? t("plan5.allDay") : time(v.start)} · ${client}`}
              subtitle={[v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"), property?.address].filter(Boolean).join(" · ")}
              right={<Button label={t("plan.assign")} icon="user" size="sm" variant="secondary" onPress={() => setAssign(v.id)} />}
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
        if (r.kind === "day" && r.items.length)
          return (
            <View key={r.day} style={{ gap: space[2] }}>
              <SectionTitle title={`${r.day === today ? `${t("common.today")} · ` : ""}${dayOf(r.day)}`} />
              <CardList>
                {r.items.map((x) => (
                  <FeedCard key={`${x.kind}:${x.id}:${r.day}`} x={x} onEvent={onEvent} />
                ))}
              </CardList>
            </View>
          );
        // a free row: a run of empty days, one empty day, or today with nothing
        const from = r.kind === "day" ? r.day : r.from;
        const to = r.kind === "day" ? r.day : r.to;
        const label = from === today ? t("plan5.freeToday", { day: dayOf(from) }) : from === to ? t("plan5.freeDay", { day: dayOf(from) }) : t("plan5.freeRun", { from: dayOf(from), to: dayOf(to) });
        return (
          <View key={`free:${from}`} testID="plan-free">
            <RowView style={{ justifyContent: "space-between", minHeight: component.rowCompact }}>
              <T v="caption" tone="mut" style={{ flex: 1 }}>
                {label}
              </T>
              {onAdd ? <IconButton icon="plus" label={t("plan.addTitle")} onPress={() => onAdd(from)} /> : null}
            </RowView>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One day of the Week strip and of the Month (24 §B): the date, the number of the Feed's items («В плане: N» to a screen
 * reader), yellow only when an open visit has nobody on it; a day off of the picked person is the word «выходной»,
 * no colour. The picked day is an ink frame on surf2 (not the accent); today is bold. Tap → the Day.
 */
export function DayCell({ day, load, selected, dim, head, onPress }: { day: DayKey; load?: DayLoad; selected: boolean; dim?: boolean; head?: string; onPress: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const today = day === todayKey();
  const n = load?.n ?? 0;
  return (
    <Press
      onPress={onPress}
      visibleHeight={component.rowCompact}
      accessibilityRole="button"
      accessibilityLabel={`${day}: ${n}`}
      accessibilityHint={n ? t("plan5.planned", { n }) : undefined}
      containerStyle={{ flex: 1, minWidth: 0 }}
      style={{
        minHeight: component.rowCompact + space[4],
        borderRadius: component.checkbox.radius,
        borderWidth: selected ? component.selectedBorder : component.hairline,
        borderColor: selected ? c.ink : c.bd,
        backgroundColor: selected ? c.surf2 : c.in,
        opacity: dim ? component.dimOpacity : 1,
        alignItems: "center",
        justifyContent: "center",
        gap: space[1],
      }}
    >
      {head ? (
        <T v="micro" tone="mut" numberOfLines={1}>
          {head}
        </T>
      ) : null}
      <T v="caption" w={today ? "bold" : "regular"} tabular>
        {Number(day.slice(8))}
      </T>
      {n ? <StatusChip status={load?.unassigned ? "warn" : "info"} label={String(n)} soft /> : null}
      {load?.dayOff ? (
        <T v="micro" tone="mut" numberOfLines={1}>
          {t("plan5.dayOff")}
        </T>
      ) : null}
    </Press>
  );
}

/** The Week strip: 7 days in a row, the same cell as the Month (24 §B) */
export function WeekStrip({ days, loads, date, onPick }: { days: DayKey[]; loads: Map<DayKey, DayLoad>; date: DayKey; onPick: (k: DayKey) => void }) {
  const { lang } = useI18n();
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  return (
    <View style={{ flexDirection: "row", gap: space[1] }} testID="plan-week-strip">
      {days.map((k) => (
        <DayCell key={k} day={k} load={loads.get(k)} selected={k === date} head={formatDayKey(k, { weekday: "short" }, loc)} onPress={() => onPick(k)} />
      ))}
    </View>
  );
}

function FeedCard({ x, onEvent }: { x: PlanItem; onEvent?: (e: CalendarEvent) => void }) {
  const { db } = useStore();
  const { t, time } = useI18n();
  const names = x.people.map((id) => memberName(db, id, t)).filter(Boolean).join(", ");
  // the title starts with the start of the day's part (short on a phone); the end goes to the subtitle
  const { when, until } = itemTimes(x, time, t("plan5.allDay"));
  if (x.kind === "visit") {
    const v = x.visit;
    const job = findJob(db, v.jobId);
    const { client } = visitWho(db, v);
    const property = db.properties.find((p) => p.id === visitPropertyId(db, v));
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    const status = st.status;
    return (
      <ItemCard
        status={status}
        title={`${when} · ${client || "—"}`}
        subtitle={[until, v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"), job?.number, property?.address, names || t("plan.unassigned")].filter(Boolean).join(" · ")}
        right={<RowView>{overlapSigns(db, v).map((o) => <StatusChip key={o.key} status={o.tone} label={t(o.key, o.params)} />)}<StatusChip status={status} label={t(st.label)} /></RowView>}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  }
  if (x.kind === "task") {
    const tk = x.task;
    return (
      <ItemCard
        status={x.done ? "ok" : "neutral"}
        title={`${when} · ${tk.title}`}
        subtitle={[until, t("plan5.task"), names].filter(Boolean).join(" · ")}
        right={<StatusChip status={x.done ? "ok" : "neutral"} label={x.done ? t("plan5.done") : t("plan5.task")} />}
        onPress={() => router.push(`${TASK_ROUTE[tk.subjectType]}/${tk.subjectId}`)}
      />
    );
  }
  const e = x.event;
  const kind = x.kind === "timeOff" ? t("plan5.timeOff") : t("plan5.event");
  return (
    <ItemCard
      status="neutral"
      title={`${when} · ${e.title || kind}`}
      subtitle={[until, kind, names || t("plan5.company")].filter(Boolean).join(" · ")}
      right={<StatusChip status="neutral" label={kind} />}
      onPress={onEvent ? () => onEvent(e) : undefined}
    />
  );
}
