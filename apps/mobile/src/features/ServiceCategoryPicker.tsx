/**
 * Direction of the business (docs/specs/11-trade.md): a row with a picker sheet for a lead / job / estimate,
 * and the company's list editor in settings. Picker menus are rows (rule 12), the list itself is cards.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ID, ServiceCategory } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { TRADES } from "@/features/companySetup";
import { activeCategories, categoryLabel, choosable, nameTaken } from "@/features/serviceCategories";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, FieldGroup, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { StatusNote } from "@/ui/statusNote";

/** "Direction: Plumbing ›" — hidden while the company has no directions; read-only when the only one is already set */
export function ServiceCategoryRow({
  value,
  onChange,
  readOnly,
  bare,
}: {
  value?: ID;
  onChange: (id: ID | undefined) => void;
  readOnly?: boolean;
  /** a field of a form: the row straight on the background, no card (DS §11 п.17, #1411); a record's card keeps its card */
  bare?: boolean;
}) {
  const { db } = useStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const list = db.serviceCategories;
  if (!list.length) return null;
  const cur = list.find((c) => c.id === value);
  const options = choosable(list, value);
  const fixed = readOnly || (options.length === 1 && options[0].id === value);
  const label = cur ? categoryLabel(cur, t) : t("dir.none");
  const Box = bare ? View : Card;
  return (
    <Box>
      <ListRow title={t("dir.title")} subtitle={label} onPress={fixed ? undefined : () => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={t("dir.title")}>
        {options.map((c) => (
          <ListRow
            key={c.id}
            title={`${c.id === value ? "✓ " : ""}${categoryLabel(c, t)}`}
            subtitle={c.archivedAt ? t("dir.archived") : undefined}
            onPress={() => {
              onChange(c.id);
              setOpen(false);
            }}
          />
        ))}
        <Divider />
        <ListRow
          title={`${!value ? "✓ " : ""}${t("dir.none")}`}
          onPress={() => {
            onChange(undefined);
            setOpen(false);
          }}
        />
      </Sheet>
    </Box>
  );
}

/** Settings → Directions of work: add a preset or an own one, rename, reorder, archive / bring back. Owner and admin. */
export function ServiceCategoryEditor() {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const list = store.db.serviceCategories;
  const active = activeCategories(list);
  const archived = list.filter((c) => c.archivedAt);
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [own, setOwn] = useState("");
  const freePresets = TRADES.filter((k) => !active.some((c) => c.seedKey === k));
  const label = (c: ServiceCategory) => categoryLabel(c, t);
  const ownTaken = !!own.trim() && nameTaken(list, own, undefined, t);
  return (
    <>
      {active.length ? (
        // Settings → directions: a list of the company's objects (not a picker in a sheet) — compact cards (06 «Серия B», B4)
        <CardGrid>
          {active.map((c) => (
            <ListCard key={c.id} density="compact" testID={`dir-${c.id}`} lead={{ kind: "icon", icon: "toolbox" }} title={label(c)} when={c.seedKey && !c.name ? t("dir.preset") : t("dir.own")} onPress={() => setEditing(c)} />
          ))}
        </CardGrid>
      ) : (
        <Empty icon="wrench" title={t("dir.empty")} />
      )}
      {freePresets.length ? (
        <Card>
          <SectionTitle title={t("dir.addPreset")} />
          <ChoiceChips<string>
            value=""
            onChange={(k) => toast.show(t("dir.added"), store.saveServiceCategory({ seedKey: k }).undo)}
            items={freePresets.map((k) => ({ key: k, label: t(`trade.${k}` as DictKey) }))}
          />
        </Card>
      ) : null}
      <FieldGroup title={t("dir.addOwn")}>
        <RowView>
          <View style={{ flex: 1 }}>
            <TextField type="title" value={own} onChangeText={setOwn} placeholder={t("dir.ownPlaceholder")} />
          </View>
          <Button
            label={t("dir.add")}
            icon="plus"
            variant="secondary"
            disabled={!own.trim() || ownTaken}
            onPress={() => {
              toast.show(t("dir.added"), store.saveServiceCategory({ name: own.trim() }).undo);
              setOwn("");
            }}
          />
        </RowView>
        {ownTaken ? (
          <StatusNote tone="warn">{t("dir.taken")}</StatusNote>
        ) : null}
        <T v="caption" tone="mut">
          {t("co.tradesNote")}
        </T>
      </FieldGroup>
      {archived.length ? (
        <>
          <SectionTitle title={t("dir.archivedList")} />
          <CardGrid>
            {archived.map((c) => {
              // a card's action cannot be greyed out: when the name is taken again, no «Вернуть» and the card says why
              const blocked = nameTaken(list, label(c), c.id, t) || (!!c.seedKey && active.some((x) => x.seedKey === c.seedKey));
              return (
                <ListCard
                  key={c.id}
                  density="compact"
                  testID={`dir-archived-${c.id}`}
                  lead={{ kind: "icon", icon: "toolbox" }}
                  title={label(c)}
                  when={blocked ? `${t("dir.archived")} · ${t("dir.taken")}` : t("dir.archived")}
                  action={blocked ? undefined : { label: t("dir.restore"), onPress: () => toast.show(t("dir.restored"), store.saveServiceCategory({ id: c.id, archivedAt: undefined }).undo) }}
                />
              );
            })}
          </CardGrid>
        </>
      ) : null}
      <EditSheet c={editing} active={active} onClose={() => setEditing(null)} />
    </>
  );
}

function EditSheet({ c, active, onClose }: { c: ServiceCategory | null; active: ServiceCategory[]; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState("");
  useEffect(() => setName(c ? categoryLabel(c, t) : ""), [c, t]);
  if (!c) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const original = categoryLabel(c, t);
  const dirty = name.trim() !== original;
  const taken = dirty && nameTaken(store.db.serviceCategories, name, c.id, t);
  const i = active.findIndex((x) => x.id === c.id);
  const swap = (j: number) => {
    const other = active[j];
    store.saveServiceCategory({ id: other.id, position: c.position });
    toast.show(t("dir.moved"), store.saveServiceCategory({ id: c.id, position: other.position }).undo);
    onClose();
  };
  const save = () => {
    toast.show(t("dir.renamed"), store.saveServiceCategory({ id: c.id, name: name.trim() }).undo);
    onClose();
  };
  return (
    <Sheet visible={!!c} onClose={onClose} title={original} dirty={dirty} onSave={save}>
      <TextField type="title" value={name} onChangeText={setName} placeholder={t("dir.ownPlaceholder")} />
      {taken ? (
        <StatusNote tone="warn">{t("dir.taken")}</StatusNote>
      ) : null}
      <T v="caption" tone="mut">
        {t("dir.renameHint")}
      </T>
      <Button label={t("dir.save")} icon="check" full disabled={!dirty || !name.trim() || taken} onPress={save} />
      <RowView style={{ gap: space[2] }}>
        <Button label={t("dir.up")} variant="secondary" disabled={i <= 0} onPress={() => swap(i - 1)} />
        <Button label={t("dir.down")} variant="secondary" disabled={i < 0 || i >= active.length - 1} onPress={() => swap(i + 1)} />
      </RowView>
      <Button
        label={t("dir.archive")}
        variant="ghost"
        full
        onPress={() => {
          toast.show(t("dir.archivedDone"), store.saveServiceCategory({ id: c.id, archivedAt: new Date().toISOString() }).undo);
          onClose();
        }}
      />
    </Sheet>
  );
}
