import { useState } from "react";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { LeadSource } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Screen } from "@/ui/surfaces";
import { View } from "react-native";

const SOURCES: LeadSource[] = ["Google", "Thumbtack", "Yelp", "Website", "Referral"];

/** Manual lead (phone call, neighbor, yard sign). Email/platform leads arrive in Inbox automatically (wave 5). */
export default function NewLead() {
  const { t } = useI18n();
  const { addLead, online } = useStore();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState<LeadSource>("Google");
  const [message, setMessage] = useState("");
  const ok = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 7;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const save = () => {
    const undo = addLead({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
      city: city.trim() || "Los Angeles",
      source,
      message: message.trim(),
    });
    toast.show(online ? t("lead.saved", { name: name.trim() }) : t("offline.queued"), undo);
    router.replace("/inbox");
  };
  return (
    <Screen title={t("lead.title")} back={back}>
      <Card>
        <View style={{ gap: space[3] }}>
          <TextField value={name} onChangeText={setName} placeholder={t("lead.name")} icon="user" />
          <TextField value={phone} onChangeText={setPhone} placeholder={t("lead.phone")} icon="phone" />
          <TextField value={address} onChangeText={setAddress} placeholder={t("lead.address")} icon="pin" />
          <TextField value={city} onChangeText={setCity} placeholder={t("lead.city")} icon="globe" />
          <T v="caption" tone="mut">
            {t("lead.source")}
          </T>
          <ChoiceChips<LeadSource> value={source} onChange={setSource} items={SOURCES.map((s) => ({ key: s, label: s }))} />
          <TextField value={message} onChangeText={setMessage} placeholder={t("lead.message")} multiline />
        </View>
      </Card>
      {!ok ? (
        <T v="caption" tone="mut">
          {t("lead.need")}
        </T>
      ) : null}
      <Button label={t("lead.save")} icon="check" full disabled={!ok} onPress={save} />
    </Screen>
  );
}
