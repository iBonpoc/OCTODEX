import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { addDays, addMonths, fromDayKey, isoDayKey, monthGrid, todayKey, weekDays, type DayKey } from "@/features/calendar";
import { VisitCard, sortByStart, visitStatus } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { DndProvider, Draggable, DropZone, useDragFrom } from "@/features/dnd";
import { useToast } from "@/ui/overlays";
import { Avatar, Button, ChoiceChips, IconButton, Segmented, StatusChip } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, CardList, Empty, Grid, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { assigneesOf, canPlan, canReschedule, isAssigned } from "@/features/schedule";

type Mode = "day" | "week" | "month";

/**
 * Plan: Day (by person, drag & drop between people), Week (7 days, each visit a card), Month (calendar with
 * visit counts; tap a day → Day). Arrows move by day / week / month; "Today" jumps back.
 */
export default function Plan() {
  const { t, day, lang } = useI18n();
  const { db, role } = useStore();
  const [mode, setMode] = usePersistentState<Mode>("octo.planMode.v1", "day");
  const [date, setDate] = useState<DayKey>(todayKey());
  const mine = (v: Visit) => role !== "tech" || isAssigned(v, db.me);
  const visitsOn = (k: DayKey) => db.visits.filter((v) => isoDayKey(v.start) === k && mine(v)).sort(sortByStart);
  const step = (n: number) => setDate(mode === "day" ? addDays(date, n) : mode === "week" ? addDays(date, 7 * n) : addMonths(date, n));
  const week = weekDays(date);
  const monthName = new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU", { month: "long", year: "numeric" }).format(fromDayKey(date));
  const label =
    mode === "day" ? day(fromDayKey(date).toISOString()) : mode === "week" ? `${day(fromDayKey(week[0]!).toISOString())} – ${day(fromDayKey(week[6]!).toISOString())}` : monthName;

  return (
    <Screen
      title={t("plan.title")}
      help={t("help.plan")}
      hintKey="plan"
      right={
        <Segmented
          value={mode}
          onChange={setMode}
          items={[
            { key: "day", label: t("plan.day") },
            { key: "week", label: t("plan.week") },
            { key: "month", label: t("plan.month") },
          ]}
        />
      }
    >
      <RowView style={{ justifyContent: "space-between" }}>
        <IconButton icon="chevronLeft" label={t("plan.prev")} onPress={() => step(-1)} />
        <T v="heading" style={{ flex: 1, textAlign: "center" }} numberOfLines={1}>
          {label}
        </T>
        {date !== todayKey() ? <Button label={t("common.today")} size="sm" variant="secondary" onPress={() => setDate(todayKey())} /> : null}
        <IconButton icon="chevronRight" label={t("plan.next")} onPress={() => step(1)} />
      </RowView>

      {mode === "day" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            <ChoiceChips
              value={date}
              onChange={setDate}
              nowrap
              items={week.map((k) => {
                const n = visitsOn(k).length;
                const name = k === todayKey() ? t("common.today") : day(fromDayKey(k).toISOString());
                return { key: k, label: n ? `${name} · ${n}` : name };
              })}
            />
          </ScrollView>
          <DayView date={date} visits={visitsOn(date)} />
        </>
      ) : mode === "week" ? (
        <WeekView days={week} visitsOn={visitsOn} openDay={(k) => { setDate(k); setMode("day"); }} />
      ) : (
        <MonthView date={date} visitsOn={visitsOn} openDay={(k) => { setDate(k); setMode("day"); }} />
      )}
    </Screen>
  );
}

/** One day by person; unassigned first; drag a card onto another person to reassign. */
function DayView({ date, visits }: { date: DayKey; visits: Visit[] }) {
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
  const people = db.members.filter((m) => m.roles.includes("tech") && !m.pending && (role !== "tech" || m.id === db.me));
  return (
    <DndProvider key={date}>
      {visits.length === 0 ? <Empty icon="calendar" title={t("plan.empty")} /> : null}
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
  const { t, day, time } = useI18n();
  const { db } = useStore();
  return (
    <Grid>
      {days.map((k) => {
        const vs = visitsOn(k);
        const today = k === todayKey();
        return (
          <View key={k} style={{ gap: space[2] }}>
            <SectionTitle
              title={`${today ? `${t("common.today")} · ` : ""}${day(fromDayKey(k).toISOString())}`}
              right={<Button label={vs.length ? t("plan.visits", { n: vs.length }) : t("plan.free")} size="sm" variant="ghost" onPress={() => openDay(k)} />}
            />
            {vs.length ? (
              <CardList>
                {vs.map((v) => {
                  const job = db.jobs.find((j) => j.id === v.jobId);
                  const p = db.properties.find((x) => x.id === job?.propertyId);
                  const c = db.customers.find((x) => x.id === p?.customerId);
                  const tech = db.members.find((m) => m.id === v.techId);
                  const st = visitStatus(v);
                  return (
                    <ItemCard
                      key={v.id}
                      status={tech ? st.status : "warn"}
                      title={`${time(v.start)} · ${c?.name ?? "—"}`}
                      subtitle={[job?.title, tech?.name ?? t("plan.unassigned")].filter(Boolean).join(" · ")}
                      right={<StatusChip status={tech ? st.status : "warn"} label={tech ? t(st.label) : t("st.unassigned")} />}
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
  const wd = new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU", { weekday: "short" });
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: space[1] }}>
        {weeks[0]!.map((x) => (
          <T key={x.key} v="micro" tone="mut" center style={{ flex: 1 }}>
            {wd.format(fromDayKey(x.key))}
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
