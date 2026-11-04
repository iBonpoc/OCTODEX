import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { font, layout, space } from "@octo/design-tokens";
import { isToday, useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { buildAttention } from "@/features/attention";
import { todayVisits, visitStatus } from "@/features/visits";
import { useTick } from "@/features/sheets";
import { NoticesCard } from "@/features/notices";
import { CompanySetupCard, FirstStepsCard } from "@/features/SetupCards";
import { Avatar, StatusChip } from "@/ui/controls";
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
          <Icon name={icon} s={14} color={c.mut} />
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

/** Owner home: today's money and what needs a decision. */
export default function Today() {
  useTick();
  const { t, day } = useI18n();
  const { db } = useStore();
  const signed = db.estimates.filter((e) => e.status === "approved" && e.approvedAt && isToday(e.approvedAt)).reduce((s, e) => s + e.totalCents, 0);
  const received = db.invoices.filter((i) => i.paidAt && isToday(i.paidAt)).reduce((s, i) => s + i.paidCents, 0);
  const awaiting = db.invoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const attention = buildAttention(db);
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  const { width: screenW } = useWindowDimensions();
  const tileW = Math.floor((Math.min(screenW, layout.contentMax) - space[4] * 2 - space[2] * 2) / 3);
  return (
    <Screen title={t("today.title")} help={t("help.today")} hintKey="today" subtitle={day(new Date().toISOString())}>
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <Kpi label={t("today.signed")} cents={signed} icon="signature"  width={tileW} />
        <Kpi label={t("today.received")} cents={received} icon="wallet" onPress={() => router.push("/money")}  width={tileW} />
        <Kpi label={t("today.awaiting")} cents={awaiting} icon="invoice" onPress={() => router.push("/money")}  width={tileW} />
      </View>
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
          <SectionTitle title={t("today.crew")} />
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
