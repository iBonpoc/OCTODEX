import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { BillingAddress } from "@/data/types";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { SourceField } from "@/features/lead/SourcePicker";
import {
  billingOk,
  displayName,
  EMPTY_BILLING,
  mainEmailOf,
  mainPhonesOf,
  nameOk,
  namePartsOf,
  phoneOk,
  withMainContacts,
  type NameParts,
  type PhoneLine,
} from "@/features/clientForm";
import { Button, ChoiceChips, IconButton, TextField, Toggle } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { T } from "@/ui/primitives";

/**
 * The client form (docs/specs/13-app-structure.md §3.3 «Изменить», wave 4): first name, last name, company; the main
 * person's phones («+ Number») and email; the main property address; source; the billing address (one per client).
 * Without `id` — a new client entered by hand (repeat customer, neighbor, phone call); it is active at once.
 */
export default function EditClient() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const creating = !id;
  const c = id ? store.db.customers.find((x) => x.id === id) : undefined;
  const p = id ? store.db.properties.find((x) => x.customerId === id) : undefined;
  const [name, setName] = useState<NameParts>(c ? namePartsOf(c) : { first: "", last: "", company: "" });
  const blank: PhoneLine = { number: "", label: "mobile" };
  const [phones, setPhones] = useState<PhoneLine[]>(c && mainPhonesOf(c).length ? mainPhonesOf(c) : [blank]);
  const [email, setEmail] = useState(c ? mainEmailOf(c) : "");
  const [address, setAddress] = useState(p?.address ?? "");
  const [city, setCity] = useState(p?.city ?? "");
  const [sourceId, setSourceId] = useState(c?.sourceId ?? store.db.sources.find((x) => x.active && x.name === "Referral")?.id ?? store.db.sources[0]?.id ?? "");
  const [billingOwn, setBillingOwn] = useState(!!c?.billing);
  const [billing, setBilling] = useState<BillingAddress>(c?.billing ?? EMPTY_BILLING);
  const [taxExempt, setTaxExempt] = useState(!!c?.taxExempt);
  const [taxNote, setTaxNote] = useState(c?.taxExemptNote ?? "");
  const back = () => (router.canGoBack() ? router.back() : router.replace(id ? `/client/${id}` : "/clients"));
  // the form is the office's: the tech has no «Изменить» and the server refuses his customers update (customers_update)
  if (store.role === "tech" || (!creating && !c)) {
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }
  const setPart = (k: keyof NameParts) => (v: string) => setName((x) => ({ ...x, [k]: v }));
  const setPhone = (i: number) => (v: string) => setPhones((x) => x.map((n, j) => (j === i ? { ...n, number: v } : n)));
  const setB = (k: keyof BillingAddress) => (v: string) => setBilling((x) => ({ ...x, [k]: v }));
  const shown = displayName(name);
  const filled = phones.map((x) => x.number.trim()).filter(Boolean);
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
      const r = store.addCustomer({ name: shown, phone: filled[0] ?? "", email: email.trim() || undefined, sourceId, address: address.trim(), city: city.trim() });
      const undos = [r.undo, store.updateCustomer(r.id, parts)];
      toast.show(store.online ? t("clients.created", { name: shown }) : t("offline.queued"), () => undos.reverse().forEach((u) => u()));
      router.replace(`/client/${r.id}`);
      return;
    }
    // «Без налога» (П-2a): only when it changed — a signed document never changes, new ones get the exempt profile
    const taxPatch =
      taxExempt !== !!c!.taxExempt || (taxExempt && taxNote.trim() !== (c!.taxExemptNote ?? "")) ? { taxExempt, taxExemptNote: taxExempt ? taxNote : "" } : {};
    const undos = [
      store.updateCustomer(c!.id, { name: shown, ...parts, ...(sourceId !== c!.sourceId ? { sourceId } : {}), billing: billingOwn ? billing : null, ...taxPatch }),
    ];
    const samePhones = JSON.stringify(phones.filter((x) => x.number.trim()).map((x) => ({ number: x.number.trim(), label: x.label }))) === JSON.stringify(mainPhonesOf(c!));
    if (!samePhones || email.trim() !== mainEmailOf(c!)) undos.push(store.saveCustomerPeople(c!.id, withMainContacts(c!, phones, email)));
    if (p && (address !== p.address || city !== p.city)) undos.push(store.updateProperty(p.id, { address: address.trim(), city: city.trim() }));
    toast.show(store.online ? t("co.saved") : t("offline.queued"), () => undos.reverse().forEach((u) => u()));
    back();
  };

  return (
    <Screen title={creating ? t("clients.new") : t("client.editTitle")} back={back}>
      <Card>
        <Labeled label={t("client.f.first")}>
          <TextField type="name" value={name.first} onChangeText={setPart("first")} placeholder={t("client.f.first")} icon="user" />
        </Labeled>
        <Labeled label={t("client.f.last")}>
          <TextField type="name" value={name.last} onChangeText={setPart("last")} placeholder={t("client.f.last")} />
        </Labeled>
        <Labeled label={t("client.f.company")}>
          <TextField type="text" value={name.company} onChangeText={setPart("company")} placeholder={t("client.f.companyHint")} label={t("client.f.company")} />
        </Labeled>
        {!nameOk(name) ? (
          <T v="caption" tone="mut">
            {t("client.f.nameNeeded")}
          </T>
        ) : null}
      </Card>

      <Card>
        <Labeled label={t("client.f.phones")}>
          <View>
            {phones.map((n, i) => (
              <RowView key={i}>
                <View style={{ flex: 1 }}>
                  <TextField type="phone" value={n.number} onChangeText={setPhone(i)} placeholder="(555) 555-0100" icon="phone" label={`${t("co.phone")} ${i + 1}`} />
                </View>
                {i > 0 ? <IconButton icon="close" label={`${t("person.removePhone")} ${i + 1}`} onPress={() => setPhones((x) => x.filter((_, j) => j !== i))} /> : null}
              </RowView>
            ))}
          </View>
        </Labeled>
        {!creating ? <Button label={t("client.f.addPhone")} icon="plus" variant="ghost" size="sm" onPress={() => setPhones((x) => [...x, blank])} /> : null}
        <Labeled label={t("co.email")}>
          <TextField type="email" value={email} onChangeText={setEmail} placeholder="client@example.com" icon="message" />
        </Labeled>
      </Card>

      {p || creating ? (
        <Card>
          <Labeled label={t("co.street")}>
            <TextField type="street" value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
          </Labeled>
          <Labeled label={t("co.city")}>
            <TextField type="city" value={city} onChangeText={setCity} placeholder="Pasadena, CA 91103" />
          </Labeled>
        </Card>
      ) : null}

      <Card>
        <SourceField value={sourceId} onChange={setSourceId} />
      </Card>

      {!creating ? (
        <Card>
          <Toggle on={taxExempt} onChange={setTaxExempt} label={t("client.f.taxExempt")} />
          {taxExempt ? (
            <Labeled label={t("client.f.taxExemptNote")}>
              <TextField type="text" value={taxNote} onChangeText={setTaxNote} placeholder={t("client.f.taxExemptNoteHint")} label={t("client.f.taxExemptNote")} />
            </Labeled>
          ) : null}
          <T v="caption" tone="mut">
            {t("client.f.taxExemptHint")}
          </T>
        </Card>
      ) : null}

      {!creating ? (
        <>
          <SectionTitle title={t("client.row.billing")} />
          <Card>
            <ChoiceChips<"same" | "own">
              value={billingOwn ? "own" : "same"}
              onChange={(v) => setBillingOwn(v === "own")}
              items={[
                { key: "same", label: t("client.row.billingSame") },
                { key: "own", label: t("client.f.billingOwn") },
              ]}
            />
            {billingOwn ? (
              <>
                <Labeled label={t("prop.street")}>
                  <TextField type="street" value={billing.line1} onChangeText={setB("line1")} placeholder={t("prop.street")} icon="pin" label={`${t("client.row.billing")}: ${t("prop.street")}`} />
                </Labeled>
                <Labeled label={t("prop.unit")}>
                  <TextField type="unit" value={billing.unit ?? ""} onChangeText={setB("unit")} placeholder={t("prop.unit")} />
                </Labeled>
                <Labeled label={t("co.city")}>
                  <TextField type="city" value={billing.city} onChangeText={setB("city")} placeholder={t("co.city")} label={`${t("client.row.billing")}: ${t("co.city")}`} />
                </Labeled>
                <RowView>
                  <Labeled label={t("co.state")}>
                    <TextField type="state" value={billing.state ?? ""} onChangeText={setB("state")} placeholder="CA" label={t("co.state")} />
                  </Labeled>
                  <Labeled label={t("lead.missing.zip")}>
                    <TextField type="zip" value={billing.zip ?? ""} onChangeText={setB("zip")} placeholder="91103" label={t("lead.missing.zip")} />
                  </Labeled>
                </RowView>
              </>
            ) : null}
            <T v="caption" tone="mut">
              {t("client.f.billingHint")}
            </T>
          </Card>
        </>
      ) : null}

      <Button label={creating ? t("clients.create") : t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
    </Screen>
  );
}
