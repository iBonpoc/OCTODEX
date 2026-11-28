/**
 * #3124 В1 (spec 71 §16): the job in the look «Линия работы» — instead of the sections strip, one line of its steps (StepLine,
 * DS §8.15) built from what the app already has (features/job/jobLine.ts): the estimate, the invoices, the payments and refunds,
 * the visits, the expenses, the orders. Over it the money in one line (the office: «Оплачено $X из $Y · ждём $Z»); under it
 * «＋ Шаг» — what the job's «＋» already makes. The job's ONE main step (the screen's own rule, unchanged) stands over the line
 * (MainStep `top`): the job keeps the tab bar (the founder 27.11: «нижнюю панель не трогаем»), so nothing is pinned at the bottom.
 * Rights as now: the tech sees the steps without the contract's sums (`showMoney`).
 */
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { layout, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ID } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { jobLineOf, type JobLineKind, type JobLineStep } from "@/features/job/jobLine";
import { MainStep } from "@/ui/mainStep";
import type { MenuItem } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { StepLine, type StepLineItem } from "@/ui/stepLine";
import { Empty } from "@/ui/surfaces";
import type { MainAction } from "@/ui/templates";

export const LINE_KIND: Record<JobLineKind, DictKey> = {
  estimate: "line.kind.estimate",
  deposit: "line.kind.deposit",
  progress: "line.kind.progress",
  final: "line.kind.final",
  invoice: "line.kind.invoice",
  payment: "line.kind.payment",
  refund: "line.kind.refund",
  visit: "line.kind.visit",
  expense: "line.kind.expense",
  order: "line.kind.order",
};

/** one step of the line as the StepLine shows it */
export function useStepItem() {
  const { t, money, day } = useI18n();
  return (s: JobLineStep): StepLineItem => ({
    key: s.id,
    title: t(LINE_KIND[s.kind]),
    // a visit's sum is what it takes on site — said so (the bare figure read as the whole contract)
    sub: [s.at ? day(s.at) : null, s.kind === "visit" && s.cents !== undefined ? t("line.dueOnVisit") : null].filter(Boolean).join(" · ") || undefined,
    value: s.cents !== undefined ? money(s.cents) : undefined,
    state: s.state,
    // an expense has no state of its own: no word on it
    status: s.kind === "expense" ? undefined : s.state === "done" ? { status: "ok", label: t("line.done") } : s.state === "current" ? { status: "info", label: t("line.now") } : undefined,
    onPress: s.href ? () => router.push(s.href as Href) : undefined,
    testID: `line-step-${s.id.replace(":", "-")}`,
  });
}

export function JobLine({ jobId, showMoney, main, add, onAdd }: {
  jobId: ID;
  showMoney: boolean;
  /** the job's main step (job/[id].tsx), over the line */
  main?: MainAction;
  /** what «＋ Шаг» offers: the job's own «＋» items */
  add: MenuItem<string>[];
  onAdd: (k: string) => void;
}) {
  const { db } = useStore();
  const { t, money } = useI18n();
  const line = jobLineOf(db, jobId, showMoney);
  const item = useStepItem();
  return (
    // 820/1280: one column of a form's width — the sums stay beside their steps, not 1000 pt away
    <View testID="job-line" style={{ gap: space[3], maxWidth: layout.formMax }}>
      {line.money ? (
        <View testID="job-line-money">
          <T v="body" w="semibold">
          {[t("line.paidOf", { paid: money(line.money.paidCents), total: money(line.money.totalCents) }), line.money.dueCents > 0 ? t("line.waiting", { due: money(line.money.dueCents) }) : null].filter(Boolean).join(" · ")}
          </T>
        </View>
      ) : null}
      {main ? <MainStep placement="top" fit main={main} /> : null}
      {line.steps.length || add.length ? (
        <StepLine
          testID="job-line-steps"
          label={t("line.steps")}
          items={line.steps.map(item)}
          add={add.length ? { label: t("line.add"), items: add, onSelect: onAdd, testID: "job-line-add" } : undefined}
        />
      ) : (
        <Empty icon="history" title={t("line.noSteps")} />
      )}
    </View>
  );
}
