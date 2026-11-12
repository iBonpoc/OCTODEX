import { Anchored, type FieldBinding } from "@/ui/requiredForm";
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { SOURCE_KINDS, type Source, type SourceKind } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Labeled } from "@/features/fields";
import { sourceGroups, sourceInUse, sourceOf } from "@/features/leads";
import { Button, ChoiceChips, IconButton, StatusChip, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow, RowView } from "@/ui/surfaces";

export const sourceKindLabel = (k: SourceKind): DictKey => `src.kind.${k}` as DictKey;

/** Field that shows the chosen source; tap opens the picker. */
export function SourceField({ value, onChange, label, field }: { value: string; onChange: (id: string) => void; label?: string; field?: FieldBinding }) {
  const { db } = useStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const s = sourceOf(db, value);
  const body = (
    <Labeled label={label ?? t("lead.source")}>
      <ListRow
        title={s?.name ?? t("src.choose")}
        subtitle={s ? t(sourceKindLabel(s.kind)) : undefined}
        left={<Icon name="star" />}
        onPress={() => setOpen(true)}
      />
      <SourceSheet visible={open} value={value} onClose={() => setOpen(false)} onPick={(id) => { onChange(id); field?.clear(); setOpen(false); }} />
    </Labeled>
  );
  return field ? <Anchored field={field}>{body}</Anchored> : body;
}

/**
 * The company's own list of sources, grouped: marketplaces, ads, people, own channels.
 * "+ New source" creates an entity in the CRM; "edit" renames / hides it. A source with leads is hidden, never deleted.
 */
export function SourceSheet({ visible, value, onClose, onPick }: { visible: boolean; value?: string; onClose: () => void; onPick: (id: string) => void }) {
  const { db } = useStore();
  const { t } = useI18n();
  const [edit, setEdit] = useState<(Omit<Source, "id"> & { id?: string }) | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const groups = sourceGroups(db, value);
  const hidden = db.sources.filter((s) => !s.active && s.id !== value);
  const row = (s: Source) => (
    <ListRow
      key={s.id}
      title={s.name}
      subtitle={[s.kind === "person" ? s.phone : undefined, !s.active ? t("src.hidden") : undefined].filter(Boolean).join(" · ") || undefined}
      left={s.id === value ? <Icon name="check" /> : <Icon name={s.kind === "person" ? "user" : s.kind === "ads" ? "chart" : s.kind === "own" ? "home" : "star"} />}
      right={<IconButton icon="pencil" label={t("src.edit", { name: s.name })} onPress={() => setEdit(s)} />}
      onPress={() => onPick(s.id)}
    />
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={edit ? (edit.id ? t("src.editTitle") : t("src.new")) : t("lead.source")}>
      {edit ? (
        <SourceForm value={edit} onDone={(id) => { setEdit(null); if (id) onPick(id); }} />
      ) : (
        <View style={{ gap: space[3] }}>
          <Button label={t("src.new")} icon="plus" variant="secondary" full onPress={() => setEdit({ name: "", kind: "person", active: true })} />
          {groups.map((g) => (
            <View key={g.kind} style={{ gap: space[1] }}>
              <T v="micro" tone="mut" w="semibold">
                {t(sourceKindLabel(g.kind))}
              </T>
              <View>
                {g.items.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <Divider /> : null}
                    {row(s)}
                  </View>
                ))}
              </View>
            </View>
          ))}
          {hidden.length ? (
            <View style={{ gap: space[1] }}>
              <Button label={`${t("src.hiddenList")} · ${hidden.length}`} icon={showHidden ? "chevronDown" : "chevronRight"} variant="ghost" onPress={() => setShowHidden(!showHidden)} />
              {showHidden ? hidden.map((s, i) => <View key={s.id}>{i > 0 ? <Divider /> : null}{row(s)}</View>) : null}
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

function SourceForm({ value, onDone }: { value: Omit<Source, "id"> & { id?: string }; onDone: (id?: string) => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState(value);
  const set = (p: Partial<Source>) => setD((x) => ({ ...x, ...p }));
  const taken = store.db.sources.some((s) => s.id !== d.id && s.name.trim().toLowerCase() === d.name.trim().toLowerCase());
  const ok = d.name.trim().length >= 2 && !taken;
  const used = d.id ? sourceInUse(store.db, d.id) : false;
  const save = (patch: Partial<Source> = {}) => {
    const r = store.saveSource({ ...d, ...patch, name: d.name.trim() });
    toast.show(store.online ? t("co.saved") : t("offline.queued"), r.undo);
    onDone(patch.active === false ? undefined : r.id);
  };
  return (
    <View style={{ gap: space[3] }}>
      <Labeled label={t("src.name")}>
        <TextField type="company" value={d.name} onChangeText={(v) => set({ name: v })} placeholder={t("src.namePh")} />
      </Labeled>
      {taken ? (
        <T v="caption" tone="warn">
          {t("src.taken")}
        </T>
      ) : null}
      <Labeled label={t("src.kind")}>
        <ChoiceChips<SourceKind> value={d.kind} onChange={(k) => set({ kind: k })} items={SOURCE_KINDS.map((k) => ({ key: k, label: t(sourceKindLabel(k)) }))} />
      </Labeled>
      {d.kind === "person" ? (
        <>
          <Labeled label={t("co.phone")}>
            <TextField type="phone" value={d.phone ?? ""} onChangeText={(v) => set({ phone: v })} placeholder="(555) 555-0100" label={t("co.phone")} icon="phone" />
          </Labeled>
          <Labeled label={t("co.email")}>
            <TextField type="email" value={d.email ?? ""} onChangeText={(v) => set({ email: v })} placeholder="name@example.com" label={t("co.email")} icon="message" />
          </Labeled>
        </>
      ) : null}
      <Labeled label={t("src.note")}>
        <TextField type="text" value={d.note ?? ""} onChangeText={(v) => set({ note: v })} placeholder={t("src.notePh")} />
      </Labeled>
      <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={() => save()} />
      {d.id ? (
        <RowView style={{ justifyContent: "space-between" }}>
          <StatusChip status="neutral" label={used ? t("src.usedHint") : t("src.unusedHint")} soft />
          <Button
            label={d.active ? t("src.hide") : t("src.show")}
            icon={d.active ? "close" : "check"}
            variant="ghost"
            size="sm"
            onPress={() => save({ active: !d.active })}
          />
        </RowView>
      ) : null}
      <Button label={t("common.cancel")} variant="ghost" full onPress={() => onDone()} />
    </View>
  );
}
