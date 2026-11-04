import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useStore } from "@/data/store";
import { techDay } from "@/features/techDay";
import { VisitCard, sortByStart } from "@/features/visits";
import { useTick } from "@/features/sheets";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Grid, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/** Technician home ("my day"): progress and money collected, the visit in progress or the next one, the rest of today, then the week. */
export default function Visits() {
  useTick();
  const { t, day, moneyWhole } = useI18n();
  const { db } = useStore();
  const d = techDay(db, db.me);
  const focus = d.current ?? d.next;
  const rest = d.visits.filter((v) => v.id !== focus?.id);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const later = db.visits.filter((v) => v.techId === db.me && new Date(v.start) > end).sort(sortByStart);
  return (
    <Screen title={t("visits.title")} help={t("help.visits")} hintKey="visits" subtitle={`${day(new Date().toISOString())} · ${t("visits.count", { n: d.visits.length })}`}>
      {d.visits.length === 0 ? (
        <Empty icon="calendar" title={t("visits.empty")} hint={t("visits.emptyHint")} />
      ) : (
        <Card status={d.done === d.visits.length ? "ok" : undefined}>
          <RowView style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ gap: space[1], flex: 1 }}>
              <T v="caption" tone="mut">
                {t("tday.title")}
              </T>
              <T v="heading">{d.done === d.visits.length ? `✓ ${t("tday.allDone")}` : t("tday.progress", { done: d.done, n: d.visits.length })}</T>
            </View>
            <View style={{ alignItems: "flex-end", gap: space[1] }}>
              <T v="caption" tone="mut">
                {t("tday.collected")}
              </T>
              <T v="title" tabular>
                {moneyWhole(d.collectedCents)}
              </T>
            </View>
          </RowView>
          <RowView style={{ flexWrap: "wrap" }}>
            {d.awaitingPay ? <StatusChip status="warn" label={t("tday.awaitingPay", { n: d.awaitingPay })} /> : null}
            {d.checksLeft ? <StatusChip status="info" label={t("tday.checksLeft", { n: d.checksLeft })} /> : null}
            <StatusChip status="neutral" label={t("tday.photos", { n: d.photos })} />
          </RowView>
        </Card>
      )}
      {focus ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle title={d.current ? t("tday.now") : t("tday.next")} />
          <VisitCard v={focus} />
          <Button label={t("tday.open")} icon="route" full onPress={() => router.push(`/visit/${focus.id}`)} />
        </View>
      ) : null}
      {rest.length > 0 ? (
        <>
          <SectionTitle title={t("today.title")} />
          <Grid>
            {rest.map((v) => (
              <VisitCard key={v.id} v={v} />
            ))}
          </Grid>
        </>
      ) : null}
      {later.length > 0 ? (
        <>
          <SectionTitle title={t("visits.later")} />
          <Grid>
            {later.map((v) => (
              <VisitCard key={v.id} v={v} />
            ))}
          </Grid>
        </>
      ) : null}
    </Screen>
  );
}
