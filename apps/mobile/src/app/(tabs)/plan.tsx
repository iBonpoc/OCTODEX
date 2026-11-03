import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { VisitCard, sortByStart } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { Avatar, Button, Segmented } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";

/** Day schedule grouped by person; unassigned first. Drag & drop between people comes with the tablet calendar (wave 2). */
export default function Plan() {
  const { t } = useI18n();
  const { db, role } = useStore();
  const [dayKey, setDayKey] = useState<"today" | "tomorrow">("today");
  const [assign, setAssign] = useState<string | null>(null);
  const target = new Date();
  if (dayKey === "tomorrow") target.setDate(target.getDate() + 1);
  const visits = db.visits.filter((v) => new Date(v.start).toDateString() === target.toDateString()).sort(sortByStart);
  const unassigned = visits.filter((v) => !v.techId);
  const people = db.members.filter((m) => m.roles.includes("tech") && (role !== "tech" || m.id === db.me));
  const canAssign = role !== "tech";
  return (
    <Screen
      title={t("plan.title")}
      help={t("help.plan")}
      right={
        <Segmented
          value={dayKey}
          onChange={setDayKey}
          items={[
            { key: "today", label: t("common.today") },
            { key: "tomorrow", label: t("common.tomorrow") },
          ]}
        />
      }
    >
      {visits.length === 0 ? <Empty icon="calendar" title={t("visits.empty")} /> : null}
      {canAssign && unassigned.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <T v="heading" tone="warn">
            {t("plan.unassigned")} · {unassigned.length}
          </T>
          <Grid>
            {unassigned.map((v) => (
              <View key={v.id} style={{ gap: space[2] }}>
                <VisitCard v={v} />
                <Button label={t("plan.assign")} icon="user" onPress={() => setAssign(v.id)} />
              </View>
            ))}
          </Grid>
        </View>
      ) : null}
      <Grid>
        {people.map((m) => {
          const vs = visits.filter((v) => v.techId === m.id);
          return (
            <View key={m.id} style={{ gap: space[2] }}>
              <RowView>
                <Avatar initials={m.initials} s={28} sub={m.kind === "sub"} />
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
                vs.map((v) => <VisitCard key={v.id} v={v} />)
              )}
            </View>
          );
        })}
      </Grid>
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </Screen>
  );
}
