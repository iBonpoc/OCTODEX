import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { component, font, layout, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import { periodNumbers, type Period } from "@/features/metrics";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { buildAttention } from "@/features/attention";
import { todayVisits, visitStatus } from "@/features/visits";
import { useTick } from "@/features/sheets";
import { NoticesCard } from "@/features/notices";
import { CompanySetupCard, FirstStepsCard } from "@/features/SetupCards";
import { Avatar, Button, Segmented, StatusChip } from "@/ui/controls";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { Card, CardList, Divider, Grid, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

function Kpi({ label, cents, icon, hint, onPress, width }: { label: string; cents: number; icon: IconKey; hint?: string; onPress?: () => void; width: number }) {
  const { moneyWhole } = useI18n();
  const { c } = useTheme();
  const value = moneyWhole(cents);
  /** three equal tiles; long amounts on narrow phones use the smaller title size so they never wrap or cut */
  const small = value.length * font.size.title * 0.65 > width - space[3] * 2;
  return (
    <View style={{ width }}>
    <Card style={{ padding: space[3], flex: 1 }} containerStyle={{ flex: 1 }} onPress={onPress} accessibilityLabel={label}>
      <RowView gap={space[1]} style={{ alignItems: "flex-start" }}>
        <View style={{ flexShrink: 0 }}>
          <Icon name={icon} s={size.iconSm} color={c.mut} />
        </View>
        <T v="caption" tone="mut" style={{ flex: 1 }}>
          {label}
        </T>
      </RowView>
      <T v={small ? "heading" : "title"} tabular numberOfLines={1}>
        {value}
      </T>
      {hint ? (
        <T v="micro" tone="mut">
          {hint}
        </T>
      ) : null}
    </Card>
    </View>
  );
}

/** One step of the sales funnel: count (and money), share of the previous step. */
function FunnelRow({ icon, label, value, share, onPress }: { icon: IconKey; label: string; value: string; share?: number; onPress?: () => void }) {
  const { t } = useI18n();
  return (
    <ListRow
      title={label}
      left={<Icon name={icon} />}
      right={
        <RowView gap={space[2]}>
          {share !== undefined ? <StatusChip status="neutral" label={t("today.share", { n: share })} soft /> : null}
          <T v="body" w="semibold" tabular>
            {value}
          </T>
        </RowView>
      }
      onPress={onPress}
    />
  );
}

/** Owner home: money for today / week / month, the sales funnel and what needs a decision. */
export default function Today() {
  useTick();
  const { t, day, moneyWhole } = useI18n();
  const { db, role } = useStore();
  const [period, setPeriod] = usePersistentState<Period>("octo.todayPeriod.v1", "today");
  const n = periodNumbers(db, period);
  const attention = buildAttention(db, role);
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  const { width: screenW } = useWindowDimensions();
  const tileW = Math.floor((Math.min(screenW, layout.contentMax) - space[4] * 2 - space[2] * 2) / 3);
  return (
    <Screen title={t("today.title")} help={t("help.today")} hintKey="today" subtitle={day(new Date().toISOString())}>
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        items={[
          { key: "today", label: t("today.title") },
          { key: "week", label: t("plan.week") },
          { key: "month", label: t("plan.month") },
        ]}
      />
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <Kpi label={t("today.signed")} cents={n.signedCents} icon="signature" hint={t("today.nEstimates", { n: n.signed })} width={tileW} />
        <Kpi label={t("today.received")} cents={n.receivedCents} icon="wallet" hint={t("today.nPayments", { n: n.payments })} onPress={() => router.push("/money")} width={tileW} />
        <Kpi label={t("today.awaiting")} cents={n.awaitingCents} icon="invoice" hint={t("today.allTime")} onPress={() => router.push("/money")} width={tileW} />
      </View>
      <Card>
        <SectionTitle title={t("today.funnel")} />
        <FunnelRow icon="inbox" label={t("today.f.leads")} value={String(n.leads)} onPress={() => router.navigate("/inbox")} />
        <FunnelRow icon="send" label={t("today.f.sent")} value={String(n.sent)} share={n.leads ? n.leadToSentPct : undefined} onPress={() => router.navigate("/inbox")} />
        <FunnelRow icon="signature" label={t("today.f.signed")} value={`${n.signed} · ${moneyWhole(n.signedCents)}`} share={n.sent ? n.sentToSignedPct : undefined} />
        <FunnelRow icon="wallet" label={t("today.f.paid")} value={moneyWhole(n.receivedCents)} onPress={() => router.push("/money")} />
      </Card>
      <CompanySetupCard />
      <FirstStepsCard />
      <NoticesCard />
      <Grid>
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("today.attention")} right={<T v="caption" tone="mut">{attention.length}</T>} />
          <CardList>
            {attention.length === 0 ? (
              <T v="body" tone="ok">
                ✓ {t("today.allClear")}
              </T>
            ) : (
              attention.slice(0, 6).map((it, i) => (
                <View key={it.id}>
                  <ItemCard
                    status={it.status}
                    title={it.name}
                    subtitle={t(it.label, it.params)}
                    right={<StatusChip status={it.status} label={t(it.chip, it.params)} />}
                    onPress={() =>
                      it.kind === "schedule"
                        ? router.push(`/job/schedule?jobId=${it.refId}`)
                        : it.kind === "leadIdle" || it.kind === "lead"
                          ? router.push(`/lead/${it.refId}`)
                          : router.navigate(it.kind === "overdue" ? "/money" : "/triage")
                    }
                  />
                </View>
              ))
            )}
          </CardList>
        </View>
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("today.crew")} right={<Button label={t("plan.title")} icon="calendar" size="sm" variant="ghost" onPress={() => router.push("/plan")} />} />
          <CardList>
            {techs.map((m, i) => {
              const vs = todayVisits(db, m.id);
              const active = vs.find((v) => v.step !== "scheduled" && v.step !== "paid") ?? vs.find((v) => v.step === "scheduled");
              const st = active ? visitStatus(active) : null;
              return (
                <View key={m.id}>
                  <ItemCard
                    title={m.name}
                    subtitle={t("visits.count", { n: vs.length })}
                    left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
                    right={st ? <StatusChip status={st.status} label={t(st.label)} /> : <StatusChip status="neutral" label={t("plan.free")} />}
                    onPress={active ? () => router.push(`/visit/${active.id}`) : undefined}
                  />
                </View>
              );
            })}
          </CardList>
        </View>
      </Grid>
    </Screen>
  );
}
