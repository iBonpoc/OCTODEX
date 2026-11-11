import { useState } from "react";
import { visitDueCents } from "@/features/visitDue";
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
import { collapseEmpty, groupByDay, itemTimes, timeLead, type DayLoad, type PlanItem } from "@/features/planFeed";
import { overlapSigns } from "@/features/listSigns";
import { formatDayKey } from "@/features/zone";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { canPlan, daysSince, unassignedSoon, visitWho, waitingJobs, type PlanWho } from "@/features/schedule";
import { jobStatusView } from "@/features/jobs";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, ChoiceChips, IconButton, StatusChip, TextField } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Divider, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { ListCard, type CardLead } from "@/ui/listCard";
import type { Density, FactKey } from "@/ui/listCardLayout";

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
      {propertyId ? (
        <VisitFormSheet
          visible
          onClose={() => { setPropertyId(null); close(); }}
          title={t("vf.addInspection")}
          saveLabel={t("lead.next.book")}
          init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, propertyId, day: onDay }}
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
  const density = usePlanDensity();
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

/**
 * One day of the Week strip and of the Month (24 §B): the date, the number of the Feed's items («В плане: N» to a screen
 * reader), yellow only when an open visit has nobody on it; a day off of the picked person is the word «выходной»,
 * no colour. The picked day is an ink frame on surf2 (not the accent); today is bold. Tap → the Day.
 */
export function DayCell({ day, load, selected, dim, head, onPress }: { day: DayKey; load?: DayLoad; selected: boolean; dim?: boolean; head?: string; onPress: () => void }) {
  const { t, dayOf } = useI18n();
  const { c } = useTheme();
  const today = day === todayKey();
  const n = load?.n ?? 0;
  const un = load?.unassigned ?? 0;
  // a screen reader hears the day in words, «В плане: N», «Не назначено · N», «выходной» (review of #267)
  const said = [dayOf(day), t("plan5.planned", { n }), un ? t("plan5.unassigned", { n: un }) : null, load?.dayOff ? t("plan5.dayOff") : null].filter(Boolean).join(", ");
  return (
    <Press
      onPress={onPress}
      visibleHeight={component.rowCompact}
      accessibilityRole="button"
      accessibilityLabel={said}
      testID={`plan-day-${day}`}
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
      {n ? <StatusChip status={un ? "warn" : "info"} label={String(n)} soft /> : null}
      {load?.dayOff ? (
        // a cell of the strip is ~46 px on a phone: the short word; the screen reader hears the whole one
        <T v="micro" tone="mut" numberOfLines={1}>
          {t("plan5.dayOffShort")}
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
  const span = until ? `${when} ${until}` : when;
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


/** desktop: a row-card with columns (06 §4); phone and tablet: the regular card in one column — the Feed is a timeline */
function usePlanDensity(): Density {
  const { device } = useDevice();
  return device === "desktop" ? "row" : "regular";
}
