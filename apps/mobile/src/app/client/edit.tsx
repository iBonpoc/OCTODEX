import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { offerNewClient, splitTyped } from "@/features/estimate/newClientHandoff";
import { useStore } from "@/data/store";
import { companyState } from "@/features/companySetup";
import type { BillingAddress, PhoneLabel } from "@/data/types";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { SourceSheet } from "@/features/lead/SourcePicker";
import { sourceOf } from "@/features/leads";
import {
  billingOk,
  displayName,
  emptyBilling,
  mainEmailsOf,
  mainPhonesOf,
  nameOk,
  namePartsOf,
  phoneOk,
  withMainContactsAll,
  type NameParts,
  type PhoneLine,
} from "@/features/clientForm";
import { TextField } from "@/ui/controls";
import { MultiValueField } from "@/ui/multiValueField";
import { SelectField } from "@/ui/selectField";
import { ToggleRow } from "@/ui/toggleRow";
import { useToast } from "@/ui/overlays";
import { Empty, FieldGroup, Screen } from "@/ui/surfaces";
import { FieldRow } from "@/ui/pairs";
import { EditorScreen } from "@/ui/templates";

/**
 * Новый / правка клиента — шаблон «Редактор» (prototype v2, wireframes-v2 «Новый клиент», LAYOUT-RULES §3): fields in groups with
 * their titles, labels over the fields, the name as a pair «Имя · Фамилия» in a row, the street and the city in a row; ONE step
 * «Создать клиента» / «Сохранить» pinned at the bottom (EditorScreen), held back with its reason until the form is enough;
 * «назад» with unsaved changes asks «Выйти без сохранения?» (rule 5). The rules of the form (features/clientForm) are only called.
 *
 * The client form (docs/specs/13-app-structure.md §3.3 «Изменить», wave 4; spec 56 §3а.5): first name, last name, company; the
 * main person's phones and emails as iPhone «Контакты» (`MultiValueField`); the main property address; «Источник · Google ⌄»;
 * «Без налога» and «Счета на другой адрес» — switches with their fields right under them (DS §11 п.19).
 * Without `id` — a new client entered by hand (repeat customer, neighbor, phone call); it is active at once.
 */
export default function EditClient() {
  // `for` (#2887): opened from an estimate's client sheet — once made, the client goes back to that estimate
  // `name`: what was typed in that sheet's search — a name goes to the name, digits to the phone (#2887, crm-reviewer №2)
  const { id, for: forKey, name: typedName } = useLocalSearchParams<{ id?: string; for?: string; name?: string }>();
  const typed = splitTyped(typedName);
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const creating = !id;
  const c = id ? store.db.customers.find((x) => x.id === id) : undefined;
  const p = id ? store.db.properties.find((x) => x.customerId === id) : undefined;
  const [name, setName] = useState<NameParts>(c ? namePartsOf(c) : { first: typed.first, last: typed.last, company: "" });
  // each line has its own key: a line keeps its field when one above it goes
  const seq = useRef(0);
  const line = (x: PhoneLine, k: string): PhoneLine & { k: string } => ({ ...x, k });
  const [phones, setPhones] = useState<(PhoneLine & { k: string })[]>(() => (c && mainPhonesOf(c).length ? mainPhonesOf(c) : [{ number: typed.phone, label: "mobile" as const }]).map((x, i) => line(x, `p${i}`)));
  const [emails, setEmails] = useState<{ k: string; address: string }[]>(() => (c && mainEmailsOf(c).length ? mainEmailsOf(c) : [""]).map((address, i) => ({ k: `e${i}`, address })));
  const nextKey = (pre: string) => `${pre}n${++seq.current}`;
  const [sourceOpen, setSourceOpen] = useState(false);
  const [address, setAddress] = useState(p?.address ?? "");
  const [city, setCity] = useState(p?.city ?? "");
  const [sourceId, setSourceId] = useState(c?.sourceId ?? store.db.sources.find((x) => x.active && x.name === "Referral")?.id ?? store.db.sources[0]?.id ?? "");
  const [billingOwn, setBillingOwn] = useState(!!c?.billing);
  const [billing, setBilling] = useState<BillingAddress>(c?.billing ?? emptyBilling(companyState(store.db.company)));
  const [taxExempt, setTaxExempt] = useState(!!c?.taxExempt);
  const [taxNote, setTaxNote] = useState(c?.taxExemptNote ?? "");
  const back = () => (router.canGoBack() ? router.back() : router.replace(id ? `/client/${id}` : "/clients"));
  // what the form held when it opened: «назад» asks only when something changed
  const snap = JSON.stringify([name, phones.map((x) => [x.number, x.label]), emails.map((e) => e.address), address, city, sourceId, billingOwn, billing, taxExempt, taxNote]);
  const [first] = useState(snap);
  const dirty = snap !== first;
  // the form is the office's: the tech has no «Изменить» and the server refuses his customers update (customers_update)
  if (store.role === "tech" || (!creating && !c)) {
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }
  const setPart = (k: keyof NameParts) => (v: string) => setName((x) => ({ ...x, [k]: v }));
  const setB = (k: keyof BillingAddress) => (v: string) => setBilling((x) => ({ ...x, [k]: v }));
  const shown = displayName(name);
  const filled = phones.map((x) => x.number.trim()).filter(Boolean);
  const email = emails.map((e) => e.address.trim()).find(Boolean) ?? "";
  // a new client: a name and one way to reach them (13 §3.3) plus the address of the first property (addCustomer makes it);
  // an existing one may have neither phone nor email (a business client)
  const ok =
    nameOk(name) &&
    filled.every(phoneOk) &&
    (!billingOwn || billingOk(billing)) &&
    (!creating || ((filled.length > 0 || email.trim().includes("@")) && !!(address.trim() || city.trim())));

  const save = () => {
    const parts = { firstName: name.first, lastName: name.last, companyName: name.company };
    if (creating) {
      const r = store.addCustomer({ name: shown, phone: filled[0] ?? "", email: email || undefined, sourceId, address: address.trim(), city: city.trim() });
      const undos = [r.undo, store.updateCustomer(r.id, parts)];
      // more than one phone or email, or a label other than «Мобильный»: the main person gets them all (the first is the primary)
      const lines = phones.filter((x) => x.number.trim());
      if (lines.length > 1 || lines.some((x) => x.label !== "mobile") || emails.filter((e) => e.address.trim()).length > 1) {
        const made = { id: r.id, name: shown, phone: filled[0] ?? "", email: email || undefined, sourceId, balanceCents: 0 };
        undos.push(store.saveCustomerPeople(r.id, withMainContactsAll(made, lines, emails.map((e) => e.address))));
      }
      // all or nothing (DS §15.2): the client and its name parts go back together, or neither
      // #2887: made from an estimate — back to it (it takes the client and its property). No «Вернуть» there (crm-reviewer №1):
      // the estimate holds the client at once, and an undo would leave it on a client that is gone; a creation is not
      // irreversible (rule 5) — the client is deleted from its card. With no estimate under the form — the client's card.
      const toEstimate = !!forKey && router.canGoBack() && offerNewClient(forKey, { customerId: r.id, propertyId: r.propertyId });
      const said = store.online ? t("clients.created", { name: shown }) : t("offline.queued");
      if (toEstimate) {
        toast.show(said);
        router.back();
      } else {
        toast.show(said, store.undoTogether(undos));
        router.replace(`/client/${r.id}`);
      }
      return;
    }
    // «Без налога» (П-2a): only when it changed — a signed document never changes, new ones get the exempt profile
    const taxPatch =
      taxExempt !== !!c!.taxExempt || (taxExempt && taxNote.trim() !== (c!.taxExemptNote ?? "")) ? { taxExempt, taxExemptNote: taxExempt ? taxNote : "" } : {};
    const undos = [
      store.updateCustomer(c!.id, { name: shown, ...parts, ...(sourceId !== c!.sourceId ? { sourceId } : {}), billing: billingOwn ? billing : null, ...taxPatch }),
    ];
    const samePhones = JSON.stringify(phones.filter((x) => x.number.trim()).map((x) => ({ number: x.number.trim(), label: x.label }))) === JSON.stringify(mainPhonesOf(c!));
    const sameEmails = JSON.stringify(emails.map((e) => e.address.trim()).filter(Boolean)) === JSON.stringify(mainEmailsOf(c!));
    if (!samePhones || !sameEmails) undos.push(store.saveCustomerPeople(c!.id, withMainContactsAll(c!, phones, emails.map((e) => e.address))));
    if (p && (address !== p.address || city !== p.city)) undos.push(store.updateProperty(p.id, { address: address.trim(), city: city.trim() }));
    toast.show(store.online ? t("co.saved") : t("offline.queued"), store.undoTogether(undos));
    back();
  };

  // why the step is held back: the first thing missing (the button never just goes grey without a word)
  const why = !nameOk(name)
    ? t("client.f.nameNeeded")
    : !filled.every(phoneOk)
      ? t("proto.client.form.phoneBad")
      : creating && !(filled.length > 0 || email.trim().includes("@"))
        ? t("proto.client.form.reach")
        : creating && !(address.trim() || city.trim())
          ? t("proto.client.form.address")
          : billingOwn && !billingOk(billing)
            ? t("proto.client.form.billing")
            : undefined;
  return (
    <EditorScreen
      testID="client-form"
      title={creating ? t("clients.new") : t("client.editTitle")}
      back={back}
      dirty={dirty}
      save={{ testID: "client-save", label: creating ? t("clients.create") : t("ue.save"), disabled: !ok, reason: ok ? undefined : why, onPress: save }}
    >
      <FieldGroup title={t("proto.client.form.who")}>
        <FieldRow>
          <Labeled label={t("client.f.first")}>
            <TextField type="name" value={name.first} onChangeText={setPart("first")} placeholder={t("client.f.first")} icon="user" />
          </Labeled>
          <Labeled label={t("client.f.last")}>
            <TextField type="name" value={name.last} onChangeText={setPart("last")} placeholder={t("client.f.last")} />
          </Labeled>
        </FieldRow>
        <Labeled label={t("client.f.company")}>
          <TextField type="text" value={name.company} onChangeText={setPart("company")} placeholder={t("client.f.companyHint")} label={t("client.f.company")} />
        </Labeled>
      </FieldGroup>

      <FieldGroup title={t("proto.client.form.reachTitle")}>
        {/* as iPhone «Контакты» (spec 56 §3а.5, DS §9 А14а): ⊖ removes (the form is saved or left as a whole — no toast here),
            the label is a menu, «Сделать основным» moves a number up; the first one is the primary */}
        <MultiValueField<PhoneLabel>
          testID="client-phones"
          rows={phones.map((x) => ({ id: x.k, label: x.label, value: x.number }))}
          labels={(["mobile", "home", "work", "other"] as const).map((l) => ({ key: l, label: t(`phone.${l}`) }))}
          valueType="phone"
          noteFor={(_r, k) => (k === 0 && phones.length > 1 ? t("person.primary") : undefined)}
          placeholder="(555) 555-0100"
          addLabel={t("cw4.addPhone")}
          removeLabel={t("cw4.removePhone")}
          menuTitle={t("cw4.menu")}
          onChange={(id, patch) => setPhones((xs) => xs.map((x) => (x.k === id ? { ...x, ...(patch.label ? { label: patch.label } : null), ...(patch.value !== undefined ? { number: patch.value } : null) } : x)))}
          onRemove={(id) => setPhones((xs) => xs.filter((x) => x.k !== id))}
          onAdd={() => setPhones((xs) => [...xs, line({ number: "", label: "mobile" }, nextKey("p"))])}
          actionsFor={(r, i) => (i > 0 ? [{ key: "primary", label: t("person.makePrimary"), onPress: () => setPhones((xs) => [...xs.filter((x) => x.k === r.id), ...xs.filter((x) => x.k !== r.id)]) }] : [])}
        />
        <MultiValueField<string>
          testID="client-emails"
          rows={emails.map((x) => ({ id: x.k, label: "", value: x.address }))}
          labels={[]}
          valueType="email"
          noteFor={(_r, k) => (k === 0 && emails.length > 1 ? t("person.primary") : undefined)}
          placeholder="client@example.com"
          addLabel={t("cw4.addEmail")}
          removeLabel={t("cw4.removeEmail")}
          menuTitle={t("co.email")}
          onChange={(id, patch) => setEmails((xs) => xs.map((x) => (x.k === id && patch.value !== undefined ? { ...x, address: patch.value } : x)))}
          onRemove={(id) => setEmails((xs) => xs.filter((x) => x.k !== id))}
          onAdd={() => setEmails((xs) => [...xs, { k: nextKey("e"), address: "" }])}
          actionsFor={(r, i) => (i > 0 ? [{ key: "primary", label: t("person.makePrimary"), onPress: () => setEmails((xs) => [...xs.filter((x) => x.k === r.id), ...xs.filter((x) => x.k !== r.id)]) }] : [])}
        />
      </FieldGroup>

      {p || creating ? (
        <FieldGroup title={t("proto.client.form.addressTitle")}>
          <Labeled label={t("co.street")}>
            <TextField type="street" value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
          </Labeled>
          <Labeled label={t("co.city")}>
            <TextField type="city" value={city} onChangeText={setCity} placeholder="Pasadena, CA 91103" />
          </Labeled>
        </FieldGroup>
      ) : null}

      <FieldGroup title={t("proto.client.form.more")}>
        {/* «Источник · Google ⌄» (spec 56 §3а.5): a row of a form; the company's list with its groups and «＋ Новый источник» is the sheet */}
        <SelectField
          testID="client-source"
          label={t("lead.source")}
          value={sourceId}
          items={sourceOf(store.db, sourceId) ? [{ key: sourceId, label: sourceOf(store.db, sourceId)!.name }] : []}
          placeholder={t("src.choose")}
          onChange={setSourceId}
          onOpen={() => setSourceOpen(true)}
        />
        <SourceSheet visible={sourceOpen} value={sourceId} onClose={() => setSourceOpen(false)} onPick={(id) => { setSourceId(id); setSourceOpen(false); }} />
      </FieldGroup>

      {!creating ? (
        <FieldGroup>
          <ToggleRow testID="client-tax-exempt" label={t("client.f.taxExempt")} caption={t("client.f.taxExemptHint")} value={taxExempt} onChange={setTaxExempt}>
            <Labeled label={t("client.f.taxExemptNote")}>
              <TextField type="text" value={taxNote} onChangeText={setTaxNote} placeholder={t("client.f.taxExemptNoteHint")} label={t("client.f.taxExemptNote")} />
            </Labeled>
          </ToggleRow>
        </FieldGroup>
      ) : null}

      {!creating ? (
          <FieldGroup>
            {/* off = the property's address (spec 56 §3а.5): the address fields stand right under the switch while it is on (DS §11 п.19) */}
            <ToggleRow testID="client-billing-own" label={t("cw4.billingOther")} caption={billingOwn ? t("client.f.billingHint") : t("cw4.billingOff")} value={billingOwn} onChange={setBillingOwn}>
              <FieldGroup under>
                <Labeled label={t("prop.street")}>
                  <TextField type="street" value={billing.line1} onChangeText={setB("line1")} placeholder={t("prop.street")} icon="pin" label={`${t("client.row.billing")}: ${t("prop.street")}`} />
                </Labeled>
                <Labeled label={t("prop.unit")}>
                  <TextField type="unit" value={billing.unit ?? ""} onChangeText={setB("unit")} placeholder={t("prop.unit")} />
                </Labeled>
                <Labeled label={t("co.city")}>
                  <TextField type="city" value={billing.city} onChangeText={setB("city")} placeholder={t("co.city")} label={`${t("client.row.billing")}: ${t("co.city")}`} />
                </Labeled>
                <FieldRow>
                  <Labeled label={t("co.state")}>
                    <TextField type="state" value={billing.state ?? ""} onChangeText={setB("state")} placeholder={companyState(store.db.company) || t("co.state")} label={t("co.state")} />
                  </Labeled>
                  <Labeled label={t("lead.missing.zip")}>
                    <TextField type="zip" value={billing.zip ?? ""} onChangeText={setB("zip")} placeholder="91103" label={t("lead.missing.zip")} />
                  </Labeled>
                </FieldRow>
              </FieldGroup>
            </ToggleRow>
          </FieldGroup>
      ) : null}
    </EditorScreen>
  );
}
