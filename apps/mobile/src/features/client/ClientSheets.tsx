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
import { clientStatusChip, statusOf, tagLabel } from "@/features/clients";
import type { Customer, CustomerStatus, Person, PersonRole, PhoneLabel } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips, IconButton, MultiChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";

const ROLES: PersonRole[] = ["main", "spouse", "assistant", "tenant", "property_manager", "accountant", "other"];
const LABELS: PhoneLabel[] = ["mobile", "home", "work", "other"];

export function PeopleSheet({ visible, customer, onClose }: { visible: boolean; customer: Customer; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>(() => peopleOf(customer));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (visible) {
      setPeople(peopleOf(customer));
      setDirty(false);
    }
  }, [visible, customer]);
  const edit = (i: number, fn: (p: Person) => Person) => {
    setPeople((ps) => ps.map((p, k) => (k === i ? fn(p) : p)));
    setDirty(true);
  };
  const save = () => {
    toast.show(t("person.saved"), store.saveCustomerPeople(customer.id, people));
    setDirty(false);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("client.people")} dirty={dirty} onSave={save}>
      {people.map((p, i) => (
        <Card key={p.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="micro" tone="mut">
              {i === 0 ? t("person.mainPerson") : t("person.n", { n: i + 1 })}
            </T>
            {people.length > 1 ? (
              <Button
                label={t("person.remove")}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setPeople((ps) => ps.filter((_, k) => k !== i));
                  setDirty(true);
                }}
              />
            ) : null}
          </RowView>
          <TextField type="name" value={p.name} onChangeText={(v) => edit(i, (x) => ({ ...x, name: v }))} placeholder={t("person.name")} />
          <ChoiceChips<PersonRole> value={p.role} onChange={(r) => edit(i, (x) => ({ ...x, role: r }))} items={ROLES.map((r) => ({ key: r, label: t(`person.role.${r}` as DictKey) }))} />
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
                <IconButton
                  icon="star"
                  label={t("person.makePrimary")}
                  active={!!ph.primary}
                  onPress={() => edit(i, (x) => ({ ...x, phones: x.phones.map((y, j) => ({ ...y, primary: j === k || undefined })) }))}
                />
                <IconButton icon="trash" label={t("person.removePhone")} onPress={() => edit(i, (x) => ({ ...x, phones: x.phones.filter((_, j) => j !== k) }))} />
              </RowView>
              <ChoiceChips<PhoneLabel>
                value={ph.label}
                onChange={(l) => edit(i, (x) => ({ ...x, phones: x.phones.map((y, j) => (j === k ? { ...y, label: l } : y)) }))}
                items={LABELS.map((l) => ({ key: l, label: t(`phone.${l}` as DictKey) }))}
              />
            </View>
          ))}
          {p.emails.map((e, k) => (
            <RowView key={`em${k}`}>
              <View style={{ flex: 1 }}>
                <TextField
                  type="email"
                  value={e.address}
                  onChangeText={(v) => edit(i, (x) => ({ ...x, emails: x.emails.map((y, j) => (j === k ? { ...y, address: v } : y)) }))}
                  placeholder={t("person.email")}
                />
              </View>
              <IconButton
                icon="star"
                label={t("person.makePrimary")}
                active={!!e.primary}
                onPress={() => edit(i, (x) => ({ ...x, emails: x.emails.map((y, j) => ({ ...y, primary: j === k || undefined })) }))}
              />
              <IconButton icon="trash" label={t("person.removeEmail")} onPress={() => edit(i, (x) => ({ ...x, emails: x.emails.filter((_, j) => j !== k) }))} />
            </RowView>
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
        </Card>
      ))}
      <Button
        label={t("person.add")}
        icon="plus"
        variant="secondary"
        onPress={() => {
          setPeople((ps) => [...ps, { id: Crypto.randomUUID(), name: "", role: "spouse", phones: [], emails: [] }]);
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

export function StatusSheet({ visible, customer, onClose }: { visible: boolean; customer: Customer; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const cur = statusOf(customer);
  const [st, setSt] = useState<CustomerStatus>(cur);
  const [reason, setReason] = useState(customer.statusReason ?? "");
  useEffect(() => {
    if (visible) {
      setSt(statusOf(customer));
      setReason(customer.statusReason ?? "");
    }
  }, [visible, customer]);
  // prospect becomes active by itself (signature / manual win); here the office moves between the other three
  const options: CustomerStatus[] = cur === "prospect" ? ["prospect", "archived", "do_not_service"] : ["active", "archived", "do_not_service"];
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
