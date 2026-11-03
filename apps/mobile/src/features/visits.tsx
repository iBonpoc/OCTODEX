import { View } from "react-native";
import { router } from "expo-router";
import { space, type StatusName } from "@octo/design-tokens";
import { visitContext, useStore } from "@/data/store";
import type { DB, Visit, VisitStep } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";

/** Visit status → DS status color (4+1) and word. */
export function visitStatus(v: Visit): { status: StatusName; label: DictKey } {
  if (!v.techId) return { status: "warn", label: "st.unassigned" };
  if (v.late && (v.step === "scheduled" || v.step === "en_route")) return { status: "warn", label: "st.late" };
  const map: Record<VisitStep, { status: StatusName; label: DictKey }> = {
    scheduled: { status: "neutral", label: "st.scheduled" },
    en_route: { status: "info", label: "st.en_route" },
    on_site: { status: "info", label: "st.on_site" },
    working: { status: "info", label: "st.working" },
    signed: { status: "warn", label: "st.awaiting" },
    paid: { status: "ok", label: "st.paid" },
  };
  return map[v.step];
}

/** The technician-facing step labels, in order (scheduled is the start, not a step). */
export const STEP_LABELS: DictKey[] = ["step.en_route", "step.on_site", "step.working", "step.sign", "step.pay"];
export function stepIndex(step: VisitStep): number {
  return ["scheduled", "en_route", "on_site", "working", "signed", "paid"].indexOf(step);
}

export function VisitCard({ v, showTech }: { v: Visit; showTech?: boolean }) {
  const { db } = useStore();
  const { t, time, money } = useI18n();
  const { c } = useTheme();
  const { job, property, customer, tech } = visitContext(db, v);
  const st = visitStatus(v);
  const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
  return (
    <Card
      status={st.status}
      onPress={() => router.push(`/visit/${v.id}`)}
      accessibilityLabel={`${customer?.name ?? ""}, ${time(v.start)}`}
    >
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="caption" tone="mut" tabular>
          {time(v.start)} – {time(end)}
        </T>
        <StatusChip status={st.status} label={t(st.label)} />
      </RowView>
      <T v="heading" numberOfLines={1}>
        {customer?.name}
      </T>
      <RowView gap={space[1]}>
        <Icon name="pin" s={14} color={c.mut} />
        <T v="body" tone="mut" numberOfLines={1} style={{ flex: 1 }}>
          {[property?.address, property?.city.split(",")[0]].filter(Boolean).join(", ")}
        </T>
      </RowView>
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="body" numberOfLines={1} style={{ flex: 1 }}>
          {job?.title}
        </T>
        {v.amountDueCents > 0 ? (
          <T v="body" w="semibold" tabular>
            {money(v.amountDueCents)}
          </T>
        ) : null}
      </RowView>
      {showTech ? (
        <RowView>
          {tech ? <Avatar initials={tech.initials} s={28} sub={tech.kind === "sub"} /> : null}
          <T v="caption" tone="mut">
            {tech ? tech.name : t("plan.unassigned")}
          </T>
        </RowView>
      ) : null}
    </Card>
  );
}

export function sortByStart(a: Visit, b: Visit) {
  return new Date(a.start).getTime() - new Date(b.start).getTime();
}

export function todayVisits(db: DB, techId?: string) {
  const n = new Date();
  return db.visits
    .filter((v) => {
      const d = new Date(v.start);
      return d.toDateString() === n.toDateString() && (techId === undefined || v.techId === techId);
    })
    .sort(sortByStart);
}

export function Spacer() {
  return <View style={{ height: space[2] }} />;
}
