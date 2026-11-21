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
import { isAssigned, visitEnd, visitWhen } from "@/features/schedule";
import { quietStatuses } from "@/features/planSlots";
import { timeLead } from "@/features/planFeed";
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
  const { t, tn, time, day, moneyWhole, duration } = useI18n();
  const { db, queue, online } = useStore();
  const greeting = useGreeting();
  const header = useHomeHeader();
  const d = techDay(db, db.me);
  // the next not over: a visit whose window has ended without him is «Пропущен» in the rest of the day, never «Дальше · В пути»
  const nowMs = Date.now();
  const next = d.visits.find((v) => v.step === "scheduled" && !v.closed && Date.parse(visitEnd(v)) > nowMs);
  const focus: Visit | undefined = d.current ?? next;
  const enRoute = useEnRoute(focus);
  const today = todayKey();

  const nextCard = ((): Omit<NowCardProps, "testID"> => {
    if (!focus) {
      // all closed (or a free day): no button — when and what is next («Завтра 9:00 · итоговый обход»)
      const later = db.visits.filter((v) => isAssigned(v, db.me) && isoDayKey(v.start) > today).sort((a, b) => a.start.localeCompare(b.start))[0];
      const what = later ? (visitContext(db, later).job?.title ?? visitContext(db, later).customer?.name ?? "") : "";
      return {
        // «все закрыты» only when they are: missed ones are not closed
        kicker: d.visits.length && d.done === d.visits.length ? t("tday.allDone") : t("tday.next"),
        empty: later ? t("proto.home.laterOn", { day: day(later.start), time: visitWhen(later, time, t("plan5.allDay"), false), what }) : t("visits.empty"),
      };
    }
    const { customer, property, job } = visitContext(db, focus);
    const lead = focus.leadId ? db.leads.find((l) => l.id === focus.leadId) : undefined;
    const addr = property ? `${property.address}, ${property.city}` : undefined;
    const running = focus.step !== "scheduled";
    const st = visitStatus(focus, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, focus));
    const soon = running ? undefined : startsIn(focus.start, Date.now(), t);
    const tel = (customer?.phone ?? lead?.phone)?.replace(/[^\d+]/g, "");
    return {
      kicker: t(running ? "proto.home.now" : "proto.home.next", { time: visitWhen(focus, time, t("plan5.allDay"), false) }),
      when: soon,
      status: soon ? undefined : { status: st.status, label: t(st.label) },
      title: customer?.name ?? lead?.name ?? "—",
      // visual v2 «Дальше»: «работа · адрес» in one line, the route — the dark button of the pair; the «тройка цифр»; no hint
      sub: [job?.title ?? lead?.service, addr].filter(Boolean).join(" · "),
      trio: [
        { value: focus.allDay ? t("plan5.allDay") : duration(focus.durationMin), label: t("w2a.onSite") },
        { value: t("w2a.ofN", { a: focus.checklist.filter((x) => x.done).length, b: focus.checklist.length }), label: t("w2a.checklist") },
        { value: focus.scope.length ? String(focus.scope.length) : "—", label: t("visit.scope") },
      ],
      main: running
        ? { label: t("proto.home.continue"), onPress: () => router.push(`/visit/${focus.id}`), testID: "home-main-continue" }
        : { label: t("proto.visit.enRoute"), onPress: enRoute.go, testID: "home-main-en-route" },
      second: addr && !running ? { label: t("proto.visit.route"), icon: "route", onPress: () => void Linking.openURL(mapsUrl(addr, Platform.OS)).catch(() => {}), testID: "home-route" } : undefined,
      icon: tel && !running ? { icon: "phone", a11y: `${t("proto.visit.call")} ${customer?.name ?? ""}`, onPress: () => void Linking.openURL(`tel:${tel}`).catch(() => {}), testID: "home-call" } : undefined,
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
  // one pill for a problem — on its first row; the others say it as a word (audit 12 §2.3: a wall of «Пропущен» / «Опаздывает»)
  const restSt = rest.map((v) => {
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
    return v.step === "scheduled" && st.status === "neutral" ? undefined : st;
  });
  const restShown = quietStatuses(restSt.map((s) => s?.status));
  return (
    <OverviewScreen
      testID="visits"
      title={greeting}
      greeting={header.greeting}
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
        <StatTile testID="tile-collected" icon="dollar" label={t("proto.home.tile.collected")} value={moneyWhole(d.collectedCents)} />
        <StatTile
          testID="tile-visits"
          icon="calendar"
          label={t("proto.home.tile.visits")}
          sub={t("proto.home.tile.closed", { n: d.done })}
          value={d.visits.length}
          warn={d.awaitingPay ? t("tday.awaitingPay", { n: d.awaitingPay }) : undefined}
          a11y={[tn("visits.today", d.visits.length), t("tday.progress", { done: d.done, n: d.visits.length })].join(", ")}
          onPress={() => router.push("/plan")}
        />
      </StatGrid>
      <ListGroup title={t("proto.home.restToday")} all={{ label: t("plan.title"), onPress: () => router.push("/plan"), testID: "visits-plan" }} testID="visits-rest">
        {rest.map((v, i) => {
          const { customer, job } = visitContext(db, v);
          const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
          const st = restSt[i];
          const hm = timeLead(time(v.start));
          return (
            <GroupRow
              key={v.id}
              testID="visits-row"
              lead={v.allDay ? { icon: "calendar" } : { time: hm.top, sub: hm.bottom || undefined }}
              title={customer?.name ?? lead?.name ?? "—"}
              subtitle={[st && restShown[i] === "word" ? t(st.label) : null, job?.title ?? lead?.service].filter(Boolean).join(" · ")}
              status={st && restShown[i] === "pill" ? { status: st.status, label: t(st.label) } : undefined}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </ListGroup>
      {enRoute.sheet}
    </OverviewScreen>
  );
}
