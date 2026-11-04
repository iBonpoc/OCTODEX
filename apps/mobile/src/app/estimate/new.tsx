import { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space } from "@octo/design-tokens";
import { LINE_GROUPS, activeLines, type CustomLine, type CustomOption, type DepositSetting, type LineGroup } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem, EstimateDoc } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useModules } from "@/features/modules";
import { MAX_OPTIONS, cloneOption, costComplete, estimateTitle, hasContent, linesFromCatalog, newDoc, newLine, optionTotals, uid } from "@/features/estimateDoc";
import { CatalogPicker, ClientPicker } from "@/features/estimatePickers";
import { Labeled, MoneyField, PctField, QtyField } from "@/features/fields";
import { Button, IconButton, Segmented, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, Grid, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * Universal estimate builder (core, any trade). Lines typed by hand or taken from the catalog,
 * in three groups (services / labor / materials); 1 option by default, up to 3; add-ons; discount;
 * sales tax per group (off by default, separate line); deposit as % or $. Math: @octo/estimating-engine.
 */
export default function EstimateBuilder() {
  const params = useLocalSearchParams<{ id?: string; customerId?: string; propertyId?: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money } = useI18n();
  const toast = useToast();
  const modules = useModules();
  const existing = params.id ? db.estimates.find((e) => e.id === params.id) : undefined;
  const [estimateId] = useState(() => existing?.id ?? uid());
  const [customerId, setCustomerId] = useState(existing?.customerId ?? params.customerId);
  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? params.propertyId);
  const [doc, setDoc] = useState<EstimateDoc>(() => (existing?.doc ? structuredClone(existing.doc) : newDoc()));
  const [title, setTitle] = useState(existing?.doc ? existing.title : "");
  const [cur, setCur] = useState(() => Math.max(0, doc.options.findIndex((o) => o.recommended)));
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [clientPicker, setClientPicker] = useState(!customerId);

  const customer = db.customers.find((c) => c.id === customerId);
  const property = db.properties.find((p) => p.id === propertyId) ?? db.properties.find((p) => p.customerId === customerId);
  const option = doc.options[Math.min(cur, doc.options.length - 1)]!;
  const totals = useMemo(() => optionTotals(doc, option), [doc, option]);
  const s = doc.settings;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  /* ---------- doc edits ---------- */
  const setOption = (fn: (o: CustomOption) => CustomOption) =>
    setDoc((d) => ({ ...d, options: d.options.map((o) => (o.id === option.id ? fn(o) : o)) }));
  const setLine = (id: string, patch: Partial<CustomLine>) => setOption((o) => ({ ...o, lines: o.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const addLine = (g: LineGroup) => {
    const l = newLine(g);
    setOption((o) => ({ ...o, lines: [...o.lines, l] }));
    setOpen(l.id);
  };
  const removeLine = (id: string) => {
    const prev = doc;
    setOption((o) => ({ ...o, lines: o.lines.filter((l) => l.id !== id) }));
    setOpen(null);
    toast.show(t("ue.lineRemoved"), () => setDoc(prev));
  };
  const addFromCatalog = (it: CatalogItem) => {
    const lines = linesFromCatalog(it, db.catalog);
    setOption((o) => ({ ...o, lines: [...o.lines, ...lines] }));
    toast.show(t("ue.added", { name: it.name }));
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
    setDoc((d) => ({ ...d, options: d.options.map((o) => ({ ...o, recommended: on ? o.id === option.id : o.id === option.id ? false : o.recommended })) }));
  const setSettings = (patch: Partial<EstimateDoc["settings"]>) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setTaxGroup = (g: LineGroup, on: boolean) => setSettings({ tax: { ...s.tax, groups: { ...s.tax.groups, [g]: on } } });

  const ok = !!customer && !!property && hasContent(doc);
  const save = (send: boolean) => {
    if (!customer || !property) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const clean: EstimateDoc = { ...doc, options: doc.options.map((o) => ({ ...o, lines: activeLines(o.lines) })) };
    const undo = store.saveEstimate({
      id: estimateId, customerId: customer.id, propertyId: property.id, doc: clean,
      title: title.trim() || estimateTitle(clean, t("ue.title")),
    });
    toast.show(store.online ? t("ue.saved", { name: customer.name }) : t("offline.queued"), undo);
    router.replace(`/estimate/${estimateId}${send ? "?send=1" : ""}`);
  };

  /* ---------- UI ---------- */
  const groupLines = (g: LineGroup) => option.lines.filter((l) => l.group === g);
  const depositKind = s.deposit.kind;
  const lineTotal = (l: CustomLine) => {
    const i = activeLines(option.lines).indexOf(l);
    return i >= 0 ? totals.lineTotals[i] ?? 0 : 0;
  };

  return (
    <Screen
      title={existing ? t("ue.title") : t("ue.newTitle")}
      back={back}
      help={t("ue.help")}
      hintKey="estimate-builder"
      subtitle={customer ? `${customer.name}${property ? ` · ${property.address}` : ""}` : t("est.noClient")}
      right={<Button label={t("est.for")} icon="user" variant="ghost" size="sm" onPress={() => setClientPicker(true)} />}
    >
      {existing && existing.status !== "draft" ? (
        <T v="caption" tone="warn">
          {t("ue.editSentNote")}
        </T>
      ) : null}
      <Grid>
        <View style={{ gap: space[3] }}>
          <Card>
            <TextField value={title} onChangeText={setTitle} placeholder={t("ue.jobTitle")} icon="note" />
            <RowView style={{ flexWrap: "wrap" }}>
              <Button label={t("ue.fromCatalog")} icon="search" variant="secondary" size="sm" onPress={() => setPicker(true)} />
              {modules.gutters && customer ? (
                <Button
                  label={t("ue.gutters")}
                  icon="ruler"
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(`/estimate/gutters?customerId=${customer.id}${property ? `&propertyId=${property.id}` : ""}`)}
                />
              ) : null}
            </RowView>
          </Card>

          {/* options */}
          <Card>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="heading">{t("ue.options")}</T>
              {doc.options.length < MAX_OPTIONS ? <Button label={t("ue.addOption")} icon="plus" variant="ghost" size="sm" onPress={addOption} /> : null}
            </RowView>
            {doc.options.length > 1 ? (
              <>
                <Segmented full value={option.id} onChange={(id) => setCur(doc.options.findIndex((o) => o.id === id))} items={doc.options.map((o) => ({ key: o.id, label: o.name || "—" }))} />
                <TextField value={option.name} onChangeText={(v) => setOption((o) => ({ ...o, name: v }))} placeholder={t("ue.optionName")} />
                <RowView style={{ minHeight: 44 }}>
                  <T v="body" style={{ flex: 1 }}>
                    {t("ue.recommended")}
                  </T>
                  <Toggle label={t("ue.recommended")} on={!!option.recommended} onChange={setRecommended} />
                </RowView>
                <Button label={t("ue.removeOption")} icon="trash" variant="ghost" size="sm" onPress={removeOption} />
              </>
            ) : (
              <T v="caption" tone="mut">
                {t("ue.optionsHint")}
              </T>
            )}
          </Card>

          {LINE_GROUPS.map((g) => {
            const lines = groupLines(g);
            return (
              <View key={g} style={{ gap: space[2] }}>
                <SectionTitle
                  title={t(`ue.group.${g}` as DictKey)}
                  right={totals.groupSubtotals[g] ? <T v="body" tabular>{money(totals.groupSubtotals[g])}</T> : undefined}
                />
                <Card>
                  {lines.map((l, i) => (
                    <View key={l.id} style={{ gap: space[2] }}>
                      {i > 0 ? <Divider /> : null}
                      {open === l.id ? (
                        <LineEditor line={l} onChange={(p) => setLine(l.id, p)} onDone={() => setOpen(null)} onRemove={() => removeLine(l.id)} />
                      ) : (
                        <Press onPress={() => setOpen(l.id)} accessibilityRole="button" accessibilityLabel={l.name || t("ue.lineName")}>
                          <RowView style={{ minHeight: 44, alignItems: "center" }}>
                            <View style={{ flex: 1 }}>
                              <T v="body" tone={l.name ? "ink" : "mut"} numberOfLines={2}>
                                {l.name || t("ue.lineName")}
                              </T>
                              <T v="caption" tone="mut" tabular>
                                {String(l.quantity)} {l.unit} × {money(l.unitPriceCents)}
                                {l.optional ? ` · ${t("ue.addonChip")}` : ""}
                              </T>
                            </View>
                            <T v="body" tabular tone={l.optional ? "mut" : "ink"}>
                              {money(lineTotal(l))}
                            </T>
                          </RowView>
                        </Press>
                      )}
                    </View>
                  ))}
                  <Button label={t("ue.addLine")} icon="plus" variant="ghost" size="sm" onPress={() => addLine(g)} />
                </Card>
              </View>
            );
          })}
          <TextField value={doc.note ?? ""} onChangeText={(v) => setDoc((d) => ({ ...d, note: v }))} placeholder={t("ue.note")} multiline />
        </View>

        <View style={{ gap: space[3] }}>
          {/* discount */}
          <Card>
            <T v="heading">{t("ue.discount")}</T>
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
          </Card>

          {/* tax */}
          <Card>
            <RowView style={{ minHeight: 44 }}>
              <T v="heading" style={{ flex: 1 }}>
                {t("ue.tax")}
              </T>
              <Toggle label={t("ue.tax")} on={s.tax.enabled} onChange={(on) => setSettings({ tax: { ...s.tax, enabled: on } })} />
            </RowView>
            <T v="caption" tone="mut">
              {t("ue.taxHint")}
            </T>
            {s.tax.enabled ? (
              <>
                <Labeled label={t("ue.taxRate")}>
                  <PctField bps={s.tax.rateBps} onChange={(b) => setSettings({ tax: { ...s.tax, rateBps: Math.min(b, 10000) } })} />
                </Labeled>
                {LINE_GROUPS.map((g) => (
                  <RowView key={g} style={{ minHeight: 44 }}>
                    <T v="body" style={{ flex: 1 }}>
                      {t(`ue.group.${g}` as DictKey)}
                    </T>
                    <Toggle label={`${t("ue.tax")}: ${t(`ue.group.${g}` as DictKey)}`} on={s.tax.groups[g]} onChange={(on) => setTaxGroup(g, on)} />
                  </RowView>
                ))}
              </>
            ) : null}
          </Card>

          {/* deposit */}
          <Card>
            <T v="heading">{t("ue.deposit")}</T>
            <Segmented
              full
              value={depositKind}
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
            {totals.depositOverCaLimit ? (
              <T v="caption" tone="warn">
                {t("ue.caWarn", { limit: money(totals.caDepositLimit) })}
              </T>
            ) : null}
          </Card>

          {/* totals */}
          <Card>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="heading">{option.name}</T>
              {option.recommended && doc.options.length > 1 ? <StatusChip status="ok" label={t("ue.recommended")} /> : null}
            </RowView>
            <Sum label={t("ue.subtotal")} v={money(totals.subtotal)} />
            {totals.discount ? <Sum label={t("ue.discount")} v={`−${money(totals.discount)}`} /> : null}
            {totals.tax ? <Sum label={t("ue.taxLine", { rate: s.tax.rateBps / 100 })} v={money(totals.tax)} /> : null}
            <Divider />
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="title">{t("ue.total")}</T>
              <T v="display" tabular>
                {money(totals.total)}
              </T>
            </RowView>
            {totals.deposit ? <Sum label={t("ue.deposit")} v={money(totals.deposit)} /> : null}
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
          {!ok ? (
            <T v="caption" tone="mut">
              {customer ? t("ue.empty") : t("est.noClient")}
            </T>
          ) : null}
          <Button label={t("ue.saveSend")} icon="send" full disabled={!ok} onPress={() => save(true)} />
          <Button label={t("ue.save")} icon="check" variant="secondary" full disabled={!ok} onPress={() => save(false)} />
        </View>
      </Grid>

      <CatalogPicker visible={picker} onClose={() => setPicker(false)} onPick={addFromCatalog} />
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

function Sum({ label, v }: { label: string; v: string }) {
  return (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <T v="body" tabular>
        {v}
      </T>
    </RowView>
  );
}

function LineEditor({ line, onChange, onDone, onRemove }: { line: CustomLine; onChange: (p: Partial<CustomLine>) => void; onDone: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: space[2], paddingVertical: space[1] }}>
      <TextField value={line.name} onChangeText={(v) => onChange({ name: v })} placeholder={t("ue.lineName")} />
      <RowView style={{ alignItems: "flex-end" }}>
        <Labeled label={t("ue.qty")}>
          <QtyField qty={String(line.quantity)} onChange={(q) => onChange({ quantity: q })} />
        </Labeled>
        <Labeled label={t("ue.unit")}>
          <TextField value={line.unit} onChangeText={(v) => onChange({ unit: v })} placeholder="ea" />
        </Labeled>
        <Labeled label={t("ue.price")} flex={1.4}>
          <MoneyField cents={line.unitPriceCents} onChange={(c) => onChange({ unitPriceCents: c })} />
        </Labeled>
      </RowView>
      <RowView style={{ minHeight: 44 }}>
        <T v="body" style={{ flex: 1 }}>
          {t("ue.addon")}
        </T>
        <Toggle label={t("ue.addon")} on={!!line.optional} onChange={(on) => onChange({ optional: on })} />
      </RowView>
      <RowView style={{ justifyContent: "space-between" }}>
        <IconButton icon="trash" label={t("ue.removeLine")} onPress={onRemove} />
        <Button label={t("ue.doneLine")} icon="check" variant="secondary" size="sm" onPress={onDone} />
      </RowView>
    </View>
  );
}
