import { useEffect, useMemo, useState } from "react";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { lateAfterOf } from "@/features/scheduleSettings";
import { View } from "react-native";
import { isOpenVisit, visitWhen } from "@/features/schedule";
import { router } from "expo-router";
import { component, font, motion, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import { awaitingCounts, funnelShare, periodNumbers, prevReceivedCents, receivedBuckets, receivedIndex, receivedSoFar, type Bucket, type Figure, type Period, type ReceivedIndex } from "@/features/metrics";
import { todayKey } from "@/features/calendar";
import { formatDayKey, getZone, minuteIn } from "@/features/zone";
import { Columns, Meter } from "@/ui/charts";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { buildAttention } from "@/features/attention";
import { AttentionPeople } from "@/features/AttentionCards";
import { todayVisits, visitStatus } from "@/features/visits";
import { crewNow } from "@/features/crewList";
import { visitContext } from "@/data/selectors";
import { ListCard } from "@/ui/listCard";
import { useTick } from "@/features/sheets";
import { NoticesCard } from "@/features/notices";
import { CompanySetupCard, FirstStepsCard } from "@/features/SetupCards";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Card, Grid, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/** a tile: label · amount · one line of detail (spec 24 A3: two side by side, the label never wraps) */
function Kpi({ label, cents, icon, hint, chip, onPress }: { label: string; cents: number; icon: IconKey; hint?: string; chip?: string; onPress?: () => void }) {
  const { moneyWhole } = useI18n();
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const value = moneyWhole(cents);
  // long amounts in a narrow tile (820 two-up) take the smaller size instead of «…» (unslop 05.11)
  // w is the content width (measured inside the card padding): compare with it once, and show the amount only then
  const small = value.length * font.size.title * 0.65 > w;
  return (
    <Card
      style={{ padding: space[3], flex: 1 }}
      containerStyle={{ flex: 1 }}
      onPress={onPress}
      // the amount and the overdue status are read too, not only the title (review #270)
      accessibilityLabel={[`${label}: ${value}`, hint, chip].filter(Boolean).join(", ")}
    >
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <RowView gap={space[1]}>
          <Icon name={icon} s={size.iconSm} color={c.mut} />
          <T v="caption" tone="mut" numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </T>
        </RowView>
      </View>
      <T v={small ? "heading" : "title"} tabular numberOfLines={1} style={{ opacity: w > 0 ? 1 : 0 }}>
        {value}
      </T>
      <RowView gap={space[1]} style={{ flexWrap: "wrap" }}>
        {hint ? (
          <T v="micro" tone="mut">
            {hint}
          </T>
        ) : null}
        {/* overdue is a status: icon + word (rule 2) */}
        {chip ? <StatusChip status="bad" label={chip} soft /> : null}
      </RowView>
    </Card>
  );
}

/** «Получено»: the main number of the period with columns by days / weeks and the change against the same span before */
function Received({ period, idx, onPress }: { period: Period; idx: ReceivedIndex; onPress: () => void }) {
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
      onPress={onPress}
      // the card is one button: it carries the change and the chart for VoiceOver (the chart inside is not focusable)
      accessibilityLabel={[`${t("today.received")}: ${moneyWhole(total.cents)}`, change, empty ? t("today2.empty") : chart].filter(Boolean).join(". ")}
      style={{ gap: space[3] }}
    >
      <RowView gap={space[1]}>
        <Icon name="wallet" s={size.iconSm} color={c.mut} />
        <T v="caption" tone="mut" style={{ flex: 1 }} numberOfLines={1}>
          {t("today.received")}
        </T>
        {/* growth is not a status — an arrow and words, no colour (spec 24 A3); nothing to compare with → nothing */}
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
      {empty ? (
        <T v="caption" tone="mut">
          {t("today2.empty")}
        </T>
      ) : null}
    </Card>
  );
}

/** One funnel step: a count (no money — it is in «Получено» and the tiles), a neutral bar, the share in words. */
function FunnelRow({ icon, label, count, max, share, index, onPress }: { icon: IconKey; label: string; count: number; max: number; share?: string; index: number; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${count}`}>
      <View style={{ minHeight: component.rowOption, justifyContent: "center", gap: space[1] }}>
        <RowView gap={space[3]}>
          <Icon name={icon} />
          <T v="body" w="semibold" style={{ flex: 1 }} numberOfLines={1}>
            {label}
          </T>
          <T v="body" w="semibold" tabular>
            {String(count)}
          </T>
          {onPress ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
        </RowView>
        <Meter share={max > 0 ? count / max : 0} index={index} />
        {share ? (
          <T v="caption" tone="mut" tabular>
            {share}
          </T>
        ) : null}
      </View>
    </Press>
  );
}

/** Owner home: money for today / week / month, the sales funnel and what needs a decision. */
/** the home cards have come in once in this session (spec 24 A4) */
let homeAppeared = false;

export default function Today() {
  useTick();
  const reduce = useReducedMotion();
  // the cards come in once per session (A4): opacity 0 → 1 and 8 px up, durSlow; own shared values, so nothing can
  // stay hidden on the web (a layout «entering» with initial values left the cards at opacity 0 there)
  const [animate] = useState(() => !reduce && !homeAppeared);
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    homeAppeared = true;
    if (animate) shown.value = withTiming(1, { duration: motion.durSlow, easing: Easing.bezier(...motion.easeOut) });
  }, [animate, shown]);
  const appearStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * space[2] }] }));
  const { t, day, time } = useI18n();
  const { db, role, rejectedOps } = useStore();
  const [period, setPeriod] = usePersistentState<Period>("octo.todayPeriod.v1", "today");
  // the company's day and zone are part of the key: left open overnight (useTick re-renders), the numbers move to
  // the new day at midnight, not when db changes next (review #270); a new company zone re-sorts the payments
  const today = todayKey();
  const zone = getZone();
  const n = useMemo(() => periodNumbers(db, period, today), [db, period, today]);
  // received money by day: one pass over the payments, rebuilt only when they or the zone change (review #270)
  const idx = useMemo(() => receivedIndex(db.payments, zone), [db.payments, zone]);
  const { device } = useDevice();
  // every number opens exactly the records it counts, for the same period (founder 05.11); back → Today
  const open = (f: Figure) => router.push(`/figures/${f}?period=${period}`);
  // a money change the server refused is first here too (docs/specs/23 §3)
  const attention = buildAttention(db, role, undefined, { rejected: rejectedOps });
  // invited or switched off people are not a crew (7-2)
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending);
  const aw = awaitingCounts(db);
  const fmax = Math.max(n.leads, n.sent, n.signed);
  const shareText = (key: "today2.ofLeads" | "today2.ofSent", v: number | undefined) => (v === undefined ? undefined : t(key, { n: v }));
  const received = <Received period={period} idx={idx} onPress={() => open("received")} />;
  const tiles = (
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <Kpi label={t("today.signed")} cents={n.signedCents} icon="signature" hint={t("today.nEstimates", { n: n.signed })} onPress={() => open("signed")} />
      <Kpi
        label={t("today.awaiting")}
        cents={n.awaitingCents}
        icon="invoice"
        hint={t("today2.nInvoices", { n: aw.open })}
        chip={aw.overdue > 0 ? t("today2.overdue", { n: aw.overdue }) : undefined}
        onPress={() => router.push("/invoice?f=owed")}
      />
    </View>
  );
  const funnel = (
    <Card>
      <SectionTitle title={`${t("today.funnel")} · ${t(period === "today" ? "today.title" : period === "week" ? "plan.week" : "plan.month")}`} />
      <FunnelRow icon="inbox" index={0} label={t("today.f.leads")} count={n.leads} max={fmax} onPress={() => open("leads")} />
      <FunnelRow icon="send" index={1} label={t("today.f.sent")} count={n.sent} max={fmax} share={shareText("today2.ofLeads", funnelShare(n.sent, n.leads))} onPress={() => open("sent")} />
      <FunnelRow icon="signature" index={2} label={t("today.f.signed")} count={n.signed} max={fmax} share={shareText("today2.ofSent", funnelShare(n.signed, n.sent))} onPress={() => open("signed")} />
    </Card>
  );
  return (
    <Screen title={t("today.title")} help={t("help.today")} hintKey="today" fab="home" home subtitle={day(new Date().toISOString())}>
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        items={[
          { key: "today", label: t("today.title") },
          { key: "week", label: t("plan.week") },
          { key: "month", label: t("plan.month") },
        ]}
      />
      {/* spec 24 A: the main number with columns, two tiles, the funnel in counts as bars (founder 07.11) */}
      {/* the cards come in once per session (A4: FadeInDown 8, durSlow); not again on coming back to the tab */}
      <Animated.View style={[{ gap: space[3] }, appearStyle]}>
        {device === "desktop" ? (
          // 1280: «Получено» | funnel | tiles + company setup (A3) — three full columns
          <Grid>
            {received}
            {funnel}
            <View style={{ gap: space[3] }}>
              {tiles}
              <CompanySetupCard />
            </View>
          </Grid>
        ) : (
          <>
            <Grid>
              {received}
              <View style={{ gap: space[3] }}>
                {tiles}
                {funnel}
              </View>
            </Grid>
            <CompanySetupCard />
          </>
        )}
      </Animated.View>
      <FirstStepsCard />
      <NoticesCard />
      <Grid>
        <View style={{ gap: space[2] }}>
          {/* the count sits next to the title, not at the far edge (unslop 05.11) */}
          <SectionTitle title={attention.length ? `${t("today.attention")} · ${attention.length}` : t("today.attention")} />
          {attention.length === 0 ? (
            <T v="body" tone="ok">
              ✓ {t("today.allClear")}
            </T>
          ) : (
            // people view (spec 06 decision 5): one card per client with all reasons, 3 people + «More» → Triage
            <AttentionPeople items={attention} max={3} />
          )}
        </View>
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("today.crew")} right={<Button label={t("plan.title")} icon="calendar" size="sm" variant="ghost" onPress={() => router.push("/plan")} />} />
          {/* one list card per tech (spec 06, PR10a): where now, what next, call / SMS; a column like «Требует внимания» */}
          <View style={{ gap: space[2] }}>
            {techs.map((m) => {
              const vs = todayVisits(db, m.id);
              const { current, next } = crewNow(vs);
              const st = current ? visitStatus(current, db.members, Date.now(), lateAfterOf(db)) : next ? visitStatus(next, db.members, Date.now(), lateAfterOf(db)) : null;
              const where = (v: typeof current) => {
                if (!v) return undefined;
                const { customer, property } = visitContext(db, v);
                return [customer?.name, property ? `${property.address}, ${property.city}` : undefined].filter(Boolean).join(" · ");
              };
              return (
                <ListCard
                  key={m.id}
                  testID="crew-card"
                  title={m.name}
                  when={t("visits.count", { n: vs.length })}
                  lead={{ kind: "initials", text: m.initials, dashed: m.kind === "sub" }}
                  // read only: the visit's own status (its steps move on the visit screen)
                  status={st ? { tone: st.status, label: t(st.label) } : { tone: "neutral", label: t("plan.free") }}
                  facts={{
                    phone: m.phone,
                    now: where(current),
                    next: next ? [visitWhen(next, time, t("plan5.allDay"), false), visitContext(db, next).customer?.name].filter(Boolean).join(" · ") : undefined,
                  }}
                  // a tech: call / SMS only (his address is not a place to go)
                  contact={{ phone: m.phone }}
                  edge={null}
                  density="rich"
                  onPress={() => router.push(current ? `/visit/${current.id}` : "/plan")}
                />
              );
            })}
          </View>
        </View>
      </Grid>
    </Screen>
  );
}
