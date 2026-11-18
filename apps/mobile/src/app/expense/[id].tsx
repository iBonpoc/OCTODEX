import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { hasReceipt } from "@/data/photoUpload";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { ReadOnly } from "@/ui/readOnly";
import { useRequiredForm } from "@/ui/requiredForm";
import { FieldGroup, FormMain, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";
import { useExpenseDraft, useExpenseFields } from "@/features/ExpenseFields";
import { canEditExpense, expenseDay } from "@/features/expenseForm";
import { memberName } from "@/features/team";
import type { Expense } from "@/data/types";

/**
 * An expense's own screen (#2009): open, fix, remove. The fields are the new expense's (features/ExpenseFields); saved
 * over the version the phone read («someone changed it first» otherwise); «Удалить расход» puts it in the Trash with
 * «Вернуть» while it has not left the phone (rule 5). Who may: the person who entered it, and the office for anyone's —
 * as the server's policy (expenses_update, trash_items); others see it read-only.
 */
export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { db } = useStore();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const x = (db.expenses ?? []).find((e) => e.id === id);
  if (!x)
    return (
      <Screen title={t("exp.one")} back={back}>
        <NotFound title={t("exp.notFound")} listLabel={t("nav.expenses")} onList={() => router.replace("/money")} testID="expense-not-found" />
      </Screen>
    );
  // keyed by the expense and its version: another phone's change read in starts the form again from it
  return <ExpenseForm key={`${x.id}:${x.rowVersion ?? ""}`} x={x} back={back} />;
}

function ExpenseForm({ x, back }: { x: Expense; back: () => void }) {
  const { t, money } = useI18n();
  const { db, role, online, updateExpense, removeExpense } = useStore();
  const toast = useToast();
  const form = useRequiredForm();
  const draft = useExpenseDraft({ amount: (x.amountCents / 100).toFixed(2), vendor: x.vendor || null, category: x.category, jobId: x.jobId ?? "none", date: expenseDay(x) });
  const { fields, sheets } = useExpenseFields(draft, form, x.jobId);
  const may = canEditExpense(role, db.me, x);
  const save = () =>
    form.submit(draft.missing(t), () => {
      const { d, cents } = draft;
      const undo = updateExpense(x.id, { jobId: d.jobId === "none" ? null : d.jobId, vendor: d.vendor!, category: d.category, amountCents: cents, date: d.date });
      toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
      back();
    });
  const remove = () => {
    const undo = removeExpense(x.id);
    toast.show(t("exp.removed", { amount: money(x.amountCents) }), undo);
    back();
  };
  return (
    <Screen form title={t("exp.one")} back={back} testID="expense-screen">
      <FieldGroup>
        {hasReceipt(x) && x.receiptUri ? (
          <Image testID="expense-receipt" source={{ uri: x.receiptUri }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" />
        ) : null}
        {may ? null : (
          <View testID="expense-readonly">
            <T v="caption" tone="mut">
              {t("exp.readOnly", { name: memberName(db, x.memberId, t) ?? "—" })}
            </T>
          </View>
        )}
        <ReadOnly value={!may}>{fields}</ReadOnly>
      </FieldGroup>
      {may ? (
        <FormMain>
          <Button label={t("exp.save")} icon="check" full testID="expense-save" onPress={save} />
          {/* a removal that can be taken back: the toast «Вернуть», no dialog (DS Б3); the Trash keeps it on the server */}
          <Button label={t("exp.remove")} icon="trash" variant="ghost" testID="expense-remove" onPress={remove} />
        </FormMain>
      ) : null}
      {sheets}
    </Screen>
  );
}
