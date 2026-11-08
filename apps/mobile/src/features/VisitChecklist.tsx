/**
 * The checklist on the visit screen (docs/specs/08 §7.3, step 14 CH1c): ticks, photo items, «пропущен», own items, and
 * the «Не заполнено: N» sheet. Nothing here locks a step (founder 05.11): the sheet warns and offers «Заполнить» (back to
 * the list) or «Пропустить» (the items are marked skipped — still «not done» — and the step goes on).
 */
import { useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { component, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ChecklistItem, Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { canAddItem, canAttachPhoto, canTick, itemDone, itemKind, itemRequired, itemSkipped, type Missing } from "@/features/checklist";
import { PhotoStrip } from "@/features/PhotoStrip";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";

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
        Haptics.selectionAsync().catch(() => {});
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
