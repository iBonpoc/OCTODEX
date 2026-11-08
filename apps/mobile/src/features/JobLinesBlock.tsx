/**
 * «Позиции» of a job made without an estimate (docs/specs/17-job.md §11.1, 3b-2): the lines as rows of one card (details
 * of one object, rule 12), the totals by the engine, the job's tax, the CA written-contract warning (no button: an
 * estimate approved later would make a second job). Owner / admin / office / sales change them; the technician only
 * reads (server: app.is_staff). A change below what is invoiced is refused here and on the server (db T69).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { dec, roundCents } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import { uid } from "@/features/estimateDoc";
import type { Job, JobLineItem, Role } from "@/data/types";
import { useI18n } from "@/i18n";
import { caContractWarning, jobClientExempt, lineChangeRefusal, linesEditable, linesOf, nextLinePosition, percentToBps, shownLineQty, totalOf, withJobLine, withJobTax, withoutJobLine, type LineRefusal } from "@/features/jobLines";
import { Button, StatusChip, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, ListRow, RowView, SectionTitle } from "@/ui/surfaces";

/** who changes a job's own lines: the server's app.is_staff (owner, admin, office, sales) */
export const canEditJobLines = (role: Role) => role !== "tech";

/** "12.50" / "$1,200" → cents through the engine (rule 8); null when it is not a number */
function dollarsToCents(s: string): number | null {
  const clean = s.replace(/[^0-9.]/g, "");
  if (!clean || !/^\d*\.?\d*$/.test(clean) || clean === ".") return null;
  return roundCents(dec(clean).mul(100));
}
const centsToDollars = (c: number) => (c / 100).toFixed(2);

type Draft = { id: string; isNew: boolean; name: string; quantity: string; price: string; taxable: boolean; position: number };
const sameDraft = (a: Draft, b: Draft) => a.name === b.name && a.quantity === b.quantity && a.price === b.price && a.taxable === b.taxable;

const REFUSAL_KEY: Record<LineRefusal, "job5.lines.err.estimate" | "job5.lines.err.done" | "job5.lines.err.below"> = {
  estimate: "job5.lines.err.estimate",
  done: "job5.lines.err.done",
  belowInvoiced: "job5.lines.err.below",
};

export function JobLinesBlock({ job }: { job: Job }) {
  const store = useStore();
  const { db } = store;
  const { t, money } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [orig, setOrig] = useState<Draft | null>(null);
  const [rate, setRate] = useState((job.taxRateBps ?? 0) / 100 + "");
  // a rate that came from the server (another phone, a sync) shows here too
  useEffect(() => setRate((job.taxRateBps ?? 0) / 100 + ""), [job.taxRateBps]);
  if (job.estimateId) return null;
  const lines = linesOf(db, job.id);
  const editable = linesEditable(job) && canEditJobLines(store.role);
  const exempt = jobClientExempt(db, job);
  const totals = totalOf(lines, job);
  const warn = caContractWarning(db, job.id);
  // «Отменить» may be refused (an invoice went out meanwhile): then say why, nothing changes
  const done = (msg: string, undo: () => boolean) => toast.show(store.online ? msg : t("offline.queued"), () => { if (!undo()) toast.show(t("job5.lines.err.undo")); });
  const refuse = (after: typeof db): boolean => {
    const r = lineChangeRefusal(db, after, job.id);
    if (r) toast.show(t(REFUSAL_KEY[r]));
    return !!r;
  };

  const open = (l?: JobLineItem) => {
    const d: Draft = l
      ? { id: l.id, isNew: false, name: l.name, quantity: l.quantity, price: centsToDollars(l.unitPriceCents), taxable: l.taxable, position: l.position }
      : { id: uid(), isNew: true, name: "", quantity: "1", price: "", taxable: true, position: nextLinePosition(db, job.id) };
    setOrig(d);
    setDraft(d);
  };
  const qtyOk = !!draft && /^\d*\.?\d+$/.test(draft.quantity.trim()) && dec(draft.quantity.trim()).gt(0);
  const priceCents = draft ? dollarsToCents(draft.price) : null;
  const ready = !!draft && draft.name.trim().length > 0 && qtyOk && priceCents !== null;
  const save = () => {
    if (!draft || !ready) return;
    const line: Omit<JobLineItem, "totalCents"> = {
      id: draft.id, jobId: job.id, position: draft.position, name: draft.name.trim(), quantity: draft.quantity.trim(), unitPriceCents: priceCents!, taxable: draft.taxable,
    };
    // refused: the sheet closes, the toast says why (the line stays as it was)
    if (refuse(withJobLine(db, line))) return setDraft(null);
    done(t("job5.lines.saved"), store.saveJobLine(line, draft.isNew));
    setDraft(null);
  };
  const remove = () => {
    if (!draft || draft.isNew) return setDraft(null);
    if (refuse(withoutJobLine(db, draft.id))) return setDraft(null);
    done(t("job5.lines.removed"), store.removeJobLine(draft.id));
    setDraft(null);
  };
  const setTax = (taxEnabled: boolean, rateText = rate) => {
    const parsed = taxEnabled ? percentToBps(rateText) : (job.taxRateBps ?? 0);
    if (parsed === null) return toast.show(t("job5.lines.err.rate"));
    const taxRateBps = parsed;
    if (refuse(withJobTax(db, job.id, { taxEnabled, taxRateBps }))) return;
    done(t("job5.lines.taxSaved"), store.setJobTax(job.id, { taxEnabled, taxRateBps }));
  };

  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("job5.lines.title")} right={editable ? <Button label={t("job5.lines.add")} icon="plus" size="sm" variant="ghost" onPress={() => open()} /> : undefined} />
      {warn ? (
        <Card status="warn">
          <RowView>
            <StatusChip status="warn" label={t("job5.ca.chip")} />
          </RowView>
          <T v="body">{t("job5.ca.text")}</T>
        </Card>
      ) : null}
      {lines.length ? (
        <Card>
          {lines.map((l) => (
            <ListRow
              key={l.id}
              title={l.name}
              subtitle={`${shownLineQty(l.quantity)} × ${money(l.unitPriceCents)}${l.taxable ? "" : ` · ${t("job5.lines.noTax")}`}`}
              right={<T v="body" tabular>{money(l.totalCents)}</T>}
              onPress={editable ? () => open(l) : undefined}
            />
          ))}
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" tone="mut">{t("job5.lines.subtotal")}</T>
            <T v="body" tabular>{money(totals.subtotal)}</T>
          </RowView>
          {job.taxEnabled ? (
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="body" tone="mut">{t("job5.lines.tax", { rate: (job.taxRateBps ?? 0) / 100 })}</T>
              <T v="body" tabular>{money(totals.tax)}</T>
            </RowView>
          ) : null}
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="heading">{t("job5.lines.total")}</T>
            <T v="title" tabular>{money(totals.total)}</T>
          </RowView>
        </Card>
      ) : (
        <T v="caption" tone="mut">{t("job5.lines.empty")}</T>
      )}
      {editable && lines.length && exempt && !job.taxEnabled ? (
        <T v="caption" tone="mut">{t("job5.lines.exempt")}</T>
      ) : null}
      {editable && lines.length && (!exempt || job.taxEnabled) ? (
        <Card>
          <Toggle on={!!job.taxEnabled} onChange={(on) => setTax(on)} label={t("job5.lines.taxToggle")} />
          {job.taxEnabled ? (
            <RowView>
              <View style={{ flex: 1 }}>
                <TextField type="percent" value={rate} onChangeText={setRate} placeholder={t("job5.lines.rate")} />
              </View>
              <Button label={t("job5.lines.rateSave")} size="sm" variant="secondary" onPress={() => setTax(true, rate)} />
            </RowView>
          ) : null}
        </Card>
      ) : null}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.isNew ? t("job5.lines.add") : t("job5.lines.edit")} dirty={!!draft && !!orig && !sameDraft(draft, orig)} onSave={ready ? save : undefined}>
        {draft ? (
          <View style={{ gap: space[3] }}>
            <TextField type="text" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder={t("job5.lines.name")} />
            <RowView>
              <View style={{ flex: 1 }}>
                <TextField type="number" value={draft.quantity} onChangeText={(quantity) => setDraft({ ...draft, quantity })} placeholder={t("job5.lines.qty")} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField type="money" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price })} placeholder={t("job5.lines.price")} icon="dollar" />
              </View>
            </RowView>
            <Toggle on={draft.taxable} onChange={(taxable) => setDraft({ ...draft, taxable })} label={t("job5.lines.taxable")} />
            <Button label={t("ue.save")} icon="check" full disabled={!ready} onPress={save} />
            {!draft.isNew ? <Button label={t("job5.lines.remove")} icon="trash" variant="ghost" full onPress={remove} /> : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

