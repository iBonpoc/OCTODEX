import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { VisitCard, sortByStart } from "@/features/visits";
import { AssignSheet } from "@/features/sheets";
import { DndProvider, Draggable, DropZone, useDragFrom } from "@/features/dnd";
import { useToast } from "@/ui/overlays";
import { Avatar, Button, ChoiceChips } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";

/** Day schedule grouped by person; unassigned first. Drag & drop between people comes with the tablet calendar (wave 2). */
export default function Plan() {
  const { t, day } = useI18n();
  const { db, role, assignVisit, online } = useStore();
  const canAssign = role !== "tech";
  const toast = useToast();
  const drop = (visitId: string, techId: string) => {
    const m = db.members.find((x) => x.id === techId);
    toast.show(online ? t("toast.assigned", { name: m?.name ?? "" }) : t("offline.queued"), assignVisit(visitId, techId));
  };
  const drag = (v: { id: string; techId: string | null }, card: ReactNode) =>
    canAssign ? (
      <Draggable key={v.id} id={v.id} from={v.techId ?? "none"} onDrop={(z) => drop(v.id, z)}>
        {card}
      </Draggable>
    ) : (
      <View key={v.id}>{card}</View>
    );
  const [dayKey, setDayKey] = useState<string>("0");
  const [assign, setAssign] = useState<string | null>(null);
  const target = new Date();
  target.setDate(target.getDate() + Number(dayKey));
  /** next 14 days; days with visits get a count */
  const dayItems = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const n = db.visits.filter((v) => new Date(v.start).toDateString() === d.toDateString()).length;
    const name = i === 0 ? t("common.today") : i === 1 ? t("common.tomorrow") : day(d.toISOString());
    return { key: String(i), label: n ? `${name} · ${n}` : name };
  });
  const visits = db.visits.filter((v) => new Date(v.start).toDateString() === target.toDateString()).sort(sortByStart);
  const unassigned = visits.filter((v) => !v.techId);
  const people = db.members.filter((m) => m.roles.includes("tech") && (role !== "tech" || m.id === db.me));
  return (
    <Screen
      title={t("plan.title")}
      help={t("help.plan")} hintKey="plan"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        <ChoiceChips value={dayKey} onChange={setDayKey} items={dayItems} nowrap />
      </ScrollView>
      <DndProvider>
      {visits.length === 0 ? <Empty icon="calendar" title={t("plan.empty")} /> : null}
      {canAssign && unassigned.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <T v="heading" tone="warn">
            {t("plan.unassigned")} · {unassigned.length}
          </T>
          <Grid>
            {unassigned.map((v) => (
              <View key={v.id} style={{ gap: space[2] }}>
                {drag(v, <VisitCard v={v} />)}
                <Button label={t("plan.assign")} icon="user" onPress={() => setAssign(v.id)} />
              </View>
            ))}
          </Grid>
        </View>
      ) : null}
      <RaisedGrid ids={people.map((m) => m.id)}>
        {people.map((m) => {
          const vs = visits.filter((v) => v.techId === m.id);
          return (
            <DropZone key={m.id} id={m.id} style={{ gap: space[2] }}>
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
                vs.map((v) => drag(v, <VisitCard v={v} />))
              )}
            </DropZone>
          );
        })}
      </RaisedGrid>
      </DndProvider>
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </Screen>
  );
}

/** Grid that lifts the column a card is dragged from above its neighbours. */
function RaisedGrid({ ids, children }: { ids: string[]; children: ReactNode[] }) {
  const from = useDragFrom();
  const i = from ? ids.indexOf(from) : -1;
  return <Grid raise={i >= 0 ? i : undefined}>{children}</Grid>;
}
