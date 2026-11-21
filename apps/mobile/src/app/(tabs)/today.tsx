import { useMemo, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { visitDueCents } from "@/features/visitDue";
import { lateAfterOf } from "@/features/scheduleSettings";
import { isAssigned, isOpenVisit, visitWhen } from "@/features/schedule";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import { awaitingCounts, funnelShare, periodNumbers, prevReceivedCents, receivedBuckets, receivedIndex, receivedSoFar, type Bucket, type Period, type ReceivedIndex } from "@/features/metrics";
import { todayKey } from "@/features/calendar";
import { formatDayKey, getZone, minuteIn } from "@/features/zone";
import { Columns } from "@/ui/charts";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { buildAttention } from "@/features/attention";
import { startsIn, useAttentionNow, useEnRoute, useGreeting, useHomeHeader } from "@/features/AttentionCards";
import { todayVisits, visitStatus } from "@/features/visits";
import { crewNow } from "@/features/crewList";
import { visitContext } from "@/data/selectors";
import { AssignSheet, useTick } from "@/features/sheets";
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
  const { t, time, moneyWhole, tn } = useI18n();
  const { db, role, rejectedOps, mode } = useStore();
  const greeting = useGreeting();
  const header = useHomeHeader();
  const [period, setPeriod] = usePersistentState<Period>("octo.todayPeriod.v1", "today");
  const [details, setDetails] = usePersistentState<boolean>("octo.todayDetails.v1", false);
  const [assign, setAssign] = useState<string | null>(null);
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
  const longest = Math.max(0, ...leadsWaiting.map((x) => Number(x.params.m) || 0));
  const estWaiting = db.estimates.filter((e) => e.status === "sent").length;
  const estLate = attention.filter((x) => x.kind === "estimate" && x.status === "bad").length;

  // «Дальше»: the next visit of the day; the running ones are in «Сегодня у бригад»
  const day = todayVisits(db);
  const { current, next } = crewNow(day.filter(isOpenVisit));
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
    const techs = (v.assigneeIds ?? (v.techId ? [v.techId] : [])).map((id) => db.members.find((m) => m.id === id)?.name).filter(Boolean).join(", ");
    const addr = property ? `${property.address}, ${property.city}` : undefined;
    const when = visitWhen(v, time, t("plan5.allDay"), false);
    const running = v.step !== "scheduled";
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
    const mine = isAssigned(v, db.me);
    return {
      kicker: t(running ? "proto.home.now" : "proto.home.next", { time: when }),
      when: running ? undefined : startsIn(v.start, Date.now(), t),
      status: running || !startsIn(v.start, Date.now(), t) ? { status: st.status, label: t(st.label) } : undefined,
      title: customer?.name ?? db.leads.find((l) => l.id === v.leadId)?.name ?? "—",
      sub: [job?.title, techs || t("proto.home.noTech")].filter(Boolean).join(" · "),
      address: addr ? { text: addr, a11y: t("proto.home.route", { addr }), onPress: () => void Linking.openURL(mapsUrl(addr, Platform.OS)).catch(() => {}) } : undefined,
      // my own visit not started — «В пути» (the same step as on the visit); a crew's or a running one — open it
      main:
        !running && mine
          ? { label: t("proto.visit.enRoute"), reason: t("proto.visit.enRouteWhy"), onPress: enRoute.go, testID: "home-main-en-route" }
          : { label: t("todayR.openVisit"), reason: techs && !mine ? t("todayR.tech", { name: techs }) : undefined, onPress: () => router.push(`/visit/${v.id}`), testID: "home-main-open" },
    };
  })();

  // «Сегодня у бригад»: the day by time — the hour and the client, «работа · мастер», the visit's status; no tech → «Назначить»
  const crewRows = day.slice(0, CREW_MAX).map((x) => {
    const { customer, job } = visitContext(db, x);
    const name = customer?.name ?? db.leads.find((l) => l.id === x.leadId)?.name ?? "—";
    const techs = (x.assigneeIds ?? (x.techId ? [x.techId] : [])).map((id) => db.members.find((m) => m.id === id)?.name?.split(/\s+/)[0]).filter(Boolean).join(", ");
    const st = visitStatus(x, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, x));
    const free = !techs;
    return (
      <GroupRow
        key={x.id}
        testID="crew-row"
        // the name first and whole; the hour leads the line under it (a 56 row has no time column — request to поток А)
        title={name}
        subtitle={[x.allDay ? t("plan5.allDay") : time(x.start), job?.title ?? t("st.inspection"), techs].filter(Boolean).join(" · ")}
        // a scheduled visit says nothing more than its hour: a pill only for what changed (in work, late, done); «Без мастера» once
        status={free ? { status: "warn", label: t("proto.home.noTech") } : x.step === "scheduled" && st.status === "neutral" ? undefined : { status: st.status, label: t(st.label) }}
        actions={free ? [{ icon: "user", a11y: t("proto.home.assign", { name }), onPress: () => setAssign(x.id), testID: "crew-assign" }] : []}
        onPress={() => router.push(`/visit/${x.id}`)}
      />
    );
  });

  return (
    <OverviewScreen
      testID="today"
      title={greeting}
      greeting={header.greeting}
      headerIcons={header.icons}
      create={header.create}
      onCreate={header.onCreate}
      next={nextCard}
      attention={{ title: t("todayR.action"), rows: att.rows, all: { label: t("todayR.all"), onPress: () => router.push("/triage") } }}
    >
      {/* the tiles: what burns and the money of today; each opens exactly the records it counts (founder 05.11); a zero tile is not drawn */}
      <StatGrid testID="today-tiles">
        <StatTile testID="tile-leads" icon="inbox" label={t("proto.home.tile.leads")} value={leadsWaiting.length} sub={longest ? t("proto.home.tile.leadsWarn", { m: longest }) : undefined} warn={longest ? t("proto.home.tile.leadsWarn", { m: longest }) : undefined} onPress={() => router.push("/leads")} />
        <StatTile testID="tile-estimates" icon="doc" label={t("proto.home.tile.estimates")} value={estWaiting} sub={estLate ? t("proto.home.tile.estLate", { n: estLate }) : undefined} warn={estLate ? t("proto.home.tile.estLate", { n: estLate }) : undefined} onPress={() => router.push("/estimates")} />
        <StatTile testID="tile-owed" icon="invoice" label={t("proto.home.tile.owed")} value={moneyWhole(n.awaitingCents)} sub={aw.overdue ? t("proto.home.tile.overdue", { n: tn("todayR.invN", aw.overdue) }) : undefined} warn={aw.overdue ? t("proto.home.tile.overdue", { n: tn("todayR.invN", aw.overdue) }) : undefined} onPress={() => router.push("/invoice?f=owed")} />
        <StatTile testID="tile-received" icon="wallet" label={t("proto.home.tile.received")} value={moneyWhole(got.cents)} onPress={() => router.push("/figures/received?period=today")} />
      </StatGrid>
      <ListGroup title={t("proto.home.crews")} all={{ label: t("plan.title"), onPress: () => router.push("/plan"), testID: "crew-plan" }} testID="today-crews">
        {crewRows}
      </ListGroup>
      {/* the chart and the funnel are details (П9): folded by default, the choice is kept */}
      <Collapsible testID="today-details" title={t("todayR.details")} open={details} onToggle={setDetails}>
        <View style={{ gap: space[3] }}>
          <Segmented<Period>
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
            <GroupRow title={t("today.f.leads")} value={String(n.leads)} onPress={() => router.push(`/figures/leads?period=${period}`)} />
            <GroupRow
              title={t("today.f.sent")}
              subtitle={funnelShare(n.sent, n.leads) === undefined ? undefined : t("today2.ofLeads", { n: funnelShare(n.sent, n.leads)! })}
              value={String(n.sent)}
              onPress={() => router.push(`/figures/sent?period=${period}`)}
            />
            <GroupRow
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
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
      {att.sheets}
      {enRoute.sheet}
    </OverviewScreen>
  );
}
