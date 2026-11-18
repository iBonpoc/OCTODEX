/**
 * The fields of an expense — one for «Новый расход» and the expense's own screen (#2008, #2009): amount, where it was
 * bought (a list with search and «Указать „…“», free text — no supplier is made), category, job (every job the role may
 * use), the receipt's day (today or earlier). The lists are sheets at the end of the form.
 */
import { useState } from "react";
import { View } from "react-native";
import { useStore } from "@/data/store";
import type { ExpenseCategory, ID } from "@/data/types";
import { useI18n } from "@/i18n";
import { TextField } from "@/ui/controls";
import { PickerSheet } from "@/ui/pickerSheet";
import { SelectField } from "@/ui/selectField";
import type { useRequiredForm } from "@/ui/requiredForm";
import { DatePick } from "@/features/DatePick";
import { Labeled } from "@/features/fields";
import { expenseAmountCents } from "@/features/expenseAmount";
import { expenseJobsFor, vendorChoices } from "@/features/expenseForm";
import { companyToday } from "@/features/zone";

export const EXPENSE_CATS: ExpenseCategory[] = ["materials", "fuel", "dump", "tools", "other"];

export interface ExpenseDraft {
  amount: string;
  vendor: string | null;
  category: ExpenseCategory;
  jobId: ID | "none";
  date: string;
}

/** the form's state; `init` — an expense's values (its screen) or the start of a new one */
export function useExpenseDraft(init: Partial<ExpenseDraft> = {}) {
  const [d, setD] = useState<ExpenseDraft>(() => ({ amount: "", vendor: null, category: "materials", jobId: "none", date: companyToday(), ...init }));
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  // money through the engine, the app's one money parser (rule 8, #1537; features/expenseAmount)
  const cents = expenseAmountCents(d.amount);
  /** what is missing, for useRequiredForm().submit */
  const missing = (t: (k: "form.req.amount" | "exp.vendorNeed") => string) => [
    ...(cents > 0 ? [] : [{ id: "amount", text: t("form.req.amount") }]),
    ...(d.vendor ? [] : [{ id: "vendor", text: t("exp.vendorNeed") }]),
  ];
  return { d, set, cents, missing };
}

/**
 * `fields` go in the form's FieldGroup, `sheets` at the end of the screen (outside the group: a hidden sheet adds no gap).
 * `keepJob` — a job the expense is on already, offered even when the role could not pick it now (its own screen).
 */
export function useExpenseFields(draft: ReturnType<typeof useExpenseDraft>, form: ReturnType<typeof useRequiredForm>, keepJob?: ID | null) {
  const { t, dayOf } = useI18n();
  const { db, role } = useStore();
  const { d, set } = draft;
  const [vendorOpen, setVendorOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const VENDORS = vendorChoices(db, d.vendor ?? undefined);
  const allowed = expenseJobsFor(db, role);
  const kept = keepJob && !allowed.some((j) => j.key === keepJob) ? expenseJobsFor(db, "director").filter((j) => j.key === keepJob) : [];
  // the job by its number and title, the client under it (#1427 053); «Общий расход» first
  const jobs = [{ key: "none", label: t("exp.noJob") }, ...kept, ...allowed];
  const fields = (
    <>
      {/* the label above the field (DS §11 п.5): the placeholder is only an example */}
      <Labeled label={t("exp.amount")}>
        <TextField type="money" value={d.amount} onChangeText={(v) => set("amount", v)} label={t("exp.amount")} placeholder="0.00" icon="dollar" field={form.field("amount")} />
      </Labeled>
      {/* where it was bought — an object: a row that opens the list with search and «Указать „…“» (DS А3, #2008) */}
      <SelectField<string>
        label={t("exp.vendor")}
        testID="field-vendor"
        value={d.vendor}
        items={VENDORS.map((v) => ({ key: v, label: v }))}
        onChange={(v) => set("vendor", v)}
        onOpen={() => setVendorOpen(true)}
        field={form.field("vendor")}
      />
      <SelectField<ExpenseCategory> label={t("exp.category")} testID="expense-category" value={d.category} onChange={(v) => set("category", v)} items={EXPENSE_CATS.map((c) => ({ key: c, label: t(`exp.cat.${c}`) }))} />
      <SelectField<string> label={t("exp.job")} testID="expense-job" value={d.jobId} items={jobs} onChange={(v) => set("jobId", v)} onOpen={() => setJobOpen(true)} />
      <SelectField<string> label={t("exp.date")} testID="expense-date" value={d.date} items={[{ key: d.date, label: dayOf(d.date) }]} onChange={() => {}} onOpen={() => setCalendar((x) => !x)} />
      {calendar ? (
        <View testID="expense-date-calendar">
          <DatePick range="past" value={d.date} onPick={(k) => { set("date", k); setCalendar(false); }} />
        </View>
      ) : null}
    </>
  );
  const sheets = (
    <>
      <PickerSheet<string>
        visible={vendorOpen}
        title={t("exp.vendorPick")}
        items={VENDORS.map((v) => ({ key: v, label: v }))}
        value={d.vendor}
        onSelect={(v) => { set("vendor", v); form.field("vendor").clear(); }}
        onCreate={(v) => { set("vendor", v); form.field("vendor").clear(); }}
        onClose={() => setVendorOpen(false)}
        testID="expense-vendor-picker"
      />
      <PickerSheet<string>
        visible={jobOpen}
        title={t("exp.jobPick")}
        items={jobs}
        value={d.jobId}
        onSelect={(v) => set("jobId", v)}
        onClose={() => setJobOpen(false)}
        testID="expense-job-picker"
      />
    </>
  );
  return { fields, sheets };
}
