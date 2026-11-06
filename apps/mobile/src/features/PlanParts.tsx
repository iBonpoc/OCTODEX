import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID, Task } from "@/data/types";
import { findJob } from "@/data/jobs";
import { visitPropertyId } from "@/data/selectors";
import { todayKey, type DayKey } from "@/features/calendar";
import { lateAfterOf, scheduleSettingsOf } from "@/features/scheduleSettings";
import { visitStatus } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { groupByDay, itemTimes, type PlanItem } from "@/features/planFeed";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { daysSince, unassignedSoon, visitWho, waitingJobs, type PlanWho } from "@/features/schedule";
import { memberName } from "@/features/team";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Divider, ItemCard, ListRow, SectionTitle } from "@/ui/surfaces";

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
export function PlanAddSheet({ visible, onClose, onEvent }: { visible: boolean; onClose: () => void; onEvent?: (kind: CalendarEventKind) => void }) {
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
          init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, propertyId }}
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
              title={`${dd === 0 ? t("plan5.today") : t("plan5.tomorrow")} · ${time(v.start)} · ${client}`}
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

/** «Лента»: the days one under another, every item a card; an empty day says so */
export function FeedView({ days, items, onEvent }: { days: DayKey[]; items: PlanItem[]; onEvent?: (e: CalendarEvent) => void }) {
  const { t, dayOf } = useI18n();
  return (
    <View style={{ gap: space[4] }} testID="plan-feed">
      {groupByDay(items, days).map(({ day, items: list }) => (
        <View key={day} style={{ gap: space[2] }}>
          <SectionTitle title={`${day === todayKey() ? `${t("common.today")} · ` : ""}${dayOf(day)}`} />
          {list.length ? (
            <CardList>
              {list.map((x) => (
                <FeedCard key={`${x.kind}:${x.id}:${day}`} x={x} onEvent={onEvent} />
              ))}
            </CardList>
          ) : (
            <T v="caption" tone="mut">
              {t("plan5.emptyDay")}
            </T>
          )}
        </View>
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
    const st = visitStatus(v, Date.now(), lateAfterOf(db), db.members);
    const status = st.status;
    return (
      <ItemCard
        status={status}
        title={`${when} · ${client || "—"}`}
        subtitle={[until, v.kind === "inspection" ? t("plan.kind.inspection") : t("plan.kind.job"), job?.number, property?.address, names || t("plan.unassigned")].filter(Boolean).join(" · ")}
        right={<StatusChip status={status} label={t(st.label)} />}
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
