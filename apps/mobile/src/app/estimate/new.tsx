import { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, size } from "@octo/design-tokens";
import { LINE_GROUPS, activeLines, type CustomLine, type CustomOption, type DepositSetting, type LineGroup } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { EstimateDoc } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { MAX_OPTIONS, cloneOption, costComplete, estimateTitle, exemptDoc, hasContent, lineMarks, newDoc, optionTotals, uid } from "@/features/estimateDoc";
import { LineMarks } from "@/features/LineMarks";
import { ClientPicker } from "@/features/estimatePickers";
import { LineSheet } from "@/features/LineSheet";
import { Labeled, MoneyField, PctField } from "@/features/fields";
import { Avatar, Button, Segmented, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Grid, RowView, Screen, SectionTitle } from "@/ui/surfaces";

type SettingKind = "discount" | "tax" | "deposit" | null;
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/**
 * Estimate builder for any trade, laid out like Jobber / Housecall Pro quotes:
 * client → title → one list of line items (catalog or custom) → totals with discount, tax, deposit → message → send.
 * Type of a line (service / labor / material) only drives which lines are taxed.
 */
export default function EstimateBuilder() {
  const params = useLocalSearchParams<{ id?: string; customerId?: string; propertyId?: string; leadId?: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money } = useI18n();
  const toast = useToast();
  const existing = params.id ? db.estimates.find((e) => e.id === params.id) : undefined;
  const [estimateId] = useState(() => existing?.id ?? uid());
  const [customerId, setCustomerId] = useState(existing?.customerId ?? params.customerId);
  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? params.propertyId);
  const [doc, setDoc] = useState<EstimateDoc>(() => (existing?.doc ? (JSON.parse(JSON.stringify(existing.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps)));
  const [title, setTitle] = useState(existing?.doc ? existing.title : "");
  const [cur, setCur] = useState(() => Math.max(0, doc.options.findIndex((o) => o.recommended)));
  const [editing, setEditing] = useState<CustomLine | null | "new">(null);
  const [setting, setSetting] = useState<SettingKind>(null);
  const [clientPicker, setClientPicker] = useState(!customerId);

  const customer = db.customers.find((c) => c.id === customerId);
  const property = db.properties.find((p) => p.id === propertyId) ?? db.properties.find((p) => p.customerId === customerId);
  const option = doc.options[Math.min(cur, doc.options.length - 1)]!;
  // a tax-exempt client: no sales tax on the estimate (the server refuses it, П-2a)
  const exempt = !!customer?.taxExempt;
  const counted = useMemo(() => exemptDoc(doc, exempt), [doc, exempt]);
  const totals = useMemo(() => optionTotals(counted, option), [counted, option]);
  const s = counted.settings;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const setOption = (fn: (o: CustomOption) => CustomOption) =>
    setDoc((d) => ({ ...d, options: d.options.map((o) => (o.id === option.id ? fn(o) : o)) }));
  const setSettings = (patch: Partial<EstimateDoc["settings"]>) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const saveLines = (lines: CustomLine[]) =>
    setOption((o) => {
      const idx = o.lines.findIndex((l) => l.id === lines[0]?.id);
      if (idx >= 0) return { ...o, lines: o.lines.map((l) => (l.id === lines[0]!.id ? lines[0]! : l)) };
      return { ...o, lines: [...o.lines, ...lines] };
    });
  const removeLine = (id: string) => {
    const prev = doc;
    setOption((o) => ({ ...o, lines: o.lines.filter((l) => l.id !== id) }));
    toast.show(t("ue.lineRemoved"), () => setDoc(prev));
  };
  const addOption = () => {
    if (doc.options.length >= MAX_OPTIONS) return;
    const o = cloneOption(option, doc.options.length);
    setDoc((d) => ({ ...d, options: [...d.options, o] }));
    setCur(doc.options.length);
  };
  const removeOption = () => {
    if (doc.options.length < 2) return;
    const prev = doc;
    setDoc((d) => ({ ...d, options: d.options.filter((o) => o.id !== option.id) }));
    setCur(0);
    toast.show(t("ue.optionRemoved"), () => setDoc(prev));
  };
  const setRecommended = (on: boolean) =>
    setDoc((d) => ({ ...d, options: d.options.map((o) => ({ ...o, recommended: o.id === option.id ? on : on ? false : o.recommended })) }));

  const ok = !!customer && !!property && hasContent(doc);
  const save = (send: boolean) => {
    if (!customer || !property) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const clean: EstimateDoc = exemptDoc({ ...doc, options: doc.options.map((o) => ({ ...o, lines: activeLines(o.lines) })) }, customer.taxExempt);
    const undo = store.saveEstimate({
      id: estimateId, customerId: customer.id, propertyId: property.id, doc: clean, leadId: params.leadId,
      title: title.trim() || estimateTitle(clean, t("ue.title")),
    });
    toast.show(store.online ? t("ue.saved", { name: customer.name }) : t("offline.queued"), undo);
    router.replace(`/estimate/${estimateId}${send ? "?send=1" : ""}`);
  };

  const act = activeLines(option.lines);
  const lineTotal = (l: CustomLine) => totals.lineTotals[act.indexOf(l)] ?? 0;
  const taxGroups = LINE_GROUPS.filter((g) => s.tax.groups[g]);
  const taxValue = !s.tax.enabled || !taxGroups.length ? t("ue.off") : `${s.tax.rateBps / 100}% · ${taxGroups.map((g) => t(`ue.group.${g}` as DictKey).toLowerCase()).join(", ")}`;
  const discValue = !s.discount ? t("ue.add") : s.discount.kind === "pct" ? `${Number(s.discount.value) * 100}%` : money(s.discount.cents);
  const depValue = s.deposit.kind === "none" ? t("ue.none") : s.deposit.kind === "pct" ? `${s.deposit.bps / 100}% · ${money(totals.deposit)}` : money(totals.deposit);

  return (
    <Screen title={existing ? t("ue.title") : t("ue.newTitle")} back={back} help={t("ue.help")} hintKey="estimate-builder">
      {existing && existing.status !== "draft" ? (
        <T v="caption" tone="warn">
          {t("ue.editSentNote")}
        </T>
      ) : null}
      <Grid>
        <View style={{ gap: space[3] }}>
          <Card onPress={() => setClientPicker(true)} accessibilityLabel={t("est.for")}>
            <RowView>
              {customer ? <Avatar initials={initials(customer.name)} /> : <Icon name="user" />}
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold">
                  {customer?.name ?? t("ue.pickClient")}
                </T>
                {property ? (
                  <T v="caption" tone="mut">
                    {property.address}, {property.city}
                  </T>
                ) : null}
              </View>
              <Icon name="chevronRight" s={size.iconSm} />
            </RowView>
          </Card>
          <TextField type="title" value={title} onChangeText={setTitle} placeholder={t("ue.jobTitle")} icon="note" />

          {doc.options.length > 1 ? (
            <Card>
              <Segmented full value={option.id} onChange={(id) => setCur(doc.options.findIndex((o) => o.id === id))} items={doc.options.map((o) => ({ key: o.id, label: o.name || "—" }))} />
              <TextField type="title" value={option.name} onChangeText={(v) => setOption((o) => ({ ...o, name: v }))} placeholder={t("ue.optionName")} />
              <RowView style={{ minHeight: size.hitMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("ue.recommended")}
                </T>
                <Toggle label={t("ue.recommended")} on={!!option.recommended} onChange={setRecommended} />
              </RowView>
              <Button label={t("ue.removeOption")} icon="trash" variant="ghost" size="sm" onPress={removeOption} />
            </Card>
          ) : null}

          <SectionTitle title={t("ue.items")} right={act.length ? <T v="caption" tone="mut">{act.length}</T> : undefined} />
          {option.lines.map((l) => (
            <Card key={l.id} onPress={() => setEditing(l)} accessibilityLabel={l.name}>
              <RowView style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, gap: space[1] }}>
                  <T v="body" w="semibold">
                    {l.name}
                  </T>
                  {l.description ? (
                    <T v="caption" tone="mut" numberOfLines={2}>
                      {l.description}
                    </T>
                  ) : null}
                  <T v="caption" tone="mut" tabular>
                    {String(l.quantity)} {l.unit} × {money(l.unitPriceCents)} · {t(`ue.group.${l.group}` as DictKey)}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end", gap: space[1] }}>
                  <T v="body" tabular tone={l.optional ? "mut" : "ink"}>
                    {money(lineTotal(l))}
                  </T>
                  {l.optional ? <StatusChip status="neutral" label={t("ue.addonChip")} /> : null}
                </View>
              </RowView>
              <LineMarks marks={lineMarks(l)} lineId={l.id} />
            </Card>
          ))}
          <Button label={t("ue.addItem")} icon="plus" variant="secondary" full onPress={() => setEditing("new")} />
        </View>

        <View style={{ gap: space[3] }}>
          <Card>
            <SumRow label={t("ue.subtotal")} value={money(totals.subtotal)} />
            <Divider />
            <SumRow label={t("ue.discount")} value={totals.discount ? `−${money(totals.discount)}` : discValue} onPress={() => setSetting("discount")} />
            <Divider />
            <SumRow label={t("ue.tax")} value={totals.tax ? `${money(totals.tax)} · ${taxValue}` : taxValue} onPress={() => setSetting("tax")} />
            <Divider />
            <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
              <T v="title">{t("ue.total")}</T>
              <T v="display" tabular>
                {money(totals.total)}
              </T>
            </RowView>
            <Divider />
            <SumRow label={t("ue.deposit")} value={depValue} onPress={() => setSetting("deposit")} />
            {totals.depositOverCaLimit ? (
              <T v="caption" tone="warn">
                {t("ue.caWarn", { limit: money(totals.caDepositLimit) })}
              </T>
            ) : null}
            {totals.cost > 0 && store.role !== "tech" ? (
              <T v="caption" tone="mut">
                {costComplete(option) ? t("ue.margin", { p: totals.marginPct ?? "0", cost: money(totals.cost) }) : t("ue.costPartial", { cost: money(totals.cost) })}
              </T>
            ) : null}
            {option.lines.some((l) => l.optional) ? (
              <T v="caption" tone="mut">
                {t("ue.addonsNote")}
              </T>
            ) : null}
          </Card>
          {doc.options.length < MAX_OPTIONS ? (
            <View style={{ gap: space[1] }}>
              <Button label={t("ue.addOption")} icon="plus" variant="ghost" size="sm" onPress={addOption} />
              {doc.options.length === 1 ? (
                <T v="caption" tone="mut">
                  {t("ue.optionsHint")}
                </T>
              ) : null}
            </View>
          ) : null}
          <TextField type="note" value={doc.note ?? ""} onChangeText={(v) => setDoc((d) => ({ ...d, note: v }))} placeholder={t("ue.note")} />
          {!ok ? (
            <T v="caption" tone="mut">
              {customer ? t("ue.empty") : t("ue.pickClient")}
            </T>
          ) : null}
          <Button label={t("ue.saveSend")} icon="send" full disabled={!ok} onPress={() => save(true)} />
          <Button label={t("ue.save")} icon="check" variant="secondary" full disabled={!ok} onPress={() => save(false)} />
        </View>
      </Grid>

      <LineSheet
        visible={editing !== null}
        line={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSave={saveLines}
        onRemove={editing && editing !== "new" ? () => removeLine(editing.id) : undefined}
      />
      <Sheet visible={setting !== null} onClose={() => setSetting(null)} title={setting ? t(`ue.${setting}` as DictKey) : undefined}>
        <View style={{ gap: space[3] }}>
          {setting === "discount" ? (
            <>
              <Segmented
                full
                value={s.discount ? s.discount.kind : "none"}
                onChange={(k) => setSettings({ discount: k === "none" ? null : k === "pct" ? { kind: "pct", value: "0.05" } : { kind: "fixed", cents: 0 } })}
                items={[
                  { key: "none", label: t("ue.none") },
                  { key: "pct", label: "%" },
                  { key: "fixed", label: "$" },
                ]}
              />
              {s.discount?.kind === "pct" ? (
                <PctField bps={Math.round(Number(s.discount.value) * 10000)} onChange={(b) => setSettings({ discount: { kind: "pct", value: String(Math.min(b, 10000) / 10000) } })} />
              ) : s.discount?.kind === "fixed" ? (
                <MoneyField cents={s.discount.cents} onChange={(c) => setSettings({ discount: { kind: "fixed", cents: c } })} />
              ) : null}
            </>
          ) : null}
          {setting === "tax" ? (
            <>
              <RowView style={{ minHeight: size.hitMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("ue.taxOn")}
                </T>
                {exempt ? null : <Toggle label={t("ue.tax")} on={s.tax.enabled} onChange={(on) => setSettings({ tax: { ...s.tax, enabled: on } })} />}
              </RowView>
              <T v="caption" tone="mut">
                {exempt ? t("ue.taxExemptClient") : t("ue.taxHint")}
              </T>
              {s.tax.enabled ? (
                <>
                  <Labeled label={t("ue.taxRate")}>
                    <PctField bps={s.tax.rateBps} onChange={(b) => setSettings({ tax: { ...s.tax, rateBps: Math.min(b, 10000) } })} />
                  </Labeled>
                  {LINE_GROUPS.map((g: LineGroup) => (
                    <RowView key={g} style={{ minHeight: size.hitMin }}>
                      <T v="body" style={{ flex: 1 }}>
                        {t(`ue.group.${g}` as DictKey)}
                      </T>
                      <Toggle
                        label={`${t("ue.tax")}: ${t(`ue.group.${g}` as DictKey)}`}
                        on={s.tax.groups[g]}
                        onChange={(on) => setSettings({ tax: { ...s.tax, groups: { ...s.tax.groups, [g]: on } } })}
                      />
                    </RowView>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
          {setting === "deposit" ? (
            <>
              <Segmented
                full
                value={s.deposit.kind}
                onChange={(k) => setSettings({ deposit: (k === "pct" ? { kind: "pct", bps: 1000 } : k === "fixed" ? { kind: "fixed", cents: 0 } : { kind: "none" }) as DepositSetting })}
                items={[
                  { key: "pct", label: t("ue.depositPct") },
                  { key: "fixed", label: t("ue.depositUsd") },
                  { key: "none", label: t("ue.none") },
                ]}
              />
              {s.deposit.kind === "pct" ? (
                <PctField bps={s.deposit.bps} onChange={(b) => setSettings({ deposit: { kind: "pct", bps: Math.min(b, 10000) } })} />
              ) : s.deposit.kind === "fixed" ? (
                <MoneyField cents={s.deposit.cents} onChange={(c) => setSettings({ deposit: { kind: "fixed", cents: c } })} />
              ) : null}
              <SumRow label={t("ue.deposit")} value={money(totals.deposit)} />
              {totals.depositOverCaLimit ? (
                <T v="caption" tone="warn">
                  {t("ue.caWarn", { limit: money(totals.caDepositLimit) })}
                </T>
              ) : null}
            </>
          ) : null}
          <Button label={t("common.gotIt")} icon="check" full onPress={() => setSetting(null)} />
        </View>
      </Sheet>
      <ClientPicker
        visible={clientPicker}
        onClose={() => setClientPicker(false)}
        onPick={(cid, pid) => {
          setCustomerId(cid);
          setPropertyId(pid);
          setClientPicker(false);
        }}
      />
    </Screen>
  );
}

function SumRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const row = (
    <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <RowView gap={space[1]}>
        <T v="body" tabular>
          {value}
        </T>
        {onPress ? <Icon name="chevronRight" s={size.iconSm} /> : null}
      </RowView>
    </RowView>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {row}
    </Press>
  ) : (
    row
  );
}

