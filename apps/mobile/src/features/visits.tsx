import { lateAfterOf } from "@/features/scheduleSettings";
import { StatusPill } from "@/ui/statusPill";
import { visitDueCents } from "@/features/visitDue";
import { View } from "react-native";
import { router } from "expo-router";
import { component, size, space } from "@octo/design-tokens";
import { visitContext, useStore } from "@/data/store";
import type { DB, Visit, VisitStep } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
import { wasJustDragged } from "./dnd";
import { assigneesOf, isAssigned, visitWhen } from "@/features/schedule";
import { isoDayKey, todayKey } from "@/features/calendar";
import { overlapSigns } from "@/features/listSigns";
import { memberLabel } from "@/features/team";

import { visitStatus } from "./visitStatus";
export { visitStatus };

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
  const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
  const people = assigneesOf(v).map((id) => db.members.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  return (
    <Card
      status={st.status}
      onPress={() => !wasJustDragged() && router.push(`/visit/${v.id}`)}
      accessibilityLabel={`${customer?.name ?? ""}, ${visitWhen(v, time, t("plan5.allDay"), false)}`}
    >
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="caption" tone="mut" tabular>
          {visitWhen(v, time, t("plan5.allDay"))}
        </T>
        {/* #2363 N1/74 (founder 21.11: «бурая заливка — нет», значок + слово) and F10 (one word, «· не выехал» is told by the visit
            screen): the board's card says the state as the phone's Plan does — the quiet StatusPill */}
        <StatusPill status={st.status} label={st.label === "late.enRoute" || st.label === "late.notLeft" ? t("st.late") : t(st.label)} />
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
        {visitDueCents(db, v) > 0 ? (
          <T v="body" w="semibold" tabular>
            {money(visitDueCents(db, v))}
          </T>
        ) : null}
      </RowView>
      {/* the kind of the visit and everyone on it (docs/specs/03 §7.2, wave П3b) */}
      <RowView style={{ flexWrap: "wrap" }}>
        <StatusChip status="neutral" label={t(v.kind === "inspection" || (!v.jobId && v.leadId) ? "plan.kind.inspection" : "plan.kind.job")} soft />
        {overlapSigns(db, v).map((s) => <StatusChip key={s.key} status={s.tone} label={t(s.key, s.params)} />)}
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
            {people.length ? people.map((m) => memberLabel(m, t)).join(", ") : t("plan.unassigned")}
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
  // today of the company (П4b)
  const today = todayKey();
  return db.visits
    .filter((v) => isoDayKey(v.start) === today && (techId === undefined || isAssigned(v, techId)))
    .sort(sortByStart);
}

export function Spacer() {
  return <View style={{ height: space[2] }} />;
}
