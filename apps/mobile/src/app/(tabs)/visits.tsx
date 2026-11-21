import { Linking, Platform } from "react-native";
import { router } from "expo-router";
import { lateAfterOf } from "@/features/scheduleSettings";
import { visitDueCents } from "@/features/visitDue";
import { useI18n } from "@/i18n";
import { useStore } from "@/data/store";
import { techDay } from "@/features/techDay";
import { visitStatus } from "@/features/visits";
import { visitContext } from "@/data/selectors";
import type { Visit } from "@/data/types";
import { useTick } from "@/features/sheets";
import { isAssigned, visitWhen } from "@/features/schedule";
import { isoDayKey, todayKey } from "@/features/calendar";
import { startsIn, useEnRoute, useGreeting, useHomeHeader } from "@/features/AttentionCards";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { mapsUrl } from "@/ui/listCardLayout";
import type { NowCardProps } from "@/ui/nowCard";
import { StatGrid, StatTile } from "@/ui/statTile";
import { OverviewScreen } from "@/ui/templates";

/** «Задачи и фото» shows this many rows before «Все ›» (the template shows three) */
const TASKS_ALL = "/tasks";

/**
 * «Мой день» of the technician — template «Обзор» (BUILD-SPEC §2.14, wireframes v2 №18).
 * Работа экрана: куда ехать и что делать сейчас.
 * The greeting with sync (only when something is unsent or there is no network) · search · profile and «＋» → «Сейчас / Дальше»
 * (the NowCard with the ONE main step: «В пути» → «Продолжить выезд»; all closed — no button, «Завтра 9:00 · …») → «Задачи и
 * фото» (the queue without network, his tasks of today) → the tiles 1×2 «Собрал сегодня» · «Выезды» → the rest of his day.
 * Only his own: no company money, no bell, no «Без мастера».
 */
export default function Visits() {
  useTick();
  const { t, tn, time, day, moneyWhole } = useI18n();
  const { db, queue, online } = useStore();
  const greeting = useGreeting();
  const header = useHomeHeader();
  const d = techDay(db, db.me);
  const focus: Visit | undefined = d.current ?? d.next;
  const enRoute = useEnRoute(focus);
  const today = todayKey();

  const nextCard = ((): Omit<NowCardProps, "testID"> => {
    if (!focus) {
      // all closed (or a free day): no button — when and what is next («Завтра 9:00 · итоговый обход»)
      const later = db.visits.filter((v) => isAssigned(v, db.me) && isoDayKey(v.start) > today).sort((a, b) => a.start.localeCompare(b.start))[0];
      const what = later ? (visitContext(db, later).job?.title ?? visitContext(db, later).customer?.name ?? "") : "";
      return {
        kicker: d.visits.length ? t("tday.allDone") : t("tday.next"),
        empty: later ? t("proto.home.laterOn", { day: day(later.start), time: visitWhen(later, time, t("plan5.allDay"), false), what }) : t("visits.empty"),
      };
    }
    const { customer, property, job } = visitContext(db, focus);
    const lead = focus.leadId ? db.leads.find((l) => l.id === focus.leadId) : undefined;
    const addr = property ? `${property.address}, ${property.city}` : undefined;
    const running = focus.step !== "scheduled";
    const st = visitStatus(focus, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, focus));
    const soon = running ? undefined : startsIn(focus.start, Date.now(), t);
    return {
      kicker: t(running ? "proto.home.now" : "proto.home.next", { time: visitWhen(focus, time, t("plan5.allDay"), false) }),
      when: soon,
      status: soon ? undefined : { status: st.status, label: t(st.label) },
      title: customer?.name ?? lead?.name ?? "—",
      sub: job?.title ?? lead?.service,
      address: addr ? { text: addr, a11y: t("proto.home.route", { addr }), onPress: () => void Linking.openURL(mapsUrl(addr, Platform.OS)).catch(() => {}) } : undefined,
      main: running
        ? { label: t("proto.home.continue"), onPress: () => router.push(`/visit/${focus.id}`), testID: "home-main-continue" }
        : { label: t("proto.visit.enRoute"), reason: t("proto.visit.enRouteWhy"), onPress: enRoute.go, testID: "home-main-en-route" },
    };
  })();

  // «Задачи и фото»: what waits for the network first (rule 6 — the queue is visible), then his tasks for today and overdue
  const tasks = db.tasks
    .filter((x) => x.assigneeId === db.me && !x.doneAt && x.dueAt && isoDayKey(x.dueAt) <= today)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const rows = [
    ...(queue.length
      ? [
          <GroupRow
            key="queue"
            testID="home-queue"
            lead={{ icon: online ? "cloudUp" : "wifiOff" }}
            title={t("proto.home.queue", { n: queue.length })}
            subtitle={t("proto.home.queueWhy")}
            onPress={() => router.push("/settings/profile")}
          />,
        ]
      : []),
    ...tasks.map((x) => (
      <GroupRow
        key={x.id}
        testID="home-task"
        lead={{ icon: "check" }}
        title={x.title}
        subtitle={x.dueAt && isoDayKey(x.dueAt) < today ? t("proto.home.taskLate", { day: day(x.dueAt) }) : x.dueAt && !x.allDay ? time(x.dueAt) : undefined}
        status={x.dueAt && isoDayKey(x.dueAt) < today ? { status: "bad", label: t("st.overdue") } : undefined}
        onPress={() => router.push(TASKS_ALL)}
      />
    )),
  ];

  // the rest of his day, by time (the focus is in the NowCard — not twice, П7)
  const rest = d.visits.filter((v) => v.id !== focus?.id);
  return (
    <OverviewScreen
      testID="visits"
      title={greeting}
      headerIcons={header.icons}
      create={header.create}
      onCreate={header.onCreate}
      next={nextCard}
      attention={{
        title: t("proto.home.tasks"),
        rows: rows.length ? rows : [<GroupRow key="none" testID="home-no-tasks" title={t("proto.home.noTasks")} compact />],
        all: tasks.length > 3 ? { label: t("todayR.all"), onPress: () => router.push(TASKS_ALL) } : undefined,
      }}
    >
      <StatGrid testID="visits-tiles">
        <StatTile testID="tile-collected" pastel="mint" label={t("proto.home.tile.collected")} value={moneyWhole(d.collectedCents)} />
        <StatTile
          testID="tile-visits"
          pastel="lav"
          label={t("proto.home.tile.visits")}
          sub={t("proto.home.tile.closed", { n: d.done })}
          value={d.visits.length}
          warn={d.awaitingPay ? t("tday.awaitingPay", { n: d.awaitingPay }) : undefined}
          a11y={[tn("visits.today", d.visits.length), t("tday.progress", { done: d.done, n: d.visits.length })].join(", ")}
          onPress={() => router.push("/plan")}
        />
      </StatGrid>
      <ListGroup title={t("proto.home.restToday")} all={{ label: t("plan.title"), onPress: () => router.push("/plan"), testID: "visits-plan" }} testID="visits-rest">
        {rest.map((v) => {
          const { customer, job } = visitContext(db, v);
          const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
          const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
          return (
            <GroupRow
              key={v.id}
              testID="visits-row"
              title={customer?.name ?? lead?.name ?? "—"}
              subtitle={[v.allDay ? t("plan5.allDay") : time(v.start), job?.title ?? lead?.service].filter(Boolean).join(" · ")}
              status={v.step === "scheduled" && st.status === "neutral" ? undefined : { status: st.status, label: t(st.label) }}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </ListGroup>
      {enRoute.sheet}
    </OverviewScreen>
  );
}
