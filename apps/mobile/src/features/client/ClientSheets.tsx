/**
 * Sheets of the client card (docs/specs/04 §7.2; spec 56 wave 4): people (several phones / emails each, as iPhone «Контакты»),
 * tags (company list with checks, + new), the reason of «Не обслуживаем».
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { clientStatusChip, statusOf, tagLabel } from "@/features/clients";
import { markPrimaryFirst, primaryFirst } from "@/features/clientForm";
import type { Customer, CustomerStatus, Person, PersonRole, PhoneLabel } from "@/data/types";
import { DOC_LANG_LABEL, DOC_LANGS, useI18n, type DictKey, type DocLang } from "@/i18n";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { ActionRow, MultiValueField } from "@/ui/multiValueField";
import { OptionRows } from "@/ui/optionRow";
import { SelectField } from "@/ui/selectField";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { useHeldSheet } from "@/ui/heldSheet";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { localUndo, type GuardedUndo } from "@/data/undo";

const ROLES: PersonRole[] = ["main", "spouse", "assistant", "tenant", "property_manager", "accountant", "other"];
const LABELS: PhoneLabel[] = ["mobile", "home", "work", "other"];

export function PeopleSheet({ visible, customer, onClose }: { visible: boolean; customer: Customer; onClose: () => void }) {
  const store = useStore();
  return <PeopleEditSheet visible={visible} mainName={customer.name} people={peopleOf(customer)} onSave={(p) => store.saveCustomerPeople(customer.id, p)} onClose={onClose} />;
}

type PhoneRow = { k: string; number: string; label: PhoneLabel };
type EmailRow = { k: string; address: string };
/** a person as the sheet edits it: each phone and email has its own key (a row keeps its field when one above goes) */
type EdPerson = Omit<Person, "phones" | "emails"> & { phones: PhoneRow[]; emails: EmailRow[] };

let rowSeq = 0;
const rowKey = () => `r${++rowSeq}`;
/** the primary first (spec 56 §3а.3): the model keeps a flag, the sheet keeps the order */
const toEd = (people: Person[]): EdPerson[] =>
  primaryFirst(people).map((p) => ({ ...p, phones: p.phones.map((x) => ({ k: rowKey(), number: x.number, label: x.label })), emails: p.emails.map((x) => ({ k: rowKey(), address: x.address })) }));
/** on save the first phone and the first email of each person are the primary ones (DS §9 А14а) */
const fromEd = (people: EdPerson[]): Person[] =>
  markPrimaryFirst(people.map((p) => ({ ...p, phones: p.phones.map(({ number, label }) => ({ number, label })), emails: p.emails.map(({ address }) => ({ address })) })));

/**
 * People of a client or a lead (one shape, docs/specs/04 §3.2 and docs/14 §2): the first is the client / lead itself
 * (its name, role "main"); the others have a name and «Кто это». As iPhone «Контакты» (spec 56 §3а.3, DS §9 А14а): rows
 * `⊖ [Мобильный ⌄] number`, «⊕ Добавить телефон / email», «Язык · Любой ⌄»; «Сохранить» pinned at the bottom. No chips.
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
  const [people, setPeople] = useState<EdPerson[]>(() => toEd(initial));
  const [dirty, setDirty] = useState(false);
  const key = JSON.stringify(initial);
  useEffect(() => {
    if (visible) {
      setPeople(toEd(JSON.parse(key) as Person[]));
      setDirty(false);
    }
  }, [visible, key]);
  const edit = (i: number, fn: (p: EdPerson) => EdPerson) => {
    setPeople((ps) => ps.map((p, k) => (k === i ? fn(p) : p)));
    setDirty(true);
  };
  /** a removal (a number, an email, a person) at once, «Вернуть» in the toast (rule 5) */
  const removeWithUndo = (text: string, fn: (ps: EdPerson[]) => EdPerson[]) => {
    const before = people;
    setPeople(fn);
    setDirty(true);
    toast.show(text, localUndo(() => setPeople(before)));
  };
  const save = () => {
    // the main contact is the client / lead itself: same name
    const out = fromEd(people).map((p, i) => (i === 0 ? { ...p, name: mainName, role: "main" as const } : p));
    toast.show(t("person.saved"), onSave(out));
    setDirty(false);
    onClose();
  };
  const labels = LABELS.map((l) => ({ key: l, label: t(`phone.${l}` as DictKey) }));
  const langs: { key: DocLang | "any"; label: string }[] = [{ key: "any", label: t("lead.any") }, ...DOC_LANGS.map((k) => ({ key: k, label: DOC_LANG_LABEL[k] }))];
  /** phones and emails of one person, then its language */
  const fields = (p: EdPerson, i: number) => (
    <>
      <MultiValueField<PhoneLabel>
        testID={`people-${i}-phones`}
        rows={p.phones.map((x) => ({ id: x.k, label: x.label, value: x.number }))}
        labels={labels}
        valueType="phone"
        noteFor={(_r, k) => (k === 0 && p.phones.length > 1 ? t("person.primary") : undefined)}
        placeholder={t("person.phone")}
        addLabel={t("cw4.addPhone")}
        removeLabel={t("cw4.removePhone")}
        menuTitle={t("cw4.menu")}
        onChange={(id, patch) => edit(i, (x) => ({ ...x, phones: x.phones.map((y) => (y.k === id ? { ...y, ...(patch.label ? { label: patch.label } : null), ...(patch.value !== undefined ? { number: patch.value } : null) } : y)) }))}
        onRemove={(id) => removeWithUndo(t("cw4.phoneRemoved"), (ps) => ps.map((x, k) => (k === i ? { ...x, phones: x.phones.filter((y) => y.k !== id) } : x)))}
        onAdd={() => edit(i, (x) => ({ ...x, phones: [...x.phones, { k: rowKey(), number: "", label: "mobile" }] }))}
        actionsFor={(r, k) =>
          k > 0 ? [{ key: "primary", label: t("person.makePrimary"), onPress: () => edit(i, (x) => ({ ...x, phones: [...x.phones.filter((y) => y.k === r.id), ...x.phones.filter((y) => y.k !== r.id)] })) }] : []
        }
      />
      <MultiValueField<string>
        testID={`people-${i}-emails`}
        rows={p.emails.map((x) => ({ id: x.k, label: "", value: x.address }))}
        labels={[]}
        valueType="email"
        noteFor={(_r, k) => (k === 0 && p.emails.length > 1 ? t("person.primary") : undefined)}
        placeholder={t("person.email")}
        addLabel={t("cw4.addEmail")}
        removeLabel={t("cw4.removeEmail")}
        menuTitle={t("person.email")}
        onChange={(id, patch) => edit(i, (x) => ({ ...x, emails: x.emails.map((y) => (y.k === id && patch.value !== undefined ? { ...y, address: patch.value } : y)) }))}
        onRemove={(id) => removeWithUndo(t("cw4.emailRemoved"), (ps) => ps.map((x, k) => (k === i ? { ...x, emails: x.emails.filter((y) => y.k !== id) } : x)))}
        onAdd={() => edit(i, (x) => ({ ...x, emails: [...x.emails, { k: rowKey(), address: "" }] }))}
        actionsFor={(r, k) =>
          k > 0 ? [{ key: "primary", label: t("person.makePrimary"), onPress: () => edit(i, (x) => ({ ...x, emails: [...x.emails.filter((y) => y.k === r.id), ...x.emails.filter((y) => y.k !== r.id)] })) }] : []
        }
      />
      <SelectField<DocLang | "any">
        testID={`people-${i}-lang`}
        label={t("cw4.lang")}
        value={p.language ?? "any"}
        items={langs}
        onChange={(v) => edit(i, (x) => ({ ...x, language: v === "any" ? undefined : v }))}
      />
    </>
  );
  const main = people[0];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("client.contacts")}
      dirty={dirty}
      onSave={save}
      footer={<Button testID="people-save" label={t("ue.save")} icon="check" full onPress={save} disabled={!dirty} />}
    >
      <View testID="people-sheet" style={{ gap: space[3] }}>
        {/* the main person's fields straight on the sheet (DS §11 п.17, #1411); each further person stays a card — an object of a list */}
        <View>
          <T v="heading">{mainName}</T>
          <T v="caption" tone="mut">
            {t("client.mainContacts")}
          </T>
        </View>
        {main ? fields(main, 0) : null}
        <View>
          <SectionTitle title={t("client.moreContacts")} />
          <T v="caption" tone="mut">
            {t("cw4.moreHint")}
          </T>
        </View>
        {people.slice(1).map((p, j) => {
          const i = j + 1;
          return (
            <View key={p.id} testID={`people-${i}`}>
              <Card>
                <TextField type="name" value={p.name} onChangeText={(v) => edit(i, (x) => ({ ...x, name: v }))} placeholder={t("person.name")} />
                <SelectField<PersonRole>
                  testID={`people-${i}-role`}
                  label={t("cw4.who")}
                  value={p.role}
                  items={ROLES.filter((r) => r !== "main").map((r) => ({ key: r, label: t(`person.role.${r}` as DictKey) }))}
                  onChange={(r) => edit(i, (x) => ({ ...x, role: r }))}
                />
                {fields(p, i)}
                <ActionRow testID={`people-${i}-delete`} tone="bad" label={t("cw4.deleteContact")} onPress={() => removeWithUndo(t("cw4.contactRemoved"), (ps) => ps.filter((x) => x.id !== p.id))} />
              </Card>
            </View>
          );
        })}
        <ActionRow
          testID="people-add"
          icon="plusCircle"
          label={t("client.addContact")}
          onPress={() => {
            setPeople((ps) => [...ps, { id: Crypto.randomUUID(), name: "", role: "spouse", phones: [{ k: rowKey(), number: "", label: "mobile" }], emails: [] }]);
            setDirty(true);
          }}
        />
      </View>
    </Sheet>
  );
}

/**
 * The client's tags (DS §9 А4, spec 56 §3а.6): rows with a check (`OptionRows multiple`) — the changes pile up, «Готово · N» at the
 * bottom applies them; «✕» and the swipe close without them. A new tag joins the list checked.
 */
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
    if (dirty) toast.show(t("tag.saved"), store.setCustomerTags(customer.id, sel));
    onClose();
  };
  const exists = store.db.tags.some((x) => tagLabel(x, t).toLowerCase() === name.trim().toLowerCase() || x.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("tag.title")}
      dirty={dirty}
      onSave={save}
      footer={<Button testID="tags-done" label={t("cw4.done", { n: sel.length })} variant="secondary" full onPress={save} />}
    >
      <T v="caption" tone="mut">
        {t("tag.hint")}
      </T>
      <OptionRows<string> multiple testID="tags-rows" label={t("tag.title")} value={sel} onChange={setSel} items={live.map((x) => ({ key: x.id, title: tagLabel(x, t) }))} />
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
    </Sheet>
  );
}

/**
 * «Не обслуживаем» needs a reason (04 §12.8): the status itself is chosen in the `StatusPicker` at the chip (DS §9 А10); this sheet is
 * the page of that choice — what the mark does and why, «Сохранить».
 */
export function StatusSheet({ visible, customer, onClose, preset }: { visible: boolean; customer: Customer; onClose: () => void; preset: CustomerStatus }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const cur = statusOf(customer);
  const st = preset;
  const [reason, setReason] = useState(customer.statusReason ?? "");
  useEffect(() => {
    if (visible) setReason(customer.statusReason ?? "");
  }, [visible, customer]);
  const dirty = st !== cur || (st === "do_not_service" && reason !== (customer.statusReason ?? ""));
  const ok = st !== "do_not_service" || reason.trim().length >= 2;
  const save = () => {
    if (!ok) return;
    toast.show(t("client.statusSaved"), store.setCustomerStatus(customer.id, st, reason.trim()));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("client.statusTitle")} dirty={dirty} onSave={ok ? save : undefined}>
      <StatusChip status={clientStatusChip[st].s} label={t(clientStatusChip[st].l)} />
      <T v="caption" tone="mut">
        {t(`client.stHint.${st}` as DictKey)}
      </T>
      {st === "do_not_service" ? <TextField type="note" value={reason} onChangeText={setReason} placeholder={t("client.reasonPlaceholder")} /> : null}
      <Button label={t("ue.save")} icon="check" onPress={save} disabled={!dirty || !ok} />
    </Sheet>
  );
}

/**
 * #2098 (founder 18.11): «не обслуживаем» is reversible — «Снова обслуживать» asks once, on every path (the card's
 * button and the status chooser): new jobs and estimates open again, the reason and the history stay in the timeline,
 * the client's old links do not come back. «Отменить» is the store's own undo: while the lift waits in the queue it is
 * taken back with the mark and its reason as they were (nothing reaches the server); once sent, the toast says it is too
 * late — the mark is set again by hand (a new line in the history), never a half undo.
 */
export function ServeAgainSheet({ customer: open, to, onClose }: { customer: Customer | null; to: CustomerStatus; onClose: () => void }) {
  // the sheet keeps its client while it goes out (#1163): no «Снова обслуживать ?» with an empty name in the exit
  const held = useHeldSheet(open);
  const customer = held.value;
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const confirm = () => {
    if (!customer) return;
    toast.show(t(to === "active" ? "client.servedAgain" : "client.statusSaved", { name: customer.name }), store.setCustomerStatus(customer.id, to));
    onClose();
  };
  return (
    <Sheet visible={held.visible} onExited={held.onExited} onClose={onClose} title={t("client.serveAgain.title", { name: customer?.name ?? "" })}>
      <View testID="client-serve-again-sheet" style={{ gap: space[3] }}>
        <T v="body">{t("client.serveAgain.body")}</T>
        {customer?.statusReason ? (
          <T v="caption" tone="mut">
            {t("client.reason", { r: customer.statusReason })}
          </T>
        ) : null}
        <T v="caption" tone="mut">
          {t("client.serveAgain.links")}
        </T>
        <RowView style={{ flexWrap: "wrap" }}>
          <Button testID="client-serve-again-yes" label={t(to === "active" ? "client.serveAgain.yes" : "client.serveAgain.yesTo", { status: t(clientStatusChip[to].l) })} icon="check" onPress={confirm} />
          <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
        </RowView>
      </View>
    </Sheet>
  );
}
