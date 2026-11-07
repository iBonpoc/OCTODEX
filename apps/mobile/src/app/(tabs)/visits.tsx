import { lateAfterOf } from "@/features/scheduleSettings";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useStore } from "@/data/store";
import { techDay } from "@/features/techDay";
import { sortByStart, visitStatus } from "@/features/visits";
import { visitContext } from "@/data/selectors";
import type { Visit } from "@/data/types";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useTick } from "@/features/sheets";
import { MetaTag, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { isAssigned, visitWhen } from "@/features/schedule";
import { isoDayKey, todayKey } from "@/features/calendar";
import { overlapSigns } from "@/features/listSigns";

/** Technician home ("my day"): progress and money collected, the visit in progress or the next one, the rest of today, then the week. */
export default function Visits() {
  useTick();
  const { t, day, moneyWhole, money, time } = useI18n();
  const { db } = useStore();
  const d = techDay(db, db.me);
  const focus = d.current ?? d.next;
  const rest = d.visits.filter((v) => v.id !== focus?.id);
  // after today of the company (П4b)
  const today = todayKey();
  const later = db.visits.filter((v) => isAssigned(v, db.me) && isoDayKey(v.start) > today).sort(sortByStart);
  const sections = ([[d.current ? t("tday.now") : t("tday.next"), focus ? [focus] : []], [t("today.title"), rest], [t("visits.later"), later]] as const).filter(([, vs]) => vs.length);
  /** a visit card: read-only status (steps change on the visit screen); contact buttons only open the phone and the map */
  const visitCard = (v: Visit, isFocus: boolean) => {
    const { job, property, customer } = visitContext(db, v);
    // an inspection has no job and maybe no client yet: the lead's name and request (docs/specs/03 §3.1)
    const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
    const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
    // «Весь день» has no hour: the label instead of «12:00 AM»
    const [hm, ampm] = v.allDay ? [t("plan5.allDay"), ""] : time(v.start).split(" ");
    const addr = property ? `${property.address}, ${property.city}` : undefined;
    const done = v.checklist.filter((x) => x.done).length;
    return (
      <ListCard
        key={v.id}
        title={customer?.name ?? lead?.name ?? "—"}
        when={`${later.includes(v) ? `${day(v.start)} · ` : ""}${visitWhen(v, time, t("plan5.allDay"))}`}
        lead={{ kind: "time", top: hm ?? "", bottom: ampm ?? "" }}
        value={v.amountDueCents > 0 ? money(v.amountDueCents) : undefined}
        valueLabel={v.amountDueCents > 0 ? t("card.val.toPay") : undefined}
        status={{ tone: st.status, label: t(st.label) }}
        signs={overlapSigns(db, v).map((s) => ({ tone: s.tone, label: t(s.key, s.params) }))}
        tags={[...(v.checklist.length ? [t("vcard.checks", { done, n: v.checklist.length })] : []), ...(v.photos.length ? [t("vcard.photos", { n: v.photos.length })] : [])]}
        facts={{ phone: customer?.phone ?? lead?.phone, addr, work: job?.title ?? lead?.service }}
        contact={{ phone: customer?.phone ?? lead?.phone, addr }}
        // the visit in progress / next one: «Open visit» inside the card (secondary), no full-width button
        action={isFocus ? { label: t("tday.open"), icon: "route", onPress: () => router.push(`/visit/${v.id}`) } : undefined}
        onPress={() => router.push(`/visit/${v.id}`)}
      />
    );
  };

  return (
    <Screen title={t("visits.title")} help={t("help.visits")} hintKey="visits" fab="home" home subtitle={`${day(new Date().toISOString())} · ${t("visits.count", { n: d.visits.length })}`}>
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
            {d.checksLeft ? <MetaTag icon="checklist" label={t("tday.checksLeft", { n: d.checksLeft })} /> : null}
            <MetaTag icon="camera" label={t("tday.photos", { n: d.photos })} />
          </RowView>
        </Card>
      )}
      {sections.map(([title, vs]) => (
        <View key={title} style={{ gap: space[2] }}>
          <SectionTitle title={title} />
          {/* one grid for every section: rows of equal height, the same columns (no full-width block next to narrow ones) */}
          <CardGrid>{vs.map((v) => visitCard(v, v.id === focus?.id))}</CardGrid>
        </View>
      ))}
    </Screen>
  );
}
