/**
 * «Вернуть деньги» from a receipt (step 20д, docs/specs/35-stripe.md §4в). Two steps in one sheet:
 * 1) how much (up to what the payment still brings), why, and what part is tax; a Stripe payment says Stripe's fee stays;
 * 2) «it cannot be undone» — there is no «Undo» toast for money that left (rule 5: a confirmation instead).
 * The server decides (owner/admin, the limit, a dispute); the sheet only shows our words for its answer.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { AnyPayment, Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Labeled, MoneyField } from "@/features/fields";
import {
  FINAL_REFUSALS,
  REFUND_KINDS,
  newRefundKey,
  refundSplit,
  refundable,
  viaStripe,
  type RefundError,
  type RefundKind,
} from "./refund";
import { Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";

export interface RefundDone {
  status: "succeeded" | "pending";
}
export function RefundSheet({
  visible,
  onClose,
  payment,
  invoice,
  online,
  feeCents,
  send,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  payment: AnyPayment;
  invoice?: Invoice;
  online: boolean;
  /** Stripe's processing fee of this payment, when known (it does not come back) */
  feeCents?: number;
  /** does the refund; the same key on a retry */
  send: (a: {
    amountCents: number;
    reasonKind: RefundKind;
    reason: string | null;
    key: string;
  }) => Promise<
    { ok: true; status: string } | { ok: false; error: RefundError }
  >;
  onDone: (d: RefundDone, amountCents: number) => void;
}) {
  const { t, money } = useI18n();
  const max = refundable(payment);
  const stripe = viaStripe(payment);
  const [amount, setAmount] = useState(max);
  const [kind, setKind] = useState<RefundKind>("goodwill");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [key, setKey] = useState(newRefundKey);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // a double tap: the second waits for nothing (the demo's refund is synchronous)
  const [err, setErr] = useState<RefundError | null>(null);
  // only when the sheet OPENS: the store's refresh (every 30 s) changes `max` after a refund that went through — the
  // sheet must not jump back to a full form with a new key while it says «tap again» (review 20д-2 №2)
  const wasVisible = useRef(false);
  useEffect(() => {
    const opened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (opened) {
      setAmount(max);
      setKind("goodwill");
      setReason("");
      setStep("form");
      setKey(newRefundKey());
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const split = refundSplit(amount, invoice);
  const valid = amount > 0 && amount <= max;
  const needReason = kind === "other" && !reason.trim();

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setErr(null);
    const r = await send({
      amountCents: amount,
      reasonKind: kind,
      reason: reason.trim() || null,
      key,
    });
    sending.current = false;
    setBusy(false);
    if (r.ok)
      onDone(
        { status: r.status === "pending" ? "pending" : "succeeded" },
        amount,
      );
    else {
      setErr(r.error);
      // a final «no» frees the amount: a next try is a new refund; anything else keeps the key (the same refund resumes)
      if (FINAL_REFUSALS.includes(r.error)) setKey(newRefundKey());
    }
  };

  const line = (label: string, v: string, testID?: string) => (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <View testID={testID}>
        <T v="body" tabular>
          {v}
        </T>
      </View>
    </RowView>
  );

  return (
    <Sheet
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title={t("mny.refund.title")}
      dirty={step === "form" && amount !== max && !busy}
    >
      {step === "form" ? (
        <View style={{ gap: space[3] }} testID="refund-form">
          <Labeled label={t("mny.refund.amount", { max: money(max) })}>
            <MoneyField
              cents={amount}
              onChange={(c) => {
                setAmount(c);
                setKey(newRefundKey());
              }}
            />
          </Labeled>
          {amount > max ? (
            <View testID="refund-above" style={{ gap: space[1] }}>
              <StatusChip status="warn" label={t("mny.refund.chip.warn")} />
              <T v="caption">{t("mny.refund.above", { max: money(max) })}</T>
            </View>
          ) : null}
          <ChoiceChips
            value={kind}
            onChange={setKind}
            items={REFUND_KINDS.map((k) => ({
              key: k,
              label: t(`mny.refund.kind.${k}` as DictKey),
            }))}
          />
          <TextField
            type="note"
            value={reason}
            onChangeText={setReason}
            placeholder={t("mny.refund.reason")}
          />
          <Card>
            {line(
              t("mny.refund.tax"),
              money(valid ? split.tax : 0),
              "refund-tax",
            )}
            {line(
              t("mny.refund.revenue"),
              money(valid ? split.revenue : 0),
              "refund-revenue",
            )}
            <T v="caption" tone="mut">
              {stripe
                ? t("mny.refund.toCard")
                : t("mny.refund.record", {
                    method: t(`pay.${payment.method}` as DictKey),
                  })}
            </T>
            {stripe ? (
              <View testID="refund-fee">
                <T v="caption" tone="mut">
                  {feeCents
                    ? t("mny.refund.feeStays", { fee: money(feeCents) })
                    : t("mny.refund.feeStaysAny")}
                </T>
              </View>
            ) : null}
          </Card>
          {!online ? (
            <View testID="refund-offline" style={{ gap: space[1] }}>
              <StatusChip status="warn" label={t("mny.refund.chip.warn")} />
              <T v="caption">{t("mny.refund.offline")}</T>
            </View>
          ) : null}
          <Button
            label={t("mny.refund.next", { amount: money(valid ? amount : 0) })}
            full
            disabled={!valid || needReason || !online}
            onPress={() => setStep("confirm")}
          />
        </View>
      ) : (
        <View style={{ gap: space[3] }} testID="refund-confirm">
          <T v="title">
            {t("mny.refund.confirmTitle", { amount: money(amount) })}
          </T>
          <T v="body" tone="mut">
            {/* an advance has no invoice that would owe it again (spec 35 §4г) */}
            {t(payment.invoiceId === null ? "mny.refund.irreversibleAdvance" : "mny.refund.irreversible")}
          </T>
          {err ? (
            <View testID="refund-error" style={{ gap: space[1] }}>
              <StatusChip status="bad" label={t("mny.refund.chip.bad")} />
              <T v="body">{t(`mny.refund.err.${err}` as DictKey)}</T>
            </View>
          ) : null}
          <Button
            label={
              busy
                ? t("mny.refund.busy")
                : t("mny.refund.do", { amount: money(amount) })
            }
            variant="danger"
            icon="check"
            full
            disabled={busy || !online}
            onPress={confirm}
          />
          <Button
            label={t("mny.refund.back")}
            variant="secondary"
            full
            disabled={busy}
            onPress={() => setStep("form")}
          />
        </View>
      )}
    </Sheet>
  );
}
