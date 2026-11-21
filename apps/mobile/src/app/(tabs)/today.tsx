import { useMemo } from "react";
import { Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { visitDueCents } from "@/features/visitDue";
import { lateAfterOf } from "@/features/scheduleSettings";
import { daysSince, isAssigned, isOpenVisit, visitEnd } from "@/features/schedule";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import { awaitingCounts, funnelShare, periodNumbers, prevReceivedCents, receivedBuckets, receivedIndex, receivedSoFar, type Bucket, type Period, type ReceivedIndex } from "@/features/metrics";
import { todayKey } from "@/features/calendar";
import { formatDayKey, getZone, minuteIn } from "@/features/zone";
import { plateHalves, problemSummary, quietStatuses } from "@/features/planSlots";
import { timeLead } from "@/features/planFeed";
import { Columns } from "@/ui/charts";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { attentionHref, buildAttention } from "@/features/attention";
import { waitParams } from "@/features/shortTime";
import { startsIn, useAttentionNow, useEnRoute, useGreeting, useHomeHeader } from "@/features/AttentionCards";
import { todayVisits, visitStatus } from "@/features/visits";
import { crewNow } from "@/features/crewList";
import { roadShort, visitWho, waitShort } from "@/features/shortTime";
import { visitContext } from "@/data/selectors";
import { useTick } from "@/features/sheets";
import { CompanySetupCard, FirstStepsCard } from "@/features/SetupCards";
import { Segmented } from "@/ui/controls";
import { Collapsible } from "@/ui/collapsible";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { mapsUrl } from "@/ui/listCardLayout";
import type { NowCardProps } from "@/ui/nowCard";
import { Icon, T } from "@/ui/primitives";
import { StatGrid, StatTile } from "@/ui/statTile";
import { Card, RowView } from "@/ui/surfaces";
import { OverviewScreen } from "@/ui/templates";
import type { Visit } from "@/data/types";

/** «Получено» (folded under «Подробнее»): the main number of the period, columns by days / weeks, the change against the span before */
function Received({ period, idx }: { period: Period; idx: ReceivedIndex }) {
  const { t, moneyWhole, lang } = useI18n();
  const { c } = useTheme();
  const today = todayKey();
  const now = minuteIn(Date.now());
  // one engine path for the big number and the columns (rule 8): the columns of the period add up to it
  const total = receivedSoFar(idx, period, today);
  const buckets = receivedBuckets(idx, period, today);
  const prev = prevReceivedCents(idx, period, today, now);
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  const label = (b: Bucket) => (period === "month" ? `${Number(b.from.slice(8))}–${Number(b.to.slice(8))}` : formatDayKey(b.from, { weekday: "short" }, loc));
  const diff = total.cents - prev;
  const vs = period === "today" ? "today2.vsToday" : period === "week" ? "today2.vsWeek" : "today2.vsMonth";
  const change = prev > 0 && diff !== 0 ? t("today2.change", { arrow: diff > 0 ? "▲" : "▼", amount: moneyWhole(Math.abs(diff)), vs: t(vs) }) : undefined;
  const empty = buckets.every((b) => b.cents === 0);
  const chart = t("today2.chartA11y", { list: buckets.filter((b) => !b.future).map((b) => `${label(b)} ${moneyWhole(b.cents)}`).join(", ") });
  return (
    <Card
      onPress={() => router.push(`/figures/received?period=${period}`)}
      accessibilityLabel={[`${t("today.received")}: ${moneyWhole(total.cents)}`, change, empty ? t("today2.empty") : chart].filter(Boolean).join(". ")}
      style={{ gap: space[3] }}
    >
      <RowView gap={space[1]}>
        <Icon name="wallet" s={size.iconSm} color={c.mut} />
        <T v="caption" tone="mut" style={{ flex: 1 }} numberOfLines={1}>
          {t("today.received")}
        </T>
        {/* growth is not a status — an arrow and words, no colour (spec 24 A3) */}
        {change ? (
          <T v="caption" tone="mut" tabular numberOfLines={1}>
            {change}
          </T>
        ) : null}
      </RowView>
      <View>
        <T v="display" w="semibold" tabular numberOfLines={1}>
          {moneyWhole(total.cents)}
        </T>
        <T v="caption" tone="mut">
          {t("today.nPayments", { n: total.count })}
        </T>
      </View>
      <Columns
        testID="received-chart"
        items={buckets.map((b) => ({ key: b.from, value: b.cents, label: label(b), valueLabel: moneyWhole(b.cents), current: b.current, future: b.future }))}
      />
      {/* nothing came in yet: only the tracks and this line (spec 24 A, e2e 116) */}
      {empty ? (
        <T v="caption" tone="mut">
          {t("today2.empty")}
        </T>
      ) : null}
    </Card>
  );
}

/** how many visits of the crews the Overview lists before «План ›» */
const CREW_MAX = 6;

/**
 * «Главная» of the office — template «Обзор» (BUILD-SPEC §2.1, wireframes v2 №1, LAYOUT-RULES §3).
 * Работа экрана: что мне делать сейчас — следующий выезд и что горит.
 * The greeting with search · bell · profile and «＋» → «Дальше» (the NowCard, the ONE main button: «В пути» on my own visit,
 * «Открыть выезд» on a crew's, the first verb of «Требует действия» when the day is over) → «Требует действия» (≤ 3, «Все ›»)
 * → the tiles 2×2 (each opens its filtered list) → «Сегодня у бригад» (rows of the day, «Назначить» on a visit with no tech)
 * → «Подробнее» (folded: the period, «Получено» with columns, the funnel) → the setup of a new company.
 */
export default function Today() {
  useTick();
  const { t, time, day: dayOf, moneyWhole, tn, duration } = useI18n();
  const { db, role, rejectedOps, mode } = useStore();
  const greeting = useGreeting();
  const header = useHomeHeader();
  const [period, setPeriod] = usePersistentState<Period>("octo.todayPeriod.v1", "today");
  const [details, setDetails] = usePersistentState<boolean>("octo.todayDetails.v1", false);
  // the company's day and zone are part of the key: left open overnight the numbers move to the new day (review #270)
  const today = todayKey();
  const zone = getZone();
  const n = useMemo(() => periodNumbers(db, period, today), [db, period, today]);
  const idx = useMemo(() => receivedIndex(db.payments, zone), [db.payments, zone]);
  // a money change the server refused is first here too (docs/specs/23 §3)
  const attention = buildAttention(db, role, undefined, { rejected: rejectedOps, mode });
  const att = useAttentionNow(attention);
  const aw = awaitingCounts(db);
  const got = receivedSoFar(idx, "today", today);
  const leadsWaiting = attention.filter((x) => x.kind === "lead");
  // a refused money change is never only a tile away (docs/specs/23 §3, rule 6): its own row above the tiles until it is sorted out
  const refused = attention.filter((x) => x.kind === "rejected");
  const longest = Math.max(0, ...leadsWaiting.map((x) => Number(x.params.m) || 0));
  const estWaiting = db.estimates.filter((e) => e.status === "sent").length;

  // «Дальше»: the next visit of the day; the running ones are in «Сегодня у бригад»
  const day = todayVisits(db);
  // a visit nobody started whose window is over is «Пропущен» (a row of «Сегодня у бригад»), never «Дальше» with «В пути»
  const nowMs = Date.now();
  const { current, next } = crewNow(day.filter((x) => isOpenVisit(x) && !(x.step === "scheduled" && Date.parse(visitEnd(x)) <= nowMs)));
  const v: Visit | undefined = next ?? current;
  const enRoute = useEnRoute(v);
  const nextCard = ((): Omit<NowCardProps, "testID"> => {
    if (!v) {
      // the day has no more visits: the first of «Требует действия» is the step («Ответить Kevin»)
      const first = att.lines.find((x) => x.verb);
      if (first?.verb)
        return {
          kicker: t("todayR.next"),
          status: { status: first.status, label: first.chip },
          title: first.name,
          sub: first.reason,
          main: { label: t("proto.home.verbFor", { verb: first.verb.label, name: first.name.split(/\s+/)[0] ?? "" }), onPress: first.verb.onPress, testID: "home-main-verb" },
        };
      return { kicker: t("todayR.next"), empty: t("todayR.noVisits") };
    }
    const { customer, property, job } = visitContext(db, v);
    const running = v.step !== "scheduled";
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
    const mine = isAssigned(v, db.me);
    // «мастер»: the assignee's first name; a sub — its company and «субподрядчик» (bug 20.11: «Valley · мастер»); nobody — «Не назначен»
    const who = visitWho(v, db.members, t);
    const tel = customer?.phone?.replace(/[^\d+]/g, "");
    const addr = property ? `${property.address}, ${property.city}` : undefined;
    // visual v2 макет 1: «1420 Oak Grove Ave, Pasadena» — the street and the city, no state and zip in the card's one line
    const place = property ? [property.address, property.place?.city ?? property.city.split(",")[0]].filter(Boolean).join(", ") : undefined;
    const soon = running ? undefined : startsIn(v.start, Date.now(), t);
    // «8:30–12:30 PM»: one «PM» when both ends share it (planSlots.plateHalves)
    const [a, b] = plateHalves(time(v.start), time(visitEnd(v)));
    const due = visitDueCents(db, v);
    // «в дороге»: only what the visit knows — the minutes since the tech left (`enRouteAt`); the demo has no route time to the address
    // (no geo of the properties), so a visit not on its way says what is due on it instead (px1, report 21.11)
    // short words (bug 20.11: «20 ч 26 мин в дороге»): «25 мин», «2 ч», past 3 h — since when («с 8:34», «с вчера»)
    const road = v.step === "en_route" && v.enRouteAt ? roadShort(v.enRouteAt, Date.now(), t, { time, day: dayOf }) : null;
    return {
      kicker: t(running ? "px1.now" : "todayR.next"),
      soon,
      window: v.allDay ? t("plan5.allDay") : `${a}–${b}`,
      big: true,
      status: running || !soon ? (st.status === "neutral" ? undefined : { status: st.status, label: t(st.label) }) : undefined,
      title: customer?.name ?? db.leads.find((l) => l.id === v.leadId)?.name ?? "—",
      // visual v2 «Дальше»: «работа · адрес» in one quiet line; the route is the dark button of the pair, not a link
      // v2 макет 1 «Bathroom remodel · 1420 Oak Grove Ave, Pasadena»: the job's name before its «: details», so the address fits the line
      // #2363 F22: the job and the address are two lines — the address is never cut in the middle of a word
      sub: [job?.title.split(":")[0]?.trim(), place].filter(Boolean).join("\n"),
      // «Работа · 0 из 4 · 0 %» — the visit's work list in words (no bar)
      progress: v.checklist.length ? { caption: t("px1.work"), value: v.checklist.filter((x) => x.done).length, max: v.checklist.length, label: v.checklist.some((x) => x.done) ? t("w2a.ofN", { a: v.checklist.filter((x) => x.done).length, b: v.checklist.length }) : tn("r1.itemsN", v.checklist.length) } : undefined,
      // «тройка цифр»: how long on site · on the way (or what is due) · who
      trio: [
        { value: v.allDay ? t("plan5.allDay") : duration(v.durationMin), label: t("w2a.onSite") },
        road !== null ? { value: road, label: t("px1.onRoad") } : due > 0 ? { value: moneyWhole(due), label: t("px1.due") } : { value: t("w2a.ofN", { a: v.checklist.filter((x) => x.done).length, b: v.checklist.length }), label: t("w2a.checklist") },
        { value: who.value, label: who.label },
      ],
      // my own visit not started — «✓ В пути» (the same step as on the visit); a crew's or a running one — open it
      main:
        !running && mine
          ? { label: t("proto.visit.enRoute"), onPress: enRoute.go, testID: "home-main-en-route" }
          : { label: t("todayR.openVisit"), onPress: () => router.push(`/visit/${v.id}`), testID: "home-main-open" },
      mainIcon: !running && mine ? "check" : undefined,
      // the pair is the driver's: «В пути» · «Маршрут» · «☎» on my own visit; a crew's one only opens
      second: addr && !running && mine ? { label: t("proto.visit.route"), icon: "route", onPress: () => void Linking.openURL(mapsUrl(addr, Platform.OS)).catch(() => {}), testID: "home-route" } : undefined,
      icon: tel && !running && mine ? { icon: "phone", a11y: `${t("proto.visit.call")} ${customer?.name ?? ""}`, onPress: () => void Linking.openURL(`tel:${tel}`).catch(() => {}), testID: "home-call" } : undefined,
    };
  })();

  // «Сегодня у бригад» (v2 макет 1): a card per visit — the hour in the square 40, the client 15/700, «работа · мастер» 12, a pill on the
  // right; a problem (late, missed, no tech) is a pill on its FIRST row only, the others say it as a quiet word (audit 12 §2.3)
  const crew = day.slice(0, CREW_MAX);
  const crewSt = crew.map((x) => {
    const free = !(x.assigneeIds ?? (x.techId ? [x.techId] : [])).some((id) => db.members.some((m) => m.id === id));
    if (free) return { status: "warn" as const, label: t("proto.home.noTech"), kind: null };
    const st = visitStatus(x, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, x));
    const kind = st.label === "st.missed" ? ("missed" as const) : st.label === "late.enRoute" || st.label === "late.notLeft" ? ("late" as const) : null;
    // «Запланирован» says nothing more than its hour
    return x.step === "scheduled" && st.status === "neutral" ? undefined : { status: st.status, label: kind === "late" ? t("st.late") : t(st.label), kind };
  });
  const crewShown = quietStatuses(crewSt.map((s) => s?.status));
  const sum = problemSummary(crewSt.map((s) => s?.kind));
  const crewRows = crew.map((x, i) => {
    const { customer, job } = visitContext(db, x);
    const name = customer?.name ?? db.leads.find((l) => l.id === x.leadId)?.name ?? "—";
    const techs = (x.assigneeIds ?? (x.techId ? [x.techId] : [])).map((id) => db.members.find((m) => m.id === id)?.name?.split(/\s+/)[0]).filter(Boolean).join(", ");
    const s = crewSt[i];
    // #2363 F20/F24: a row of ONE group (rule 12); the line is «работа · мастер» only, the state is a one-word pill on every
    // row whose state says more than its hour — never glued into the line
    // the office's overview: every state beyond «Запланирован» is a pill («Идёт работа» says which crew works)
    const odd = !!s;
    return (
      <GroupRow
        key={x.id}
        testID="crew-row"
        wrap
        lead={x.allDay ? { icon: "calendar" } : { time: timeLead(time(x.start)).top, sub: timeLead(time(x.start)).bottom || undefined }}
        title={name}
        subtitle={[job?.title?.split(":")[0]?.trim() ?? t("st.inspection"), techs].filter(Boolean).join(" · ")}
        status={odd ? { status: s.status, label: s.label } : undefined}
        onPress={() => router.push(`/visit/${x.id}`)}
      />
    );
  });
  void crewShown;
  void sum;
  // «Сметы ждут · до 6 дн»: the longest wait of a sent estimate
  const estDays = Math.max(0, ...db.estimates.filter((e) => e.status === "sent").map((e) => daysSince(e.sentAt) ?? 0));

  return (
    <OverviewScreen
      testID="today"
      title={greeting}
      greeting={header.greeting}
      headerIcons={header.icons}
      create={header.create}
      onCreate={header.onCreate}
      next={nextCard}
    >
      {/* v2 макет 1: «Требует действия» is the 2 × 2 tiles (the rows of the queue are «Все ›» — Triage); each opens exactly the records
          it counts (founder 05.11); a zero tile is not drawn; none is yellow — the Home's one yellow is «В пути» */}
      {refused.length ? (
        <ListGroup testID="today-refused">
          {refused.map((it) => (
            <GroupRow
              key={it.id}
              testID={`home-${it.id}`}
              title={t(it.label, waitParams(it.params, t))}
              status={{ status: it.status, label: t(it.chip, waitParams(it.params, t)) }}
              lead={{ icon: "alert" }}
              onPress={() => router.push(attentionHref(it))}
            />
          ))}
        </ListGroup>
      ) : null}
      <ListGroup title={t("todayR.action")} all={{ label: t("todayR.all"), onPress: () => router.push("/triage"), testID: "home-attention-all" }} bare testID="today-attention">
        <StatGrid testID="today-tiles">
          <StatTile testID="tile-leads" icon="leads" dense label={t("proto.home.tile.leads")} value={leadsWaiting.length} unit={longest ? t("px1.tile.leadsWait", { m: waitShort(longest, t) }) : undefined} onPress={() => router.push("/leads")} />
          <StatTile testID="tile-estimates" icon="doc" dense label={t("px1.tile.estimates")} value={estWaiting} unit={estDays ? t("px1.tile.estDays", { n: estDays }) : undefined} onPress={() => router.push("/estimates")} />
          <StatTile testID="tile-owed" icon="dollar" dense label={t("proto.home.tile.owed")} value={moneyWhole(n.awaitingCents)} unit={aw.overdue ? t("px1.tile.overdue", { n: aw.overdue }) : undefined} unitTone="bad" onPress={() => router.push("/invoice?f=owed")} />
          <StatTile testID="tile-received" icon="trend" dense label={t("proto.home.tile.received")} value={moneyWhole(got.cents)} unit={got.count ? tn("px1.payN", got.count) : undefined} onPress={() => router.push("/figures/received?period=today")} />
        </StatGrid>
      </ListGroup>
      <ListGroup title={t("proto.home.crews")} all={{ label: t("plan.title"), onPress: () => router.push("/plan"), testID: "crew-plan" }} testID="today-crews">
        {crewRows}
      </ListGroup>
      {/* the chart and the funnel are details (П9): folded by default, the choice is kept */}
      <Collapsible testID="today-details" title={t("todayR.details")} open={details} onToggle={setDetails}>
        <View style={{ gap: space[3] }}>
          <Segmented<Period>
            testID="today-period"
            value={period}
            onChange={setPeriod}
            items={[
              { key: "today", label: t("today.title") },
              { key: "week", label: t("plan.week") },
              { key: "month", label: t("plan.month") },
            ]}
          />
          <Received period={period} idx={idx} />
          <ListGroup title={t("today.funnel")} inset={space[4]}>
            <GroupRow testID="today-f-leads" title={t("today.f.leads")} value={String(n.leads)} onPress={() => router.push(`/figures/leads?period=${period}`)} />
            <GroupRow
              testID="today-f-sent"
              title={t("today.f.sent")}
              subtitle={funnelShare(n.sent, n.leads) === undefined ? undefined : t("today2.ofLeads", { n: funnelShare(n.sent, n.leads)! })}
              value={String(n.sent)}
              onPress={() => router.push(`/figures/sent?period=${period}`)}
            />
            <GroupRow
              testID="today-f-signed"
              title={t("today.f.signed")}
              subtitle={[moneyWhole(n.signedCents), funnelShare(n.signed, n.sent) === undefined ? undefined : t("today2.ofSent", { n: funnelShare(n.signed, n.sent)! })].filter(Boolean).join(" · ")}
              value={String(n.signed)}
              onPress={() => router.push(`/figures/signed?period=${period}`)}
            />
          </ListGroup>
        </View>
      </Collapsible>
      <CompanySetupCard />
      <FirstStepsCard />
      {att.sheets}
      {enRoute.sheet}
    </OverviewScreen>
  );
}
