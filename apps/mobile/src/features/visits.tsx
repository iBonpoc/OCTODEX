import { View } from "react-native";
import { router } from "expo-router";
import { component, size, space, type StatusName } from "@octo/design-tokens";
import { visitContext, useStore } from "@/data/store";
import type { DB, Visit, VisitStep } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
import { wasJustDragged } from "./dnd";
import { assigneesOf, isAssigned, lateKind } from "@/features/schedule";

/** Visit status → DS status color (4+1) and word. */
export function visitStatus(v: Visit, now: number = Date.now()): { status: StatusName; label: DictKey } {
  if (!assigneesOf(v).length) return { status: "warn", label: "st.unassigned" };
  // one rule for the chip, the list sign, «Требует внимания» and the office notice (docs/specs/03 П3c)
  const late = lateKind(v, now);
  if (late) return { status: "warn", label: late === "en_route" ? "late.enRoute" : "late.notLeft" };
  const map: Record<VisitStep, { status: StatusName; label: DictKey }> = {
    scheduled: { status: "neutral", label: "st.scheduled" },
    en_route: { status: "info", label: "st.en_route" },
    on_site: { status: "info", label: "st.on_site" },
    working: { status: "info", label: "st.working" },
    signed: { status: "warn", label: "st.awaiting" },
    paid: { status: "ok", label: "st.paid" },
    // an inspection ends with "done" (no signature, no payment)
    done: { status: "ok", label: "st.done" },
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
  const people = assigneesOf(v).map((id) => db.members.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
  return (
    <Card
      status={st.status}
      onPress={() => !wasJustDragged() && router.push(`/visit/${v.id}`)}
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
        <Icon name="pin" s={size.iconSm} color={c.mut} />
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
      {/* the kind of the visit and everyone on it (docs/specs/03 §7.2, wave П3b) */}
      <RowView style={{ flexWrap: "wrap" }}>
        <StatusChip status="neutral" label={t(v.kind === "inspection" || (!v.jobId && v.leadId) ? "plan.kind.inspection" : "plan.kind.job")} soft />
        {people.length > 1 ? people.map((m) => <Avatar key={m.id} initials={m.initials} s={component.avatar.sm} sub={m.kind === "sub"} />) : null}
      </RowView>
      {v.checklist.length || v.photos.length ? (
        <RowView style={{ flexWrap: "wrap" }}>
          {v.checklist.length ? (
            <StatusChip
              status={v.checklist.every((x) => x.done) ? "ok" : "neutral"}
              label={t("vcard.checks", { done: v.checklist.filter((x) => x.done).length, n: v.checklist.length })}
              soft
            />
          ) : null}
          {v.photos.length ? <StatusChip status="neutral" label={t("vcard.photos", { n: v.photos.length })} soft /> : null}
        </RowView>
      ) : null}
      {showTech ? (
        <RowView>
          {tech ? <Avatar initials={tech.initials} s={component.avatar.sm} sub={tech.kind === "sub"} /> : null}
          <T v="caption" tone="mut">
            {people.length ? people.map((m) => m.name).join(", ") : t("plan.unassigned")}
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
      return d.toDateString() === n.toDateString() && (techId === undefined || isAssigned(v, techId));
    })
    .sort(sortByStart);
}

export function Spacer() {
  return <View style={{ height: space[2] }} />;
}
