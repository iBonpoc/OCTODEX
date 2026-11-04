import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { LeadSource } from "@/data/types";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Screen } from "@/ui/surfaces";

const SOURCES: LeadSource[] = ["Referral", "Google", "Website", "Thumbtack", "Yelp"];

/**
 * Client contact details and main property address.
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
  const [name, setName] = useState(c?.name ?? "");
  const [phone, setPhone] = useState(c?.phone ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [address, setAddress] = useState(p?.address ?? "");
  const [city, setCity] = useState(p?.city ?? "");
  const [source, setSource] = useState<LeadSource>("Referral");
  const back = () => (router.canGoBack() ? router.back() : router.replace(id ? `/client/${id}` : "/clients"));
  if (!creating && !c) {
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }
  const phoneOk = phone.replace(/\D/g, "").length >= 7;
  const ok = name.trim().length >= 2 && (!creating || (phoneOk && (address.trim() || city.trim())));
  const save = () => {
    if (creating) {
      const r = store.addCustomer({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, source, address: address.trim(), city: city.trim() });
      toast.show(store.online ? t("clients.created", { name: name.trim() }) : t("offline.queued"), r.undo);
      router.replace(`/client/${r.id}`);
      return;
    }
    const undos = [store.updateCustomer(c!.id, { name: name.trim(), phone: phone.trim(), email: email.trim() })];
    if (p && (address !== p.address || city !== p.city)) undos.push(store.updateProperty(p.id, { address: address.trim(), city: city.trim() }));
    toast.show(store.online ? t("co.saved") : t("offline.queued"), () => undos.reverse().forEach((u) => u()));
    back();
  };
  return (
    <Screen title={creating ? t("clients.new") : t("client.editTitle")} back={back}>
      <Card>
        <Labeled label={t("lead.name")}>
          <TextField value={name} onChangeText={setName} placeholder={t("lead.name")} icon="user" />
        </Labeled>
        <Labeled label={t("co.phone")}>
          <TextField value={phone} onChangeText={setPhone} placeholder="(555) 555-0100" keyboardType="phone-pad" icon="phone" />
        </Labeled>
        <Labeled label={t("co.email")}>
          <TextField value={email} onChangeText={setEmail} placeholder="client@example.com" keyboardType="email-address" icon="message" />
        </Labeled>
      </Card>
      {p || creating ? (
        <Card>
          <Labeled label={t("co.street")}>
            <TextField value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
          </Labeled>
          <Labeled label={t("co.city")}>
            <TextField value={city} onChangeText={setCity} placeholder="Pasadena, CA 91103" />
          </Labeled>
        </Card>
      ) : null}
      {creating ? (
        <Card>
          <Labeled label={t("lead.source")}>
            <ChoiceChips<LeadSource> value={source} onChange={setSource} items={SOURCES.map((s) => ({ key: s, label: s }))} />
          </Labeled>
        </Card>
      ) : null}
      <Button label={creating ? t("clients.create") : t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
    </Screen>
  );
}
