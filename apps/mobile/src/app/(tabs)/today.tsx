import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { isToday, useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { buildAttention } from "@/features/attention";
import { todayVisits, visitStatus } from "@/features/visits";
import { useTick } from "@/features/sheets";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { Card, Divider, Grid, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

function Kpi({ label, cents, icon, hint, onPress }: { label: string; cents: number; icon: IconKey; hint?: string; onPress?: () => void }) {
  const { money } = useI18n();
  const { c } = useTheme();
  return (
    <Card style={{ padding: space[3], flex: 1 }} containerStyle={{ flex: 1, minWidth: 100 }} onPress={onPress} accessibilityLabel={label}>
      <RowView gap={space[1]}>
        <Icon name={icon} s={14} color={c.mut} />
        <T v="caption" tone="mut">
          {label}
        </T>
      </RowView>
      <T v="title" tabular>
        {money(cents)}
      </T>
      {hint ? (
        <T v="micro" tone="mut">
          {hint}
        </T>
      ) : null}
    </Card>
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
  return (
    <Screen title={t("today.title")} help={t("help.today")} hintKey="today" subtitle={day(new Date().toISOString())}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
        <Kpi label={t("today.signed")} cents={signed} icon="signature" />
        <Kpi label={t("today.received")} cents={received} icon="wallet" onPress={() => router.push("/money")} />
        <Kpi label={t("today.awaiting")} cents={awaiting} icon="invoice" onPress={() => router.push("/money")} />
      </View>
      <Grid>
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("today.attention")} right={<T v="caption" tone="mut">{attention.length}</T>} />
          <Card>
            {attention.length === 0 ? (
              <T v="body" tone="ok">
                ✓ {t("today.allClear")}
              </T>
            ) : (
              attention.slice(0, 6).map((it, i) => (
                <View key={it.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={it.name}
                    subtitle={t(it.label, it.params)}
                    right={<StatusChip status={it.status} label={t(it.chip, it.params)} />}
                    onPress={() => router.navigate(it.kind === "lead" ? "/inbox" : it.kind === "overdue" ? "/money" : "/triage")}
                  />
                </View>
              ))
            )}
          </Card>
        </View>
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("today.crew")} />
          <Card>
            {techs.map((m, i) => {
              const vs = todayVisits(db, m.id);
              const active = vs.find((v) => v.step !== "scheduled" && v.step !== "paid") ?? vs.find((v) => v.step === "scheduled");
              const st = active ? visitStatus(active) : null;
              return (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={m.name}
                    subtitle={t("visits.count", { n: vs.length })}
                    left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
                    right={st ? <StatusChip status={st.status} label={t(st.label)} /> : <StatusChip status="neutral" label={t("plan.free")} />}
                    onPress={active ? () => router.push(`/visit/${active.id}`) : undefined}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      </Grid>
    </Screen>
  );
}
