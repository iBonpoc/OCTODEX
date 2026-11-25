import { useRequiredForm } from "@/ui/requiredForm";
import { useState } from "react";
import { Image } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { radius, space, component } from "@octo/design-tokens";
import { expenseAmountCents } from "@/features/expenseAmount";
import { useStore } from "@/data/store";
import { canStartExpense, expenseJobOptions, myVisitsToday } from "@/features/expenseJobs";
import { realJob } from "@/cloud/inspectionBridge";
import { meIsSub } from "@/nav/sections";
import type { ExpenseCategory } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Empty, FieldGroup, Screen } from "@/ui/surfaces";
import { expenseVendors } from "@/features/suppliers";
import { prepPicked, type PickedPhoto } from "@/data/photoShrink";

const CATS: ExpenseCategory[] = ["materials", "fuel", "dump", "tools", "other"];
/** the usual vendors after the company's own suppliers (spec 36 §7) */
const USUAL = ["Home Depot", "Lowe's", "ABC Supply", "Chevron"];

/** Receipt → expense, linked to a job so job profit is real. AI reading of the receipt comes in wave 6. */
export default function NewExpense() {
  const { t, money } = useI18n();
  const { db, addExpense, online } = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const VENDORS = expenseVendors(db, USUAL);
  const [vendor, setVendor] = useState(VENDORS[0] ?? "Home Depot");
  const [category, setCategory] = useState<ExpenseCategory>("materials");
  const todays = myVisitsToday(db);
  // a subcontractor: only a job of his today, never «Общий расход» (Р-8a: the server refuses it)
  const opts = expenseJobOptions(db, todays, meIsSub(db));
  // an inspection's in-memory job is never the default (it never reaches the server)
  const [jobId, setJobId] = useState<string>((opts.allowNone ? realJob(todays[0]?.jobId) : opts.jobs[0]?.key) ?? "none");
  const can = canStartExpense(opts);
  // #1558: the receipt made anew, or (not made yet) its original kept on this phone only — «preparing»
  const [picked, setPicked] = useState<PickedPhoto | undefined>();
  const photo = picked ? ("uri" in picked ? picked.uri : picked.preparing.uri) : undefined;
  // money through the engine, the app's one money parser (rule 8, #1537; features/expenseAmount)
  const cents = expenseAmountCents(amount);
  const ok = cents > 0;
  const form = useRequiredForm();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    // the receipt made smaller before it is kept (#642)
    const got = await prepPicked(res);
    if (got) setPicked(got);
  };
  const jobs = [
    ...(opts.allowNone ? [{ key: "none", label: t("exp.noJob") }] : []),
    // the job by its number and title, not the client's name (#1427 053)
    ...opts.jobs,
  ];
  // a subcontractor without a job today: nothing to fill in — why, and the way back
  if (!can)
    return (
      <Screen title={t("exp.title")} back={back}>
        <Empty icon="wallet" title={t("exp.subNoJob")} hint={t("exp.subNoJobHint")} action={<Button label={t("common.back")} variant="secondary" onPress={back} />} testID="expense-sub-no-job" />
      </Screen>
    );
  return (
    <Screen form title={t("exp.title")} back={back}>
      {/* the fields straight on the background, no card around them (DS §11 п.17, #1411) */}
      <FieldGroup>
        <Button label={t("exp.photo")} icon="camera" variant="secondary" onPress={pick} testID="expense-photo" />
        {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" /> : null}
        <T v="caption" tone="mut">
          {t("exp.aiNote")}
        </T>
        <TextField type="money" value={amount} onChangeText={setAmount} placeholder={t("exp.amount")} icon="dollar" field={form.field("amount")} />
        <ChoiceChips label={t("exp.vendor")} testID="expense-vendor" value={vendor} onChange={setVendor} items={VENDORS.map((v) => ({ key: v, label: v }))} />
        <ChoiceChips<ExpenseCategory> label={t("exp.category")} testID="expense-category" value={category} onChange={setCategory} items={CATS.map((c) => ({ key: c, label: t(`exp.cat.${c}`) }))} />
        <ChoiceChips label={t("exp.job")} testID="expense-job" value={jobId} onChange={setJobId} items={jobs} />
      </FieldGroup>
      <Button
        label={t("exp.save")}
        icon="check"
        full
        testID="expense-save"
        onPress={() =>
          form.submit(ok ? [] : [{ id: "amount", text: t("form.req.amount") }], () => {
          const undo = addExpense({ jobId: jobId === "none" ? null : jobId, vendor, category, amountCents: cents }, picked);
          toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
          back();
          })
        }
      />
    </Screen>
  );
}
