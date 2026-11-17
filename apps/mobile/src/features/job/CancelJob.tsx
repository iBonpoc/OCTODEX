/**
 * #2015 (spec 38 §12, story map S37): «⋯ → Отменить работу…». One sheet: why (required) and the button. The cancel is for good — no
 * «Отменить» toast (rule 5: the confirmation stands instead, as for a void invoice, В1-5). The store checks what the server checks
 * (jobCancelRefusal) and the server too (public.cancel_job, db T383–T390). A cancelled job opens as a card with its reason.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Job } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { JOB_CANCEL_REASON_MAX } from "@/features/jobCancel";
import { RelatedBlock } from "@/features/RelatedBlock";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";

export function CancelJobSheet({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const close = () => {
    onClose();
    setReason("");
  };
  const confirm = () => {
    const why = store.cancelJob(jobId, reason);
    if (why) {
      toast.show(t(`job.cancel.why.${why}` as DictKey));
      if (why !== "reason" && why !== "long") close();
      return;
    }
    close();
    toast.show(t("job.cancel.done"));
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t("job.cancel.title")}
      dirty={reason.trim() !== ""}
      footer={
        <View testID="job-cancel-confirm">
          <Button label={t("job.cancel.confirm")} icon="close" variant="danger" full disabled={!reason.trim()} onPress={confirm} />
        </View>
      }
    >
      <View style={{ gap: space[3] }}>
        <T v="body" tone="mut">
          {t("job.cancel.body")}
        </T>
        <View testID="job-cancel-reason">
          <TextField type="note" value={reason} onChangeText={(x) => setReason(x.slice(0, JOB_CANCEL_REASON_MAX))} label={t("job.cancel.reason")} placeholder={t("job.cancel.reasonPh")} autoFocus />
        </View>
      </View>
    </Sheet>
  );
}

/** a cancelled job's own screen: «Отменена», why and when — no steps, no visits, no money buttons */
export function CancelledJobBody({ job }: { job: Job }) {
  const { db } = useStore();
  const { t, day } = useI18n();
  const p = db.properties.find((x) => x.id === job.propertyId);
  const c = db.customers.find((x) => x.id === (job.customerId ?? p?.customerId));
  return (
    <>
      <RelatedBlock of={{ type: "job", id: job.id }} />
      <Card status="neutral">
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }}>
            {job.title}
          </T>
          <View testID="job-cancelled-status">
            <StatusChip status="neutral" label={t("job.cancel.status")} />
          </View>
        </RowView>
        {c ? (
          <T v="caption" tone="mut">
            {c.name}
          </T>
        ) : null}
        {job.cancelReason ? (
          <View testID="job-cancelled-reason">
            <T v="body">{t("job.cancel.reasonLine", { reason: job.cancelReason })}</T>
          </View>
        ) : null}
        {job.cancelledAt ? (
          <T v="caption" tone="mut">
            {day(job.cancelledAt)}
          </T>
        ) : null}
      </Card>
    </>
  );
}
