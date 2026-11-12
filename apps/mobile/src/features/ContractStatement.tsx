import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { contractStatement, progressAmount } from "@octo/estimating-engine";
import { isOverdue, useStore } from "@/data/store";
import type { Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { MoneyField, PctField } from "./fields";
import { Button, Segmented, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";

export function invoiceChip(i: Invoice): { s: "ok" | "info" | "warn" | "bad"; l: DictKey } {
  if (i.paidCents >= i.totalCents) return { s: "ok", l: "money.paid" };
  if (isOverdue(i.dueDate)) return { s: "bad", l: "st.overdue" };
  if (i.paidCents > 0) return { s: "warn", l: "inv.partial" };
  return { s: "info", l: "money.awaiting" };
}

/**
 * Contract statement for a job (docs/13 §5): contract / invoiced / paid / left to bill,
 * the job's invoices, "Bill the balance" and "Progress invoice".
 */
export function ContractStatement({ jobId }: { jobId: string }) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<"pct" | "fixed">("pct");
  const [bps, setBps] = useState(5000);
  const [cents, setCents] = useState(0);
  const [title, setTitle] = useState("");
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const invoices = db.invoices.filter((i) => i.jobId === jobId).sort((a, b) => (a.sentAt ?? a.dueDate).localeCompare(b.sentAt ?? b.dueDate));
  const st = contractStatement(job.amountCents, invoices);
  const hasFinal = invoices.some((i) => i.kind === "final");
  const progress = mode === "pct" ? progressAmount(job.amountCents, st.invoiced, bps) : Math.min(cents, st.toInvoice);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));

  const row = (label: string, v: number, strong?: boolean) => (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v={strong ? "heading" : "body"} tone={strong ? "ink" : "mut"}>
        {label}
      </T>
      <T v={strong ? "title" : "body"} tabular>
        {money(v)}
      </T>
    </RowView>
  );

  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("inv.statement")} />
      <Card>
        {row(t("inv.contract"), st.contract)}
        {row(t("inv.invoiced"), st.invoiced)}
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
                title={i.title || t(`inv.kind.${i.kind ?? "final"}` as DictKey)}
                when={[i.number, t("money.due", { date: day(i.dueDate) }), i.paidCents > 0 && i.paidCents < i.totalCents ? t("inv.paidPart", { amount: money(i.paidCents) }) : undefined].filter(Boolean).join(" · ")}
                value={money(i.totalCents)}
                status={{ tone: chip.s, label: t(chip.l) }}
                onPress={() => router.push(`/invoice/${i.id}`)}
              />
            );
          })}
        </CardGrid>
      ) : null}
      {st.toInvoice > 0 ? (
        <RowView style={{ flexWrap: "wrap" }}>
          {!hasFinal ? (
            <Button
              label={t("inv.billBalance", { amount: money(st.toInvoice) })}
              testID="statement-bill-balance"
              icon="invoice"
              onPress={() => toast.show(q(t("inv.issued")), store.issueInvoice(jobId, "final", st.toInvoice, "Final balance"))}
            />
          ) : null}
          <Button label={t("inv.progress")} testID="statement-progress" icon="plus" variant="secondary" onPress={() => setSheet(true)} />
        </RowView>
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
              toast.show(q(t("inv.issued")), store.issueInvoice(jobId, "progress", progress, title.trim() ? `Progress: ${title.trim()}` : "Progress payment"));
              setSheet(false);
              setTitle("");
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}
