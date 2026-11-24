import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { contractStatement, progressAmount } from "@octo/estimating-engine";
import { isOverdue, useStore } from "@/data/store";
import { daysOverdue } from "@/data/selectors";
import type { Invoice } from "@/data/types";
import { canBill } from "@/features/billRights";
import { useI18n, type DictKey } from "@/i18n";
import { MoneyField, PctField } from "./fields";
import { Button, Segmented, TextField } from "@/ui/controls";
import { ButtonPair } from "@/ui/pairs";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { VoidInvoiceCards } from "@/features/invoice/VoidInvoice";
import { invoiceTitle } from "@/features/invoiceTitle";

/**
 * One word of an invoice's status everywhere it is shown — its card, the list, the job's statement, the client's and the
 * property's sections (#1495, #1728): an overdue one says «Просрочен N дн», not a bare «Просрочено». Label: t(chip.l, chip.p).
 */
export function invoiceChip(i: Invoice): { s: "ok" | "info" | "warn" | "bad"; l: DictKey; p?: { d: number } } {
  if (i.paidCents >= i.totalCents) return { s: "ok", l: "money.paid" };
  if (isOverdue(i.dueDate)) return { s: "bad", l: "card.sign.overdueDays", p: { d: daysOverdue(i.dueDate) } };
  if (i.paidCents > 0) return { s: "warn", l: "inv.partial" };
  return { s: "info", l: "money.awaiting" };
}

/**
 * Contract statement for a job (docs/13 §5): contract / invoiced / paid / left to bill,
 * the job's invoices, "Bill the balance" and "Progress invoice".
 */
export function ContractStatement({
  jobId,
  hideContract,
  quiet,
}: {
  jobId: string;
  /** the screen shows the contract sum already (its head, LAYOUT-RULES П7) */
  hideContract?: boolean;
  /** the screen has its own one main button (LAYOUT-RULES П2): «Выставить остаток» here is secondary */
  quiet?: boolean;
}) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<"pct" | "fixed">("pct");
  const [bps, setBps] = useState(5000);
  const [cents, setCents] = useState(0);
  const [title, setTitle] = useState("");
  const [balanceSent, setBalanceSent] = useState(false);
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const invoices = db.invoices.filter((i) => i.jobId === jobId).sort((a, b) => (a.sentAt ?? a.dueDate).localeCompare(b.sentAt ?? b.dueDate));
  const st = contractStatement(job.amountCents, invoices);
  const hasFinal = invoices.some((i) => i.kind === "final");
  const progress = mode === "pct" ? progressAmount(job.amountCents, st.invoiced, bps) : Math.min(cents, st.toInvoice);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  // #865: an invoice the store refused (above the contract) says so, with no «Отменить»; a second tap on «Выставить
  // остаток» before the screen redraws is not a second invoice and does not replace the first one's «Отменить» (rule 5)
  const issue = (kind: "progress" | "final", amount: number, name: string) => {
    const undo = store.issueInvoice(jobId, kind, amount, name);
    if (undo) toast.show(q(t("inv.issued")), undo);
    else toast.show(t("inv.overContract.screen"));
    return !!undo;
  };

  const progressButton = { label: t("inv.progress"), testID: "statement-progress", icon: "plus" as const, variant: "secondary" as const, onPress: () => setSheet(true) };

  const row = (label: string, v: number, strong?: boolean, testID?: string) => (
    <View testID={testID}>
    <RowView style={{ justifyContent: "space-between" }}>
      <T v={strong ? "heading" : "body"} tone={strong ? "ink" : "mut"}>
        {label}
      </T>
      <T v={strong ? "title" : "body"} tabular>
        {money(v)}
      </T>
    </RowView>
    </View>
  );

  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("inv.statement")} />
      <Card>
        {hideContract ? null : row(t("inv.contract"), st.contract)}
        {row(t("inv.invoiced"), st.invoiced, false, "statement-invoiced")}
        {row(t("inv.paid"), st.paid)}
        <Divider />
        {row(t("inv.remaining"), st.remaining, true)}
        {st.toInvoice > 0 ? (
          <T v="caption" tone="mut">
            {t("inv.toInvoice", { amount: money(st.toInvoice) })}
          </T>
        ) : null}
      </Card>
      {invoices.length ? (
        <CardGrid>
          {invoices.map((i) => {
            const chip = invoiceChip(i);
            return (
              // the contract's invoices (06 «Серия B», B4): what it is for, number · due · paid part, total on the right, status chip
              <ListCard
                key={i.id}
                density="compact"
                testID={`statement-invoice-${i.id}`}
                lead={{ kind: "icon", icon: "invoice" }}
                title={invoiceTitle(i, t)}
                when={[i.number, t("money.due", { date: day(i.dueDate) }), i.paidCents > 0 && i.paidCents < i.totalCents ? t("inv.paidPart", { amount: money(i.paidCents) }) : undefined].filter(Boolean).join(" · ")}
                value={money(i.totalCents)}
                status={{ tone: chip.s, label: t(chip.l, chip.p) }}
                onPress={() => router.push(`/invoice/${i.id}`)}
              />
            );
          })}
        </CardGrid>
      ) : null}
      <VoidInvoiceCards list={(db.voidInvoices ?? []).filter((i) => i.jobId === jobId)} testPrefix="statement" />
      {st.toInvoice > 0 && canBill(store.role) ? (
        // two buttons in a row when they fit (DS §7.4, #2350): «Промежуточный» on the left, «Выставить остаток» on the right
        <ButtonPair
          main={
            !hasFinal
              ? {
                  label: t("inv.billBalance", { amount: money(st.toInvoice) }),
                  testID: "statement-bill-balance",
                  icon: "invoice",
                  variant: quiet ? "secondary" : undefined,
                  disabled: balanceSent,
                  onPress: () => {
                    if (balanceSent) return;
                    setBalanceSent(true);
                    if (!issue("final", st.toInvoice, "Final balance")) setBalanceSent(false);
                  },
                }
              : progressButton
          }
          second={!hasFinal ? progressButton : null}
        />
      ) : null}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t("inv.progress")}>
        <View style={{ gap: space[3] }}>
          <Segmented
            full
            value={mode}
            onChange={setMode}
            items={[
              { key: "pct", label: t("ue.depositPct") },
              { key: "fixed", label: t("ue.depositUsd") },
            ]}
          />
          {mode === "pct" ? <PctField bps={bps} onChange={(b) => setBps(Math.min(b, 10000))} /> : <MoneyField cents={cents} onChange={setCents} />}
          <TextField type="title" value={title} onChangeText={setTitle} placeholder={t("inv.progressTitle")} />
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" tone="mut">
              {t("inv.amount")}
            </T>
            <T v="title" tabular>
              {money(progress)}
            </T>
          </RowView>
          <Button
            label={t("inv.issue")}
            testID="statement-progress-issue"
            icon="check"
            full
            disabled={progress <= 0}
            onPress={() => {
              issue("progress", progress, title.trim() ? `Progress: ${title.trim()}` : "Progress payment");
              setSheet(false);
              setTitle("");
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}
