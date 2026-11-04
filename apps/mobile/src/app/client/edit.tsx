import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { Button, TextField } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Screen } from "@/ui/surfaces";

/** Edit client contact details and the main property address (collected after the client signs). */
export default function EditClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const c = store.db.customers.find((x) => x.id === id);
  const p = store.db.properties.find((x) => x.customerId === id);
  const [name, setName] = useState(c?.name ?? "");
  const [phone, setPhone] = useState(c?.phone ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [address, setAddress] = useState(p?.address ?? "");
  const [city, setCity] = useState(p?.city ?? "");
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));
  if (!c) {
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }
  const save = () => {
    const undos = [store.updateCustomer(c.id, { name: name.trim(), phone: phone.trim(), email: email.trim() })];
    if (p && (address !== p.address || city !== p.city)) undos.push(store.updateProperty(p.id, { address: address.trim(), city: city.trim() }));
    toast.show(store.online ? t("co.saved") : t("offline.queued"), () => undos.reverse().forEach((u) => u()));
    back();
  };
  return (
    <Screen title={t("client.editTitle")} back={back}>
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
      {p ? (
        <Card>
          <Labeled label={t("co.street")}>
            <TextField value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
          </Labeled>
          <Labeled label={t("co.city")}>
            <TextField value={city} onChangeText={setCity} placeholder="Pasadena, CA 91103" />
          </Labeled>
        </Card>
      ) : null}
      <Button label={t("ue.save")} icon="check" full disabled={name.trim().length < 2} onPress={save} />
    </Screen>
  );
}
