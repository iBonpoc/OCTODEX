import { useRequiredForm } from "@/ui/requiredForm";
import { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { radius, space, component } from "@octo/design-tokens";
import { isToday, useStore, visitContext } from "@/data/store";
import type { ExpenseCategory } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Screen } from "@/ui/surfaces";
import { isAssigned } from "@/features/schedule";
import { expenseVendors } from "@/features/suppliers";

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
  const todays = db.visits.filter((v) => isToday(v.start) && isAssigned(v, db.me));
  const [jobId, setJobId] = useState<string>(todays[0]?.jobId ?? "none");
  const [photo, setPhoto] = useState<string | undefined>();
  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const ok = Number.isFinite(cents) && cents > 0;
  const form = useRequiredForm();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 }).catch(() => null);
    if (res && !res.canceled) setPhoto(res.assets[0]?.uri);
  };
  const jobs = [
    { key: "none", label: t("exp.noJob") },
    ...todays.filter((v): v is typeof v & { jobId: string } => !!v.jobId).map((v) => ({ key: v.jobId, label: visitContext(db, v).customer?.name ?? v.jobId })),
  ];
  return (
    <Screen title={t("exp.title")} back={back}>
      <Card>
        <View style={{ gap: space[3] }}>
          <Button label={t("exp.photo")} icon="camera" variant="secondary" onPress={pick} />
          {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" /> : null}
          <T v="caption" tone="mut">
            {t("exp.aiNote")}
          </T>
          <TextField type="money" value={amount} onChangeText={setAmount} placeholder={t("exp.amount")} icon="dollar" field={form.field("amount")} />
          <ChoiceChips label={t("exp.vendor")} testID="expense-vendor" value={vendor} onChange={setVendor} items={VENDORS.map((v) => ({ key: v, label: v }))} />
          <ChoiceChips<ExpenseCategory> label={t("exp.category")} testID="expense-category" value={category} onChange={setCategory} items={CATS.map((c) => ({ key: c, label: t(`exp.cat.${c}`) }))} />
          <ChoiceChips label={t("exp.job")} testID="expense-job" value={jobId} onChange={setJobId} items={jobs} />
        </View>
      </Card>
      <Button
        label={t("exp.save")}
        icon="check"
        full
        testID="expense-save"
        onPress={() =>
          form.submit(ok ? [] : [{ id: "amount", text: t("form.req.amount") }], () => {
          const undo = addExpense({ jobId: jobId === "none" ? null : jobId, vendor, category, amountCents: cents, receiptUri: photo });
          toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
          back();
          })
        }
      />
    </Screen>
  );
}
