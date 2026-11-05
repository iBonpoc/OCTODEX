import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { SCHEDULE_DEFAULTS } from "@/features/schedule";
import { NotifySheet, useVisitForm, VisitFormFields } from "@/features/VisitForm";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Screen } from "@/ui/surfaces";

/**
 * The client signed → the job waits for a date (S9). The same visit form as an inspection (docs/specs/03 §7.1):
 * day → person with the day's load → free slots → length → note; then «Сообщить клиенту?».
 * Only then a visit appears in the plan (founder decision 04.11: no automatic "tomorrow 9:00").
 */
export default function ScheduleJob() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day, time } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const f = useVisitForm({ durationMin: SCHEDULE_DEFAULTS.jobMin });
  const [notifyId, setNotifyId] = useState<string | null>(null);

  const job = db.jobs.find((j) => j.id === jobId);
  const property = db.properties.find((p) => p.id === job?.propertyId);
  const customer = db.customers.find((c) => c.id === property?.customerId);
  if (!job) {
    return (
      <Screen title={t("sch.title")} back={back}>
        <Empty icon="calendar" title={t("clients.empty")} />
      </Screen>
    );
  }
  const already = db.visits.filter((v) => v.jobId === job.id);

  const save = () => {
    if (f.past) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const visitId = uid();
    const undo = store.scheduleJob(job.id, { ...f.value, visitId });
    toast.show(store.online ? t("sch.saved", { date: day(f.value.start), time: time(f.value.start) }) : t("offline.queued"), undo);
    setNotifyId(visitId);
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
      <VisitFormFields f={f} />
      <Button label={t("sch.save")} icon="calendar" variant="primary" full disabled={f.past} onPress={save} />
      <NotifySheet visitId={notifyId} onClose={() => { setNotifyId(null); back(); }} />
    </Screen>
  );
}
