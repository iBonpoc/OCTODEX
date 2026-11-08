/**
 * «Зачесть в счёт» for a client's advance (docs/specs/35-stripe.md §4г). One sheet: the invoices of THIS client that take the
 * whole advance (rows, rule 12 — a menu in a sheet), the smaller ones with «refund the difference first», then one button
 * «Зачесть $…» — the confirmation (rule 5: applied money is not undone by a toast). The server decides (owner/admin, the
 * client, the balance — T135); the sheet shows our words for its answer.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { Advance, DB, Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { advanceTargets, invoiceRoom, type AdvanceError } from "./advance";
import { Button, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { ListRow } from "@/ui/surfaces";

export function AdvanceSheet({
  visible,
  onClose,
  advance,
  db,
  online,
  send,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  advance: Advance;
  db: Pick<DB, "invoices" | "pendingPayments">;
  online: boolean;
  /** applies it on the server (or in the demo); a repeat of the same apply is the same answer */
  send: (invoiceId: string) => Promise<{ ok: true } | { ok: false; error: AdvanceError }>;
  onDone: (invoice: Invoice) => void;
}) {
  const { t, money } = useI18n();
  const targets = advanceTargets(db, advance);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AdvanceError | null>(null);
  const sending = useRef(false);
  const wasVisible = useRef(false);
  useEffect(() => {
    const opened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (opened) {
      setPick(targets.fits.length === 1 ? targets.fits[0]!.id : null);
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const chosen = targets.fits.find((i) => i.id === pick);
  const name = (i: Invoice) => [i.number, i.title].filter(Boolean).join(" · ") || "—";

  const confirm = async () => {
    if (!chosen || sending.current) return;
    sending.current = true;
    setBusy(true);
    setErr(null);
    const r = await send(chosen.id);
    sending.current = false;
    setBusy(false);
    if (r.ok) onDone(chosen);
    else setErr(r.error);
  };

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title={t("mny.adv.applyTitle", { amount: money(advance.amountCents) })}>
      <View style={{ gap: space[3] }} testID="advance-form">
        <T v="caption" tone="mut">
          {t("mny.adv.pick")}
        </T>
        {targets.fits.map((i) => (
          <View key={i.id} testID={`advance-inv-${i.id}`}>
            <ListRow
              title={name(i)}
              subtitle={t("mny.adv.room", { number: i.number ?? "", amount: money(invoiceRoom(db, i)) })}
              right={i.id === pick ? <Icon name="check" /> : undefined}
              onPress={() => setPick(i.id)}
            />
          </View>
        ))}
        {targets.smaller.map(({ invoice: i, refundFirst }) => (
          <View key={i.id} testID={`advance-small-${i.id}`}>
            <T v="caption" tone="mut">
              {t("mny.adv.refundFirst", { number: name(i), balance: money(invoiceRoom(db, i)), diff: money(refundFirst) })}
            </T>
          </View>
        ))}
        {targets.fits.length === 0 && targets.smaller.length === 0 ? (
          <View testID="advance-none">
            <T v="body" tone="mut">
              {t("mny.adv.none")}
            </T>
          </View>
        ) : null}
        {!online ? (
          <View testID="advance-offline" style={{ gap: space[1] }}>
            <StatusChip status="warn" label={t("mny.refund.chip.warn")} />
            <T v="caption">{t("mny.adv.offline")}</T>
          </View>
        ) : null}
        {err ? (
          <View testID="advance-error" style={{ gap: space[1] }}>
            <StatusChip status="bad" label={t("mny.refund.chip.bad")} />
            <T v="body">{t(`mny.adv.err.${err}` as DictKey)}</T>
          </View>
        ) : null}
        <Button
          label={busy ? t("mny.adv.busy") : t("mny.adv.do", { amount: money(advance.amountCents) })}
          icon="check"
          full
          disabled={!chosen || busy || !online}
          onPress={confirm}
        />
      </View>
    </Sheet>
  );
}
