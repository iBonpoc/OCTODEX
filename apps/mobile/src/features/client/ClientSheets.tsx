/**
 * Sheets of the client card (docs/specs/04 §7.2): people (several phones / emails each, "+ Phone" is a button,
 * never an empty row), tags (company list, + new), status (active / archived / do not service + reason).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { clientStatusChip, statusChoices, statusOf, tagLabel } from "@/features/clients";
import type { Customer, CustomerStatus, Person, PersonRole, PhoneLabel } from "@/data/types";
import { DOC_LANG_LABEL, DOC_LANGS, useI18n, type DictKey, type DocLang } from "@/i18n";
import { Labeled } from "@/features/fields";
import { Button, ChoiceChips, IconButton, MultiChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, FieldGroup, RowView, SectionTitle } from "@/ui/surfaces";
import { type GuardedUndo } from "@/data/undo";

const ROLES: PersonRole[] = ["main", "spouse", "assistant", "tenant", "property_manager", "accountant", "other"];
const LABELS: PhoneLabel[] = ["mobile", "home", "work", "other"];

export function PeopleSheet({ visible, customer, onClose }: { visible: boolean; customer: Customer; onClose: () => void }) {
  const store = useStore();
  return <PeopleEditSheet visible={visible} mainName={customer.name} people={peopleOf(customer)} onSave={(p) => store.saveCustomerPeople(customer.id, p)} onClose={onClose} />;
}

/**
 * People of a client or a lead (one shape, docs/specs/04 §3.2 and docs/14 §2): the first is the client / lead itself
 * (its name, role "main"); the others have a name and a role. Each has several phones and emails.
 */
export function PeopleEditSheet({
  visible,
  mainName,
  people: initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  mainName: string;
  people: Person[];
  /** returns the undo for the toast */
  onSave: (people: Person[]) => GuardedUndo;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>(initial);
  const [dirty, setDirty] = useState(false);
  const key = JSON.stringify(initial);
  useEffect(() => {
    if (visible) {
      setPeople(JSON.parse(key) as Person[]);
      setDirty(false);
    }
  }, [visible, key]);
  const edit = (i: number, fn: (p: Person) => Person) => {
    setPeople((ps) => ps.map((p, k) => (k === i ? fn(p) : p)));
    setDirty(true);
  };
  const save = () => {
    // the main contact is the client / lead itself: same name
    const out = people.map((p, i) => (i === 0 ? { ...p, name: mainName, role: "main" as const } : p));
    toast.show(t("person.saved"), onSave(out));
    setDirty(false);
    onClose();
  };
  /** phones and emails of one person: "+ Phone" / "+ Email" are buttons; with several, one is marked "primary" */
  const fields = (p: Person, i: number) => (
    <>
      <Labeled label={t("lead.langLabel")}>
        <ChoiceChips<DocLang | "">
          value={p.language ?? ""}
          onChange={(v) => edit(i, (x) => ({ ...x, language: v || undefined }))}
          items={[{ key: "", label: t("lead.any") }, ...DOC_LANGS.map((k) => ({ key: k, label: DOC_LANG_LABEL[k] }))]}
        />
      </Labeled>
      {p.phones.map((ph, k) => (
        <View key={`ph${k}`} style={{ gap: space[2] }}>
          <RowView>
            <View style={{ flex: 1 }}>
              <TextField
                type="phone"
                value={ph.number}
                onChangeText={(v) => edit(i, (x) => ({ ...x, phones: x.phones.map((y, j) => (j === k ? { ...y, number: v } : y)) }))}
                placeholder={t("person.phone")}
              />
            </View>
            <IconButton icon="trash" label={t("person.removePhone")} onPress={() => edit(i, (x) => ({ ...x, phones: x.phones.filter((_, j) => j !== k) }))} />
          </RowView>
          <RowView style={{ flexWrap: "wrap" }}>
            <ChoiceChips<PhoneLabel>
              value={ph.label}
              onChange={(l) => edit(i, (x) => ({ ...x, phones: x.phones.map((y, j) => (j === k ? { ...y, label: l } : y)) }))}
              items={LABELS.map((l) => ({ key: l, label: t(`phone.${l}` as DictKey) }))}
            />
            {p.phones.length > 1 ? (
              ph.primary ? (
                <T v="caption" tone="mut">
                  {t("person.primary")}
                </T>
              ) : (
                <Button
                  label={t("person.makePrimary")}
                  variant="ghost"
                  size="sm"
                  onPress={() => edit(i, (x) => ({ ...x, phones: x.phones.map((y, j) => ({ ...y, primary: j === k || undefined })) }))}
                />
              )
            ) : null}
          </RowView>
        </View>
      ))}
      {p.emails.map((e, k) => (
        <View key={`em${k}`} style={{ gap: space[2] }}>
          <RowView>
            <View style={{ flex: 1 }}>
              <TextField
                type="email"
                value={e.address}
                onChangeText={(v) => edit(i, (x) => ({ ...x, emails: x.emails.map((y, j) => (j === k ? { ...y, address: v } : y)) }))}
                placeholder={t("person.email")}
              />
            </View>
            <IconButton icon="trash" label={t("person.removeEmail")} onPress={() => edit(i, (x) => ({ ...x, emails: x.emails.filter((_, j) => j !== k) }))} />
          </RowView>
          {p.emails.length > 1 ? (
            e.primary ? (
              <T v="caption" tone="mut">
                {t("person.primary")}
              </T>
            ) : (
              <Button
                label={t("person.makePrimary")}
                variant="ghost"
                size="sm"
                onPress={() => edit(i, (x) => ({ ...x, emails: x.emails.map((y, j) => ({ ...y, primary: j === k || undefined })) }))}
              />
            )
          ) : null}
        </View>
      ))}
      <RowView style={{ flexWrap: "wrap" }}>
        <Button
          label={t("person.addPhone")}
          icon="plus"
          variant="secondary"
          size="sm"
          onPress={() => edit(i, (x) => ({ ...x, phones: [...x.phones, { number: "", label: "mobile", primary: x.phones.length === 0 || undefined }] }))}
        />
        <Button
          label={t("person.addEmail")}
          icon="plus"
          variant="secondary"
          size="sm"
          onPress={() => edit(i, (x) => ({ ...x, emails: [...x.emails, { address: "", primary: x.emails.length === 0 || undefined }] }))}
        />
      </RowView>
    </>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t("client.contacts")} dirty={dirty} onSave={save}>
      {/* the main person's fields straight on the sheet (DS §11 п.17, #1411); each further person stays a card — an object of a list */}
      <FieldGroup title={t("client.mainContacts")}>{people[0] ? fields(people[0], 0) : null}</FieldGroup>
      <SectionTitle title={t("client.moreContacts")} />
      {people.slice(1).map((p, j) => {
        const i = j + 1;
        return (
          <Card key={p.id}>
            <RowView>
              <View style={{ flex: 1 }}>
                <TextField type="name" value={p.name} onChangeText={(v) => edit(i, (x) => ({ ...x, name: v }))} placeholder={t("person.name")} />
              </View>
              <Button
                label={t("person.remove")}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setPeople((ps) => ps.filter((_, k) => k !== i));
                  setDirty(true);
                }}
              />
            </RowView>
            <ChoiceChips<PersonRole>
              value={p.role}
              onChange={(r) => edit(i, (x) => ({ ...x, role: r }))}
              items={ROLES.filter((r) => r !== "main").map((r) => ({ key: r, label: t(`person.role.${r}` as DictKey) }))}
            />
            {fields(p, i)}
          </Card>
        );
      })}
      <Button
        label={t("client.addContact")}
        icon="plus"
        variant="secondary"
        onPress={() => {
          setPeople((ps) => [...ps, { id: Crypto.randomUUID(), name: "", role: "spouse", phones: [{ number: "", label: "mobile", primary: true }], emails: [] }]);
          setDirty(true);
        }}
      />
      <Button label={t("ue.save")} icon="check" onPress={save} disabled={!dirty} />
    </Sheet>
  );
}

export function TagsSheet({ visible, customer, onClose }: { visible: boolean; customer: Customer; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [sel, setSel] = useState<string[]>(customer.tagIds ?? []);
  const [name, setName] = useState("");
  useEffect(() => {
    if (visible) {
      setSel(customer.tagIds ?? []);
      setName("");
    }
  }, [visible, customer]);
  const live = store.db.tags.filter((x) => x.active || sel.includes(x.id)).sort((a, b) => a.position - b.position);
  const dirty = sel.slice().sort().join() !== (customer.tagIds ?? []).slice().sort().join();
  const save = () => {
    toast.show(t("tag.saved"), store.setCustomerTags(customer.id, sel));
    onClose();
  };
  const exists = store.db.tags.some((x) => tagLabel(x, t).toLowerCase() === name.trim().toLowerCase() || x.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Sheet visible={visible} onClose={onClose} title={t("tag.title")} dirty={dirty} onSave={save}>
      <T v="caption" tone="mut">
        {t("tag.hint")}
      </T>
      <MultiChips<string> value={sel} onChange={setSel} items={live.map((x) => ({ key: x.id, label: tagLabel(x, t) }))} />
      <SectionTitle title={t("tag.new")} />
      <RowView>
        <View style={{ flex: 1 }}>
          <TextField type="title" value={name} onChangeText={setName} placeholder={t("tag.newPlaceholder")} />
        </View>
        <Button
          label={t("tag.add")}
          icon="plus"
          variant="secondary"
          disabled={!name.trim() || exists}
          onPress={() => {
            const r = store.saveTag({ name: name.trim(), active: true });
            setSel((s) => [...s, r.id]);
            setName("");
          }}
        />
      </RowView>
      <Button label={t("ue.save")} icon="check" onPress={save} disabled={!dirty} />
    </Sheet>
  );
}

export function StatusSheet({ visible, customer, onClose, preset }: { visible: boolean; customer: Customer; onClose: () => void; preset?: CustomerStatus }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const cur = statusOf(customer);
  const [st, setSt] = useState<CustomerStatus>(cur);
  const [reason, setReason] = useState(customer.statusReason ?? "");
  useEffect(() => {
    if (visible) {
      setSt(preset ?? statusOf(customer));
      setReason(customer.statusReason ?? "");
    }
  }, [visible, customer, preset]);
  // prospect becomes active by itself (signature / manual win); here the office moves between the other three
  // the mark is the director's and the office's (04 §12.8)
  const options = statusChoices(cur, store.role);
  const dirty = st !== cur || (st === "do_not_service" && reason !== (customer.statusReason ?? ""));
  const ok = st !== "do_not_service" || reason.trim().length >= 2;
  const save = () => {
    if (!ok) return;
    toast.show(t("client.statusSaved"), store.setCustomerStatus(customer.id, st, reason.trim()));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("client.statusTitle")} dirty={dirty} onSave={ok ? save : undefined}>
      <ChoiceChips<CustomerStatus> value={st} onChange={setSt} items={options.map((s) => ({ key: s, label: t(clientStatusChip[s].l) }))} />
      <StatusChip status={clientStatusChip[st].s} label={t(clientStatusChip[st].l)} />
      <T v="caption" tone="mut">
        {t(`client.stHint.${st}` as DictKey)}
      </T>
      {st === "do_not_service" ? <TextField type="note" value={reason} onChangeText={setReason} placeholder={t("client.reasonPlaceholder")} /> : null}
      <Button label={t("ue.save")} icon="check" onPress={save} disabled={!dirty || !ok} />
    </Sheet>
  );
}
