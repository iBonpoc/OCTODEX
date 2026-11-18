import { useRequiredForm } from "@/ui/requiredForm";
import { useState } from "react";
import { Image } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { radius, component } from "@octo/design-tokens";
import { isToday, useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { expenseJobsFor, startJob } from "@/features/expenseForm";
import { useExpenseDraft, useExpenseFields } from "@/features/ExpenseFields";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { FieldGroup, FormMain, Screen } from "@/ui/surfaces";
import { isAssigned } from "@/features/schedule";
import { shrinkPicked } from "@/data/photoShrink";

/** Receipt → expense, linked to a job so job profit is real. AI reading of the receipt comes in wave 6. */
export default function NewExpense() {
  const { t, money } = useI18n();
  const { db, addExpense, online, role } = useStore();
  const params = useLocalSearchParams<{ jobId?: string }>();
  const toast = useToast();
  // #2008: the job it was opened from (the job's or a visit's screen); else the one job of today's visits; else none
  const todays = db.visits.filter((v) => isToday(v.start) && isAssigned(v, db.me)).map((v) => v.jobId).filter((x): x is string => !!x);
  const draft = useExpenseDraft({ jobId: startJob(expenseJobsFor(db, role), typeof params.jobId === "string" ? params.jobId : undefined, todays) ?? "none" });
  const [photo, setPhoto] = useState<string | undefined>();
  const form = useRequiredForm();
  const { fields, sheets } = useExpenseFields(draft, form);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    // the receipt made smaller before it is kept (#642)
    const uri = await shrinkPicked(res);
    if (uri) setPhoto(uri);
  };
  return (
    <Screen form title={t("exp.title")} back={back}>
      {/* the fields straight on the background, no card around them (DS §11 п.17, #1411) */}
      <FieldGroup>
        <Button label={t("exp.photo")} icon="camera" variant="secondary" onPress={pick} testID="expense-photo" />
        {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" /> : null}
        <T v="caption" tone="mut">
          {t("exp.aiNote")}
        </T>
        {fields}
      </FieldGroup>
      {/* the main button stands apart from the last field (DS §11 п.17) */}
      <FormMain>
        <Button
          label={t("exp.save")}
          icon="check"
          full
          testID="expense-save"
          onPress={() =>
            form.submit(draft.missing(t), () => {
            const { d, cents } = draft;
            const undo = addExpense({ jobId: d.jobId === "none" ? null : d.jobId, vendor: d.vendor!, category: d.category, amountCents: cents, receiptUri: photo, date: d.date });
            toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
            back();
            })
          }
        />
      </FormMain>
      {sheets}
    </Screen>
  );
}
