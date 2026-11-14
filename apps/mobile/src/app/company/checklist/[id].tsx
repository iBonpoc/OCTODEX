/**
 * A checklist template (docs/specs/08 §7.2, CH2): name · when it comes into a visit (every visit, by the visit's kind,
 * by catalog services — picked in a sheet, as rows) · items (text, check or photo, required, order) · photo minimums
 * above the company's. Saved at once on the phone, offline into the queue (chk.template.save, §11.2 №8). Archive
 * instead of delete, with «Отменить» 5 s (rule 5). Only the director and the office edit (canEditTemplates).
 */
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { ChecklistItemKind, ChecklistTemplate, ChecklistVisitKind, TemplateItem } from "@/data/types";
import { canEditTemplates, cleanTemplate, LABEL_MAX, TEMPLATE_NAME_MAX } from "@/features/checklist";
import { uid as newId } from "@/features/estimateDoc";
import { Button, ChoiceChips, IconButton, ReadOnly, StatusChip, Stepper, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Empty, FieldGroup, RowView, Screen } from "@/ui/surfaces";

const blank = (): ChecklistTemplate => ({
  id: newId(),
  name: "",
  items: [{ id: newId(), label: "", kind: "check", required: true }],
  appliesTo: { everyVisit: true, visitKinds: [], catalogItemIds: [] },
});

const backToList = () => (router.canGoBack() ? router.back() : router.replace("/company/checklists"));

export default function ChecklistTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { t } = useI18n();
  const saved = (store.db.checklistTemplates ?? []).find((x) => x.id === id);
  const isNew = id === "new";
  if (!saved && !isNew) {
    return (
      <Screen title={t("chk2.template")} back={backToList}>
        <Empty icon="checklist" title={t("chk2.notFound")} />
      </Screen>
    );
  }
  // keyed by the saved template: a template that arrives after the first render (a reload in the cloud) fills the
  // form, not a blank with a new id (that would save a second template)
  return <TemplateForm key={saved?.id ?? "new"} saved={saved} isNew={isNew} />;
}

function TemplateForm({ saved, isNew }: { saved?: ChecklistTemplate; isNew: boolean }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [tpl, setTpl] = useState<ChecklistTemplate>(() => saved ?? blank());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = backToList;
  const ro = !canEditTemplates(store.role);
  const set = (p: Partial<ChecklistTemplate>) => {
    setError(null);
    setTpl((x) => ({ ...x, ...p }));
  };
  const setApplies = (p: Partial<ChecklistTemplate["appliesTo"]>) => setTpl((x) => ({ ...x, appliesTo: { ...x.appliesTo, ...p } }));
  const setItem = (i: number, p: Partial<TemplateItem>) => setTpl((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  const move = (i: number, d: -1 | 1) =>
    setTpl((x) => {
      const j = i + d;
      if (j < 0 || j >= x.items.length) return x;
      const items = [...x.items];
      [items[i], items[j]] = [items[j]!, items[i]!];
      return { ...x, items };
    });
  const kindOn = (k: ChecklistVisitKind) => tpl.appliesTo.visitKinds.includes(k);
  const toggleKind = (k: ChecklistVisitKind, on: boolean) =>
    setApplies({ visitKinds: on ? [...tpl.appliesTo.visitKinds.filter((x) => x !== k), k] : tpl.appliesTo.visitKinds.filter((x) => x !== k) });
  const catalog = store.db.catalog;
  const picked = tpl.appliesTo.catalogItemIds.map((cid) => catalog.find((c) => c.id === cid)?.name).filter((n): n is string => !!n);

  const save = () => {
    const clean = cleanTemplate(tpl);
    if (!clean) return setError(t("chk2.needName"));
    if (clean.items.length === 0) return setError(t("chk2.needItem"));
    const undo = store.saveChecklistTemplate(clean);
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
    back();
  };
  const archive = (on: boolean) => {
    const clean = cleanTemplate({ ...tpl, archivedAt: on ? new Date().toISOString() : undefined });
    if (!clean) return;
    const undo = store.saveChecklistTemplate(clean);
    toast.show(on ? t("chk2.archivedToast") : t("co.saved"), undo);
    back();
  };

  return (
    <Screen title={tpl.name.trim() || t(isNew ? "chk2.new" : "chk2.template")} back={back}>
      {ro ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
      {tpl.archivedAt ? <StatusChip status="neutral" label={t("chk2.archived")} /> : null}
      <ReadOnly value={ro}>
        {/* the template's own fields straight on the background (DS §11 п.17, #1411); each item stays a card — an object of a list */}
        <FieldGroup>
          <View testID="chk-tpl-name">
            <TextField label={t("chk2.name")} placeholder={t("chk2.name")} type="title" value={tpl.name} onChangeText={(v) => set({ name: v.slice(0, TEMPLATE_NAME_MAX) })} />
          </View>
        </FieldGroup>

        <FieldGroup title={t("chk2.when")}>
          <T v="caption" tone="mut">{t("chk2.whenHint")}</T>
          <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
            <T v="body" style={{ flex: 1 }}>{t("chk2.every")}</T>
            <Toggle label={t("chk2.every")} on={tpl.appliesTo.everyVisit} onChange={(on) => setApplies({ everyVisit: on })} />
          </RowView>
          {tpl.appliesTo.everyVisit ? null : (
            <>
              <T v="body" w="semibold">{t("chk2.byKind")}</T>
              <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                <T v="body" style={{ flex: 1 }}>{t("chk2.kindInspection")}</T>
                <Toggle label={`${t("chk2.byKind")} · ${t("chk2.kindInspection")}`} on={kindOn("inspection")} onChange={(on) => toggleKind("inspection", on)} />
              </RowView>
              <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                <T v="body" style={{ flex: 1 }}>{t("chk2.kindWork")}</T>
                <Toggle label={`${t("chk2.byKind")} · ${t("chk2.kindWork")}`} on={kindOn("work")} onChange={(on) => toggleKind("work", on)} />
              </RowView>
              <T v="body" w="semibold">{t("chk2.byService")}</T>
              <T v="caption" tone="mut">{picked.length ? picked.join(", ") : t("chk2.noServices")}</T>
              {ro ? null : (
                <View testID="chk-tpl-services">
                  <Button label={t("chk2.pickServices")} icon="box" variant="secondary" onPress={() => setPicking(true)} />
                </View>
              )}
            </>
          )}
        </FieldGroup>

        <T v="heading">{t("chk2.itemsTitle")}</T>
        {tpl.items.map((it, i) => (
          <View key={it.id} testID={`chk-tpl-item-${i}`}>
            <Card>
              <TextField label={`${t("chk2.itemLabel")} ${i + 1}`} placeholder={t("chk2.itemLabel")} type="text" value={it.label} onChangeText={(v) => setItem(i, { label: v.slice(0, LABEL_MAX) })} />
              <ChoiceChips<ChecklistItemKind>
                value={it.kind}
                onChange={(k) => setItem(i, { kind: k })}
                items={[{ key: "check", label: t("chk2.kindCheck") }, { key: "photo", label: t("chk2.kindPhoto") }]}
              />
              <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                <T v="body" style={{ flex: 1 }}>{t("chk2.required")}</T>
                <Toggle label={`${t("chk2.required")} · ${i + 1}`} on={it.required} onChange={(on) => setItem(i, { required: on })} />
              </RowView>
              {ro ? null : (
                <RowView style={{ gap: space[2] }}>
                  <Button label={t("chk2.up")} size="sm" variant="ghost" disabled={i === 0} onPress={() => move(i, -1)} accessibilityLabel={`${t("chk2.up")} · ${i + 1}`} />
                  <Button label={t("chk2.down")} size="sm" variant="ghost" disabled={i === tpl.items.length - 1} onPress={() => move(i, 1)} accessibilityLabel={`${t("chk2.down")} · ${i + 1}`} />
                  <View style={{ flex: 1 }} />
                  <IconButton icon="trash" label={`${t("chk2.removeItem")} ${i + 1}`} onPress={() => set({ items: tpl.items.filter((_, j) => j !== i) })} />
                </RowView>
              )}
            </Card>
          </View>
        ))}
        {ro ? null : (
          <View testID="chk-tpl-add-item">
            <Button label={t("chk2.addItem")} icon="plus" variant="secondary" onPress={() => set({ items: [...tpl.items, { id: newId(), label: "", kind: "check", required: true }] })} />
          </View>
        )}

        <FieldGroup title={t("chk2.minPhotos")}>
          <T v="caption" tone="mut">{t("chk2.minPhotosHint")}</T>
          <Stepper label={t("chk2.minBefore")} value={tpl.minPhotosBefore ?? 0} min={0} max={20} onChange={(v) => set({ minPhotosBefore: v || undefined })} />
          <Stepper label={t("chk2.minAfter")} value={tpl.minPhotosAfter ?? 0} min={0} max={20} onChange={(v) => set({ minPhotosAfter: v || undefined })} />
        </FieldGroup>
      </ReadOnly>

      {error ? <StatusChip status="bad" label={error} /> : null}
      {ro ? null : (
        <>
          <View testID="chk-tpl-save">
            <Button label={t("ue.save")} icon="check" full onPress={save} />
          </View>
          {isNew ? null : (
            <View testID="chk-tpl-archive">
              <Button label={tpl.archivedAt ? t("chk2.restore") : t("chk2.archive")} variant="ghost" full onPress={() => archive(!tpl.archivedAt)} />
            </View>
          )}
        </>
      )}

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("chk2.pickServices")}>
        {catalog.length === 0 ? <T v="caption" tone="mut">{t("chk2.noServices")}</T> : null}
        {catalog.map((c) => {
          const on = tpl.appliesTo.catalogItemIds.includes(c.id);
          return (
            <RowView key={c.id} style={{ justifyContent: "space-between", gap: space[2] }}>
              <T v="body" style={{ flex: 1 }}>{c.name}</T>
              <Toggle
                label={c.name}
                on={on}
                onChange={(v) => setApplies({ catalogItemIds: v ? [...tpl.appliesTo.catalogItemIds, c.id] : tpl.appliesTo.catalogItemIds.filter((x) => x !== c.id) })}
              />
            </RowView>
          );
        })}
        <Button label={t("ue.save")} icon="check" full onPress={() => setPicking(false)} />
      </Sheet>
    </Screen>
  );
}
