/**
 * Sheets of a property (wave C2, docs/specs/04 §7.3): address and kind, access (notes + gate code), people of the property.
 * Every save is a store mutation with "Undo" and works offline.
 */
import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { useStore } from "@/data/store";
import { PROPERTY_KINDS, type Property, type PropertyKind } from "@/data/types";
import { peopleOf } from "@/data/people";
import { canSaveProperty, placeOf } from "@/features/properties";
import { Labeled } from "@/features/fields";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips, MultiChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";

/** a new property of this client, ready for the sheet */
export const newProperty = (customerId: string): Property => ({
  id: Crypto.randomUUID(),
  customerId,
  address: "",
  city: "",
  place: { city: "", state: "CA", zip: "" },
  stories: 1,
  contactIds: [],
});

export function PropertySheet({ value, onClose }: { value: Property | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Property | null>(value);
  const [d0, setD0] = useState<string>("");
  useEffect(() => {
    const v = value ? { ...value, place: placeOf(value) } : null;
    setD(v);
    setD0(JSON.stringify(v));
  }, [value]);
  if (!value || !d) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const set = (p: Partial<Property>) => setD((x) => (x ? { ...x, ...p } : x));
  const place = d.place ?? { city: "" };
  const setPlace = (p: Partial<NonNullable<Property["place"]>>) => set({ place: { ...place, ...p } });
  const exists = store.db.properties.some((p) => p.id === d.id);
  const ok = canSaveProperty(d);
  const save = () => {
    toast.show(t("prop.saved"), store.saveProperty(d));
    onClose();
  };
  return (
    <Sheet visible={!!value} onClose={onClose} title={exists ? t("prop.edit") : t("prop.new")} dirty={JSON.stringify(d) !== d0} onSave={ok ? save : undefined}>
      <Labeled label={t("prop.street")}>
        <TextField type="street" value={d.address} onChangeText={(v) => set({ address: v })} placeholder={t("prop.street")} icon="pin" />
      </Labeled>
      <Labeled label={t("prop.unit")}>
        <TextField type="unit" value={d.unit ?? ""} onChangeText={(v) => set({ unit: v })} placeholder={t("prop.unit")} />
      </Labeled>
      <Labeled label={t("co.city")}>
        <TextField type="city" value={place.city} onChangeText={(v) => setPlace({ city: v })} placeholder={t("co.city")} />
      </Labeled>
      <RowView>
        <Labeled label={t("co.state")}>
          <TextField type="state" value={place.state ?? ""} onChangeText={(v) => setPlace({ state: v })} placeholder="CA" label={t("co.state")} />
        </Labeled>
        <Labeled label={t("lead.missing.zip")}>
          <TextField type="zip" value={place.zip ?? ""} onChangeText={(v) => setPlace({ zip: v })} placeholder="91103" label={t("lead.missing.zip")} />
        </Labeled>
      </RowView>
      <Labeled label={t("prop.label")}>
        <TextField type="text" value={d.label ?? ""} onChangeText={(v) => set({ label: v })} placeholder={t("prop.labelHint")} label={t("prop.label")} />
      </Labeled>
      <Labeled label={t("prop.kind")}>
        <ChoiceChips<PropertyKind | "">
          value={d.kind ?? ""}
          onChange={(v) => set({ kind: v || undefined })}
          items={[{ key: "", label: t("lead.any") }, ...PROPERTY_KINDS.map((k) => ({ key: k, label: t(`prop.kind.${k}` as DictKey) }))]}
        />
      </Labeled>
      <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
    </Sheet>
  );
}

/** access notes (everyone who sees the property) and the gate code (office) */
export function AccessSheet({ value, onClose }: { value: Property | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [gate, setGate] = useState("");
  useEffect(() => {
    setNotes(value?.accessNotes ?? "");
    setGate(value?.gateCode ?? "");
  }, [value]);
  if (!value) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const dirty = notes !== (value.accessNotes ?? "") || gate !== (value.gateCode ?? "");
  const save = () => {
    const undos: (() => void)[] = [];
    if (notes !== (value.accessNotes ?? "")) undos.push(store.saveProperty({ ...value, accessNotes: notes }));
    if (gate !== (value.gateCode ?? "")) undos.push(store.setGateCode(value.id, gate));
    toast.show(gate !== (value.gateCode ?? "") ? t("prop.gateSaved") : t("prop.saved"), () => undos.reverse().forEach((u) => u()));
    onClose();
  };
  return (
    <Sheet visible={!!value} onClose={onClose} title={t("prop.access")} dirty={dirty} onSave={save}>
      <Labeled label={t("prop.accessNotes")}>
        <TextField type="note" value={notes} onChangeText={setNotes} placeholder={t("prop.accessNotesHint")} label={t("prop.accessNotes")} multiline />
      </Labeled>
      <Labeled label={t("prop.gate")}>
        <TextField type="code" value={gate} onChangeText={setGate} placeholder="#1234" label={t("prop.gate")} />
      </Labeled>
      <T v="caption" tone="mut">
        {t("prop.gateHidden")}
      </T>
      <Button label={t("ue.save")} icon="check" full disabled={!dirty} onPress={save} />
    </Sheet>
  );
}

/** which of the client's people belong to this property (tenant, property manager) */
export function PropertyPeopleSheet({ value, onClose }: { value: Property | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel(value?.contactIds ?? []), [value]);
  if (!value) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const c = store.db.customers.find((x) => x.id === value.customerId);
  const people = c ? peopleOf(c) : [];
  const dirty = JSON.stringify(sel) !== JSON.stringify(value.contactIds ?? []);
  const save = () => {
    toast.show(t("prop.saved"), store.saveProperty({ ...value, contactIds: sel }));
    onClose();
  };
  return (
    <Sheet visible={!!value} onClose={onClose} title={t("prop.people")} dirty={dirty} onSave={save}>
      <T v="caption" tone="mut">
        {t("prop.peopleHint")}
      </T>
      <MultiChips<string> value={sel} onChange={setSel} items={people.map((p) => ({ key: p.id, label: `${p.name || "—"} · ${t(`person.role.${p.role}` as DictKey)}` }))} />
      <Button label={t("ue.save")} icon="check" full disabled={!dirty} onPress={save} />
    </Sheet>
  );
}
