/**
 * The checklist on the visit screen (docs/specs/08 §7.3, step 14 CH1c): ticks, photo items, «пропущен», own items, and
 * the «Не заполнено: N» sheet. Nothing here locks a step (founder 05.11): the sheet warns and offers «Заполнить» (back to
 * the list) or «Пропустить» (the items are marked skipped — still «not done» — and the step goes on).
 */
import { useHeldSheet } from "@/ui/heldSheet";
import { useState } from "react";
import { View } from "react-native";
import { haptics } from "@/ui/haptics";
import { component, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ChecklistItem, Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { canAddItem, canAttachPhoto, canRemoveItem, canSetRequired, canTick, cleanText, itemDone, itemKind, itemRequired, itemSkipped, itemsFromTemplate, LABEL_MAX, templatesForVisit, type Missing } from "@/features/checklist";
import { PhotoStrip } from "@/features/PhotoStrip";
import { Button, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, ListRow, RowView } from "@/ui/surfaces";
import { type GuardedUndo } from "@/data/undo";

/** the checklist card of a visit at work (or an inspection on site) */
export function ChecklistCard({ v, missing }: { v: Visit; missing: Missing }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [extra, setExtra] = useState("");
  const queuedHint = () => (store.online ? undefined : t("offline.queued"));
  const left = missing.items.length;
  const addItem = () => {
    const label = extra.trim();
    if (!label) return;
    toast.show(queuedHint() ?? t("check.added"), store.addCheckItem(v.id, label));
    setExtra("");
  };
  return (
    <Card>
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="heading">{t("visit.checklist")}</T>
        <View testID="chk-left">
          <T v="caption" tone={left ? "mut" : "ok"}>
            {left ? t("chk.left", { n: left }) : "✓"}
          </T>
        </View>
      </RowView>
      {v.checklist.map((item) => (
        <ItemRow key={item.id} v={v} item={item} />
      ))}
      {canAddItem(store.role, v, false) ? (
        <RowView>
          <View style={{ flex: 1 }}>
            <TextField type="text" value={extra} onChangeText={setExtra} placeholder={t("check.addPlaceholder")} icon="plus" />
          </View>
          <Button label={t("check.add")} size="sm" variant="secondary" disabled={!extra.trim()} onPress={addItem} />
        </RowView>
      ) : null}
    </Card>
  );
}

function ItemRow({ v, item }: { v: Visit; item: ChecklistItem }) {
  const store = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const done = itemDone(item, v.photos);
  const skipped = itemSkipped(item, v.photos);
  const sub = (
    <>
      {!itemRequired(item) ? (
        <T v="caption" tone="mut">
          {t("chk.optional")}
        </T>
      ) : null}
      {item.hint ? (
        <T v="caption" tone="mut">
          {item.hint}
        </T>
      ) : null}
      {skipped ? <StatusChip status="warn" label={t("chk.skipped")} soft /> : null}
    </>
  );
  if (itemKind(item) === "photo") {
    const photos = v.photos.filter((p) => item.photoIds?.includes(p.id));
    return (
      <View testID={`chk-item-${item.id}`} accessibilityLabel={item.label} style={{ gap: space[1] }}>
        <RowView gap={space[2]}>
          <Icon name={done ? "check" : "camera"} s={size.iconSm} color={done ? c.status.ok.text : c.mut} />
          <T v="body" style={{ flex: 1 }}>
            {item.label}
          </T>
        </RowView>
        {sub}
        <PhotoStrip
          photos={photos}
          title={t("chk.photoItem")}
          onAdd={canAttachPhoto(store.role) ? (uri) => toast.show(t("toast.photo"), store.attachItemPhoto(v.id, item.id, uri)) : undefined}
          onRemove={(id) => toast.show(t("photo.deleted"), store.removePhoto(v.id, id))}
          onRetry={(id) => toast.show(store.online ? t("photoUp.retried") : t("offline.queued"), store.retryPhoto(v.id, id))}
        />
      </View>
    );
  }
  const may = canTick(store.role, v, !item.done);
  return (
    <Press
      testID={`chk-item-${item.id}`}
      disabled={!may}
      onPress={() => {
        haptics.selection();
        store.toggleCheck(v.id, item.id);
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.done, disabled: !may }}
      accessibilityLabel={item.label}
      style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.hitMin }}
    >
      <View
        style={{
          width: component.checkbox.size,
          height: component.checkbox.size,
          borderRadius: component.checkbox.radius,
          borderWidth: component.checkbox.border,
          borderColor: item.done ? c.status.ok.fill : c.bd,
          backgroundColor: item.done ? c.status.ok.fill : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.done ? <Icon name="check" s={size.iconSm} color={c.status.ok.on} /> : null}
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <T v="body" tone={item.done ? "mut" : "ink"} style={{ textDecorationLine: item.done ? "line-through" : "none" }}>
          {item.label}
        </T>
        {sub}
      </View>
    </Press>
  );
}

/** «Не заполнено: N»: what is missing, «Заполнить» (back) / «Пропустить» (mark skipped, go on) */
export function MissingSheet({ v, missing, open, onFill, onSkip, step }: {
  v: Visit;
  missing: Missing;
  open: boolean;
  onFill: () => void;
  onSkip: () => void;
  /** «work»: before work — only photos before; «sign»: before the signature — items and photos after (photos before were
   *  asked at «work»); «done»: an inspection's «Готово» — items and photos before */
  step: "work" | "sign" | "done";
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const before = step === "work";
  const items = before ? [] : v.checklist.filter((i) => missing.items.includes(i.id));
  const lines = [
    ...items.map((i) => ({ key: i.id, label: i.label })),
    ...(step !== "sign" && missing.photosBefore > 0 ? [{ key: "before", label: t("chk.needBefore", { n: missing.photosBefore }) }] : []),
    ...(step === "sign" && missing.photosAfter > 0 ? [{ key: "after", label: t("chk.needAfter", { n: missing.photosAfter }) }] : []),
  ];
  return (
    <Sheet visible={open} onClose={onFill} title={before ? t("chk.noBefore") : t("chk.sheetTitle", { n: lines.length })}>
      <View testID="chk-missing" style={{ gap: space[2] }}>
        {lines.map((l) => (
          <RowView key={l.key} gap={space[2]}>
            <Icon name="alert" s={size.iconSm} color={c.status.warn.text} />
            <T v="body" style={{ flex: 1 }}>
              {l.label}
            </T>
          </RowView>
        ))}
        <T v="caption" tone="mut">
          {t("chk.sheetHint")}
        </T>
        <View testID="chk-fill">
          <Button label={t("chk.fill")} variant="primary" full onPress={onFill} />
        </View>
        <View testID="chk-skip">
          <Button label={t("chk.skip")} variant="secondary" full onPress={onSkip} />
        </View>
      </View>
    </Sheet>
  );
}

/**
 * The office's checklist of a visit before it starts (§7.4, CH3; canEditVisitItems): each item's text and «Обязательный»
 * (a sheet), «Выше» / «Ниже», «Убрать»; a new item; «Добавить из шаблона» — also for an inspection sales booked (it came
 * without a snapshot, §11.8 №8). Every change is one row's op with «Отменить».
 */
/** `title` — the heading (the job card names the visit, #606); the visit screen keeps «Чек-лист» */
export function ChecklistEditor({ v, title }: { v: Visit; title?: string }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [extra, setExtra] = useState("");
  const [extraRequired, setExtraRequired] = useState(true);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const editHeld = useHeldSheet(editing); // the sheet goes out before it is unmounted (#1163)
  const [picking, setPicking] = useState(false);
  const say = (msg: string, undo: GuardedUndo) => toast.show(store.online ? msg : t("offline.queued"), undo);
  const templates = templatesForVisit(v, store.db.checklistTemplates ?? []);
  const add = () => {
    if (!extra.trim()) return;
    say(t("check.added"), store.addVisitItem(v.id, extra, extraRequired));
    setExtra("");
  };
  return (
    <View testID="chk-editor">
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading">{title ?? t("visit.checklist")}</T>
          <T v="caption" tone="mut">
            {t("check.preview", { n: v.checklist.length })}
          </T>
        </RowView>
        <T v="caption" tone="mut">
          {t("chk3.hint")}
        </T>
        {v.checklist.length === 0 ? (
          <T v="body" tone="mut">
            {t("chk3.empty")}
          </T>
        ) : null}
        {v.checklist.map((item, i) => (
          <View key={item.id} testID={`chk-edit-${i}`} style={{ gap: space[1] }}>
            <RowView gap={space[2]}>
              {itemKind(item) === "photo" ? (
                <Icon name="camera" s={size.iconSm} />
              ) : (
                <T v="body" tone="mut">
                  ○
                </T>
              )}
              <T v="body" style={{ flex: 1 }}>
                {item.label}
              </T>
            </RowView>
            <T v="caption" tone="mut">
              {[itemRequired(item) ? t("chk3.requiredShort") : t("chk3.optional"), item.templateName ? t("chk3.from", { name: item.templateName }) : null].filter(Boolean).join(" · ")}
            </T>
            <RowView gap={space[2]}>
              <Button label={t("chk3.up")} size="sm" variant="ghost" disabled={i === 0} accessibilityLabel={`${t("chk3.up")} · ${item.label}`}
                onPress={() => say(t("chk3.moved"), store.moveVisitItem(v.id, item.id, -1))} />
              <Button label={t("chk3.down")} size="sm" variant="ghost" disabled={i === v.checklist.length - 1} accessibilityLabel={`${t("chk3.down")} · ${item.label}`}
                onPress={() => say(t("chk3.moved"), store.moveVisitItem(v.id, item.id, 1))} />
              <View style={{ flex: 1 }} />
              <Button label={t("chk3.edit")} size="sm" variant="secondary" accessibilityLabel={`${t("chk3.edit")} · ${item.label}`} onPress={() => setEditing(item)} />
            </RowView>
          </View>
        ))}
        <RowView>
          <View style={{ flex: 1 }}>
            <TextField type="text" value={extra} onChangeText={(x) => setExtra(x.slice(0, LABEL_MAX))} placeholder={t("check.addPlaceholder")} icon="plus" />
          </View>
          <Button label={t("check.add")} size="sm" variant="secondary" disabled={!extra.trim()} onPress={add} />
        </RowView>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" style={{ flex: 1 }}>
            {t("chk3.required")}
          </T>
          <Toggle label={`${t("chk3.required")} · ${t("check.add")}`} on={extraRequired} onChange={setExtraRequired} />
        </RowView>
        <View testID="chk-from-template">
          <Button label={t("chk3.fromTemplate")} icon="plus" variant="secondary" full onPress={() => setPicking(true)} />
        </View>
      </Card>

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("chk3.templates")}>
        <View testID="chk-templates" style={{ gap: space[1] }}>
          {templates.length === 0 ? (
            <T v="body" tone="mut">
              {t("chk3.noTemplates")}
            </T>
          ) : null}
          {templates.map(({ template, added }) => (
            <ListRow
              key={template.id}
              title={template.name}
              subtitle={added ? t("chk3.added") : t("check.preview", { n: template.items.length })}
              onPress={
                added
                  ? undefined
                  : () => {
                      setPicking(false);
                      // the count of what really comes (the 200 cap, doubles); nothing — no toast (its «Отменить» would do nothing)
                      const cur = store.db.visits.find((x) => x.id === v.id) ?? v;
                      const n = itemsFromTemplate(cur, template, () => "").length;
                      if (n) say(t("chk3.addedN", { n }), store.addVisitTemplate(v.id, template.id));
                    }
              }
            />
          ))}
        </View>
      </Sheet>

      {editHeld.value ? <EditItemSheet key={editHeld.opening} v={v} item={editHeld.value} visible={editHeld.visible} onExited={editHeld.onExited} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function EditItemSheet({ v, item, onClose, visible, onExited }: { v: Visit; item: ChecklistItem; onClose: () => void; visible: boolean; onExited: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [label, setLabel] = useState(item.label);
  const [required, setRequired] = useState(itemRequired(item));
  const lockedOn = itemRequired(item) && !canSetRequired(store.role, false);
  // as the store will take it: an empty text keeps the old one; «Обязательный» off only when the role may
  const clean = cleanText(label);
  const next = {
    ...(clean && clean !== item.label ? { label: clean } : {}),
    ...(required !== itemRequired(item) && canSetRequired(store.role, required) ? { required } : {}),
  };
  const dirty = Object.keys(next).length > 0;
  const say = (msg: string, undo: GuardedUndo) => toast.show(store.online ? msg : t("offline.queued"), undo);
  const save = () => {
    onClose();
    if (dirty) say(t("chk3.edited"), store.editVisitItem(v.id, item.id, next));
  };
  return (
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={t("chk3.editTitle")} dirty={dirty} onSave={save}>
      <View testID="chk-edit-sheet" style={{ gap: space[2] }}>
        <TextField label={t("chk3.label")} type="text" value={label} onChangeText={(x) => setLabel(x.slice(0, LABEL_MAX))} />
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" style={{ flex: 1 }}>
            {t("chk3.required")}
          </T>
          {lockedOn ? <StatusChip status="neutral" label={t("chk3.required")} /> : <Toggle label={t("chk3.required")} on={required} onChange={setRequired} />}
        </RowView>
        {lockedOn ? (
          <T v="caption" tone="mut">
            {t("chk3.directorOnly")}
          </T>
        ) : null}
        <View testID="chk-edit-save">
          <Button label={t("ue.save")} icon="check" full disabled={!dirty} onPress={save} />
        </View>
        {canRemoveItem(store.role, store.db.me, v, item) ? (
          <View testID="chk-edit-remove">
            <Button
              label={t("chk3.remove")}
              icon="trash"
              variant="ghost"
              full
              onPress={() => {
                onClose();
                say(t("chk3.removed"), store.removeVisitItem(v.id, item.id));
              }}
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
