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

const CATS: ExpenseCategory[] = ["materials", "fuel", "dump", "tools", "other"];
const VENDORS = ["Home Depot", "Lowe's", "ABC Supply", "Chevron"];

/** Receipt → expense, linked to a job so job profit is real. AI reading of the receipt comes in wave 6. */
export default function NewExpense() {
  const { t, money } = useI18n();
  const { db, addExpense, online } = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("Home Depot");
  const [category, setCategory] = useState<ExpenseCategory>("materials");
  const todays = db.visits.filter((v) => isToday(v.start) && v.techId === db.me);
  const [jobId, setJobId] = useState<string>(todays[0]?.jobId ?? "none");
  const [photo, setPhoto] = useState<string | undefined>();
  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const ok = Number.isFinite(cents) && cents > 0;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 }).catch(() => null);
    if (res && !res.canceled) setPhoto(res.assets[0]?.uri);
  };
  const jobs = [
    { key: "none", label: t("exp.noJob") },
    ...todays.map((v) => ({ key: v.jobId, label: visitContext(db, v).customer?.name ?? v.jobId })),
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
          <TextField type="money" value={amount} onChangeText={setAmount} placeholder={t("exp.amount")} icon="dollar" />
          <T v="caption" tone="mut">{t("exp.vendor")}</T>
          <ChoiceChips value={vendor} onChange={setVendor} items={VENDORS.map((v) => ({ key: v, label: v }))} />
          <T v="caption" tone="mut">{t("exp.category")}</T>
          <ChoiceChips<ExpenseCategory> value={category} onChange={setCategory} items={CATS.map((c) => ({ key: c, label: t(`exp.cat.${c}`) }))} />
          <T v="caption" tone="mut">{t("exp.job")}</T>
          <ChoiceChips value={jobId} onChange={setJobId} items={jobs} />
        </View>
      </Card>
      {!ok ? <T v="caption" tone="mut">{t("exp.need")}</T> : null}
      <Button
        label={t("exp.save")}
        icon="check"
        full
        disabled={!ok}
        onPress={() => {
          const undo = addExpense({ jobId: jobId === "none" ? null : jobId, vendor, category, amountCents: cents, receiptUri: photo });
          toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
          back();
        }}
      />
    </Screen>
  );
}
