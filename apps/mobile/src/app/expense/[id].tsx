import { useRef, useState, type ComponentRef } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { hasReceipt } from "@/data/photoUpload";
import type { Expense } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, IconButton } from "@/ui/controls";
import { Menu, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { useRequiredForm } from "@/ui/requiredForm";
import { Card, FieldGroup, FormMain, ListRow, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";
import { EXPENSE_CATS, useExpenseDraft, useExpenseFields } from "@/features/ExpenseFields";
import { canEditExpense, expenseDay, expenseJobsFor } from "@/features/expenseForm";
import { memberName } from "@/features/team";

/**
 * An expense's own screen (#2009): open, fix, remove. The title is the vendor, under it the amount, the receipt's day and
 * who entered it (DS §12.3 «Карточка объекта»). The fields are the new expense's (features/ExpenseFields); saved over the
 * version the phone read. «Удалить расход» is in «⋯» (DS §12.2, the dangerous last): to the Trash, «Отменить» while it has
 * not left the phone (rule 5, DS Б3). Who may: the person who entered it and the office for anyone's — as the server
 * (expenses_update, trash_items); others see the details as rows, read only.
 */
export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { db } = useStore();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  const x = (db.expenses ?? []).find((e) => e.id === id);
  // once removed here: no «не найден» flash while the screen goes back
  const [leaving, setLeaving] = useState(false);
  if (!x)
    return (
      <Screen title={t("exp.one")} back={back}>
        {leaving ? null : <NotFound title={t("exp.notFound")} listLabel={t("nav.expenses")} onList={() => router.replace("/money")} testID="expense-not-found" />}
      </Screen>
    );
  // keyed by the expense only: a version read in the background never throws away what is being typed
  return <ExpenseForm key={x.id} x={x} back={back} onLeave={() => setLeaving(true)} />;
}

function ExpenseForm({ x, back, onLeave }: { x: Expense; back: () => void; onLeave: () => void }) {
  const { t, money, dayOf } = useI18n();
  const { db, role, online, updateExpense, removeExpense } = useStore();
  const toast = useToast();
  const form = useRequiredForm();
  const draft = useExpenseDraft({ amount: (x.amountCents / 100).toFixed(2), vendor: x.vendor || null, category: x.category, jobId: x.jobId ?? "none", date: expenseDay(x) });
  const { fields, sheets } = useExpenseFields(draft, form, x.jobId);
  const may = canEditExpense(role, db.me, x);
  const who = memberName(db, x.memberId, t) ?? "—";
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const save = () =>
    form.submit(draft.missing(t), () => {
      const { d, cents } = draft;
      const undo = updateExpense(x.id, { jobId: d.jobId === "none" ? null : d.jobId, vendor: d.vendor!, category: d.category, amountCents: cents, date: d.date });
      toast.show(online ? t("exp.saved", { amount: money(cents) }) : t("offline.queued"), undo);
      back();
    });
  const remove = () => {
    onLeave();
    const undo = removeExpense(x.id);
    toast.show(t("exp.removed", { amount: money(x.amountCents) }), undo);
    back();
  };
  const more = may ? (
    <View ref={moreRef} collapsable={false} testID="expense-more">
      <IconButton icon="more" label={`${t("lead.more")}: ${x.vendor}`} onPress={() => moreRef.current?.measureInWindow((mx: number, my: number, w: number, h: number) => setMoreAt({ x: mx, y: my, w, h }))} />
    </View>
  ) : undefined;
  const job = x.jobId ? expenseJobsFor(db, "director").find((j) => j.key === x.jobId) : undefined;
  const receipt = hasReceipt(x) && x.receiptUri ? (
    <Image testID="expense-receipt" source={{ uri: x.receiptUri }} style={{ width: "100%", height: component.mediaH, borderRadius: radius.inner }} resizeMode="cover" />
  ) : null;
  return (
    <Screen
      form={may}
      title={x.vendor || t("exp.one")}
      subtitle={`${money(x.amountCents)} · ${dayOf(expenseDay(x))} · ${t("exp.by", { name: who })}`}
      back={back}
      right={more}
      testID="expense-screen"
    >
      {may ? (
        <>
          <FieldGroup>
            {receipt}
            {fields}
          </FieldGroup>
          <FormMain>
            <Button label={t("exp.save")} icon="check" full testID="expense-save" onPress={save} />
          </FormMain>
        </>
      ) : (
        // another person's expense outside the office: the details as rows in full colour, not pale fields (DS §11 п.14)
        <>
          {receipt}
          <View testID="expense-readonly">
          <Card>
            <ListRow title={t("exp.amount")} right={<T v="body" w="semibold" tabular>{money(x.amountCents)}</T>} chevron={false} />
            <ListRow title={t("exp.vendor")} right={<T v="body">{x.vendor}</T>} chevron={false} />
            <ListRow title={t("exp.category")} right={<T v="body">{t(`exp.cat.${EXPENSE_CATS.includes(x.category) ? x.category : "other"}`)}</T>} chevron={false} />
            <ListRow title={t("exp.job")} subtitle={job?.label ?? t("exp.noJob")} lines={2} chevron={false} />
            <ListRow title={t("exp.date")} right={<T v="body">{dayOf(expenseDay(x))}</T>} chevron={false} />
          </Card>
          </View>
          <T v="caption" tone="mut">
            {t("exp.readOnly", { name: who })}
          </T>
        </>
      )}
      {may ? sheets : null}
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={x.vendor}
        items={[{ key: "remove", label: t("exp.remove"), icon: "trash", destructive: true, testID: "expense-remove" }]}
        onSelect={() => {
          setMoreAt(null);
          remove();
        }}
        onClose={() => setMoreAt(null)}
      />
    </Screen>
  );
}
