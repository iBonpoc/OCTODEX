import { useRequiredForm } from "@/ui/requiredForm";
import { useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { radius, space, component } from "@octo/design-tokens";
import { expenseAmountCents } from "@/features/expenseAmount";
import { isToday, useStore } from "@/data/store";
import type { ExpenseCategory } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { PickerSheet } from "@/ui/pickerSheet";
import { DatePick } from "@/features/DatePick";
import { companyToday } from "@/features/zone";
import { expenseJobsFor, startJob, vendorChoices } from "@/features/expenseForm";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { FieldGroup, FormMain, Screen } from "@/ui/surfaces";
import { isAssigned } from "@/features/schedule";
import { shrinkPicked } from "@/data/photoShrink";

const CATS: ExpenseCategory[] = ["materials", "fuel", "dump", "tools", "other"];

/** Receipt → expense, linked to a job so job profit is real. AI reading of the receipt comes in wave 6. */
export default function NewExpense() {
  const { t, money } = useI18n();
  const { db, addExpense, online, role } = useStore();
  const { dayOf } = useI18n();
  const params = useLocalSearchParams<{ jobId?: string }>();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  // #2008: nothing is chosen for the person — the vendor is picked or typed (free text, no supplier is made silently)
  const [vendor, setVendor] = useState<string | null>(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const VENDORS = vendorChoices(db, vendor ?? undefined);
  const [category, setCategory] = useState<ExpenseCategory>("materials");
  // #2008: the job it was opened from (the job's or a visit's screen); else the one job of today's visits; else none.
  // The choices are every job the person may use (the server's rule), not only today's
  const JOBS = expenseJobsFor(db, role);
  const todays = db.visits.filter((v) => isToday(v.start) && isAssigned(v, db.me)).map((v) => v.jobId).filter((x): x is string => !!x);
  const [jobId, setJobId] = useState<string>(() => startJob(JOBS, typeof params.jobId === "string" ? params.jobId : undefined, todays) ?? "none");
  const [jobOpen, setJobOpen] = useState(false);
  // #2008: the receipt's day — today of the company, or an earlier day (a receipt of yesterday is entered yesterday's)
  const [date, setDate] = useState(() => companyToday());
  const [calendar, setCalendar] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  // money through the engine, the app's one money parser (rule 8, #1537; features/expenseAmount)
  const cents = expenseAmountCents(amount);
  const ok = cents > 0;
  const form = useRequiredForm();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    // the receipt made smaller before it is kept (#642)
    const uri = await shrinkPicked(res);
    if (uri) setPhoto(uri);
  };
  const jobs = [
    { key: "none", label: t("exp.noJob") },
    // the job by its number and title, the client under it (#1427 053)
    ...JOBS,
  ];
  return (
    <Screen form title={t("exp.title")} back={back}>
      {/* the fields straight on the background, no card around them (DS §11 п.17, #1411) */}
      <FieldGroup>
        <Button label={t("exp.photo")} icon="camera" variant="secondary" onPress={pick} testID="expense-photo" />
        {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" /> : null}
        <T v="caption" tone="mut">
          {t("exp.aiNote")}
        </T>
        <TextField type="money" value={amount} onChangeText={setAmount} label={t("exp.amount")} placeholder="0.00" icon="dollar" field={form.field("amount")} />
        {/* where it was bought — an object: a row that opens the list with search and «Указать „…“» (DS А3, #2008) */}
        <SelectField<string>
          label={t("exp.vendor")}
          testID="field-vendor"
          value={vendor}
          items={VENDORS.map((v) => ({ key: v, label: v }))}
          onChange={(v) => setVendor(v)}
          onOpen={() => setVendorOpen(true)}
          field={form.field("vendor")}
        />
        <SelectField<ExpenseCategory> label={t("exp.category")} testID="expense-category" value={category} onChange={setCategory} items={CATS.map((c) => ({ key: c, label: t(`exp.cat.${c}`) }))} />
        <SelectField<string> label={t("exp.job")} testID="expense-job" value={jobId} items={jobs} onChange={setJobId} onOpen={() => setJobOpen(true)} />
        <SelectField<string> label={t("exp.date")} testID="expense-date" value={date} items={[{ key: date, label: dayOf(date) }]} onChange={() => {}} onOpen={() => setCalendar((x) => !x)} />
        {calendar ? (
          <View testID="expense-date-calendar">
            <DatePick range="past" value={date} onPick={(k) => { setDate(k); setCalendar(false); }} />
          </View>
        ) : null}
      </FieldGroup>
      {/* the main button stands apart from the last field (DS §11 п.17) */}
      <FormMain>
        <Button
          label={t("exp.save")}
          icon="check"
          full
          testID="expense-save"
          onPress={() =>
            form.submit([...(ok ? [] : [{ id: "amount", text: t("form.req.amount") }]), ...(vendor ? [] : [{ id: "vendor", text: t("exp.vendorNeed") }])], () => {
            const undo = addExpense({ jobId: jobId === "none" ? null : jobId, vendor: vendor!, category, amountCents: cents, receiptUri: photo, date });
            toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
            back();
            })
          }
        />
      </FormMain>
      <PickerSheet<string>
        visible={vendorOpen}
        title={t("exp.vendorPick")}
        items={VENDORS.map((v) => ({ key: v, label: v }))}
        value={vendor}
        onSelect={(v) => { setVendor(v); form.field("vendor").clear(); }}
        onCreate={(v) => { setVendor(v); form.field("vendor").clear(); }}
        onClose={() => setVendorOpen(false)}
        testID="expense-vendor-picker"
      />
      <PickerSheet<string>
        visible={jobOpen}
        title={t("exp.jobPick")}
        items={jobs}
        value={jobId}
        onSelect={setJobId}
        onClose={() => setJobOpen(false)}
        testID="expense-job-picker"
      />
    </Screen>
  );
}
