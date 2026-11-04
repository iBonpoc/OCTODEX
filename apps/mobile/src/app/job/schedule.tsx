import { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, IconButton, Stepper } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";

const DAYS = 21;
const MIN_START = 6 * 60;
const MAX_START = 20 * 60;

/**
 * The client signed → the job waits for a date. The contractor picks day, start time, duration and tech;
 * only then a visit appears in the plan (founder decision 04.11: no automatic "tomorrow 9:00").
 */
export default function ScheduleJob() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day, time } = useI18n();
  const toast = useToast();
  const [dayOffset, setDayOffset] = useState("1");
  const [startMin, setStartMin] = useState(9 * 60);
  const [duration, setDuration] = useState(120);
  const [techId, setTechId] = useState<string>("none");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const job = db.jobs.find((j) => j.id === jobId);
  const property = db.properties.find((p) => p.id === job?.propertyId);
  const customer = db.customers.find((c) => c.id === property?.customerId);
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return { key: String(i), label: i === 0 ? t("common.today") : i === 1 ? t("common.tomorrow") : day(d.toISOString()) };
      }),
    [t, day],
  );
  const start = new Date();
  start.setDate(start.getDate() + Number(dayOffset));
  start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  const startIso = start.toISOString();
  const busy = db.visits.filter(
    (v) => techId !== "none" && v.techId === techId && new Date(v.start).toDateString() === start.toDateString(),
  );

  if (!job) {
    return (
      <Screen title={t("sch.title")} back={back}>
        <Empty icon="calendar" title={t("clients.empty")} />
      </Screen>
    );
  }
  const already = db.visits.filter((v) => v.jobId === job.id);

  const save = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const undo = store.scheduleJob(job.id, { start: startIso, durationMin: duration, techId: techId === "none" ? null : techId });
    toast.show(store.online ? t("sch.saved", { date: day(startIso), time: time(startIso) }) : t("offline.queued"), undo);
    back();
  };

  return (
    <Screen title={t("sch.title")} back={back} subtitle={[customer?.name, property?.address].filter(Boolean).join(" · ")}>
      <Card>
        <T v="heading">{job.title}</T>
        <T v="title" tabular>
          {money(job.amountCents)}
        </T>
        {already.length ? (
          <T v="caption" tone="mut">
            {t("sch.already", { n: already.length })}
          </T>
        ) : null}
      </Card>

      <Card>
        <T v="heading">{t("sch.date")}</T>
        <ChoiceChips value={dayOffset} onChange={setDayOffset} items={days} />
      </Card>

      <Card>
        <T v="heading">{t("sch.start")}</T>
        <RowView style={{ justifyContent: "space-between" }}>
          <IconButton icon="minus" label={`${t("sch.start")} −30`} onPress={() => setStartMin((m) => Math.max(MIN_START, m - 30))} />
          <T v="title" tabular>
            {time(startIso)}
          </T>
          <IconButton icon="plus" label={`${t("sch.start")} +30`} onPress={() => setStartMin((m) => Math.min(MAX_START, m + 30))} />
        </RowView>
        <Stepper label={t("sch.duration")} unit={t("sch.min")} value={duration} step={30} min={30} max={12 * 60} onChange={setDuration} />
      </Card>

      <Card>
        <T v="heading">{t("sch.tech")}</T>
        <ChoiceChips
          value={techId}
          onChange={setTechId}
          items={[{ key: "none", label: t("sch.noTech") }, ...techs.map((m) => ({ key: m.id, label: m.name }))]}
        />
        {busy.length ? (
          <View style={{ gap: space[1] }}>
            <T v="caption" tone="warn">
              {t("sch.busy", { n: busy.length })}
            </T>
            {busy.map((v) => (
              <T key={v.id} v="caption" tone="mut" tabular>
                {time(v.start)} · {v.durationMin} {t("sch.min")}
              </T>
            ))}
          </View>
        ) : null}
      </Card>

      <T v="body" tone="mut">
        {t("sch.summary", { date: day(startIso), time: time(startIso), min: duration })}
      </T>
      <Button label={t("sch.save")} icon="calendar" full onPress={save} />
    </Screen>
  );
}
