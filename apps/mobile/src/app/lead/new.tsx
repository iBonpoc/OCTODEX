import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { space, statusIcon } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { defaultSourceId, findDuplicates, phoneKey } from "@/features/leads";
import { statusOf } from "@/features/clients";
import { SourceField } from "@/features/lead/SourcePicker";
import { Button, TextField } from "@/ui/controls";
import { formatPhoneUS } from "@/ui/inputFormat";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, RowView, Screen } from "@/ui/surfaces";
import { useRequiredForm } from "@/ui/requiredForm";
import { CardGrid, ListCard } from "@/ui/listCard";
import { moduleDef } from "@/modules/registry";
import { StatusNote } from "@/ui/statusNote";

/**
 * New lead in ~10 seconds, during the call: phone (paste), name, address, source, what they need.
 * Everything else is filled later on the lead card. Same phone / email → "already your client / open lead" before saving.
 */
export default function NewLead() {
  const { t, day } = useI18n();
  const store = useStore();
  const { db } = store;
  const toast = useToast();
  // made from a module's thing (S1b «Сделать заявкой», spec 33 П21): the module links it to the new lead
  const from = useLocalSearchParams<{ module?: string; ref?: string }>();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [sourceId, setSourceId] = useState(() => defaultSourceId(db));
  // the form opened before the company's sources arrived (right after sign-in, the first load from the server):
  // take the default as soon as they are here, else «Save» stays off with «Choose a source» (cloud e2e 103, PR #720)
  const fallbackSource = defaultSourceId(db);
  useEffect(() => {
    if (!sourceId && fallbackSource) setSourceId(fallbackSource);
  }, [sourceId, fallbackSource]);
  const [message, setMessage] = useState("");
  const dup = phoneKey(phone).length === 10 ? findDuplicates(db, { phone }) : { customers: [], leads: [] };
  const form = useRequiredForm();
  const submit = () =>
    form.submit(
      [
        ...(phoneKey(phone).length === 10 ? [] : [{ id: "phone", text: t("form.req.phone") }]),
        ...(name.trim().length > 1 ? [] : [{ id: "name", text: t("form.req.name") }]),
        ...(sourceId ? [] : [{ id: "source", text: t("form.req.source") }]),
      ],
      save,
    );
  const paste = async () => {
    const s = await Clipboard.getStringAsync().catch(() => "");
    if (s) setPhone(formatPhoneUS(s));
  };
  const save = () => {
    const r = store.addLead({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
      city: city.trim(),
      sourceId,
      message: message.trim(),
      service: undefined,
    });
    const linked = from.module && from.ref ? moduleDef(from.module)?.leadCreated?.({ ref: from.ref, leadId: r.id }, store) : undefined;
    // «Отменить» (rule 5): the lead and the module's link to it, both or neither (#1244, DS §15.2)
    const undo = store.undoTogether([r.undo, linked]);
    toast.show(store.online ? t("lead.saved", { name: name.trim() }) : t("offline.queued"), undo);
    router.replace(`/lead/${r.id}`);
  };
  return (
    <Screen title={t("lead.title")}>
      <Card>
        <Labeled label={t("lead.phone")}>
          <RowView>
            <View style={{ flex: 1 }}>
              <TextField type="phone" value={phone} onChangeText={setPhone} placeholder="(555) 555-0100" label={t("lead.phone")} icon="phone" field={form.field("phone")} />
            </View>
            <Button label={t("lead.paste")} icon="copy" size="sm" variant="secondary" onPress={paste} />
          </RowView>
        </Labeled>
        <Labeled label={t("lead.name")}>
          <TextField type="name" value={name} onChangeText={setName} placeholder={t("lead.name")} icon="user" field={form.field("name")} />
        </Labeled>
        <Labeled label={t("co.street")}>
          <TextField type="street" value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
        </Labeled>
        <Labeled label={t("co.city")}>
          <TextField type="city" value={city} onChangeText={setCity} placeholder="Pasadena" />
        </Labeled>
        <SourceField value={sourceId} onChange={setSourceId} field={form.field("source")} />
        <Labeled label={t("lead.need")}>
          <TextField type="note" value={message} onChangeText={setMessage} placeholder={t("lead.messagePh")} />
        </Labeled>
      </Card>

      {dup.customers.length || dup.leads.length ? (
        <View style={{ gap: space[2] }}>
          <StatusNote tone="warn" v="heading">
            {t("lead.dupTitle")}
          </StatusNote>
          {/* the clients / leads found — related objects: compact cards (06 «Серия B», B3) */}
          <CardGrid>
            {[
              ...dup.customers.map((c) => (
                statusOf(c) === "do_not_service" ? (
                  // the lead is still saved (04 §4): the mark is a warning, the decision is the director's
                  <ListCard
                    key={c.id}
                    density="compact"
                    testID={`new-lead-noservice-${c.id}`}
                    lead={{ kind: "icon", icon: statusIcon.bad, tone: "bad" }}
                    title={t("lead.noService", { name: c.name })}
                    when={t("lead.noServiceHint")}
                    status={{ tone: "bad", label: t("client.st.doNotService") }}
                    onPress={() => router.push(`/client/${c.id}`)}
                  />
                ) : (
                  <ListCard
                    key={c.id}
                    density="compact"
                    testID={`new-lead-dup-client-${c.id}`}
                    lead={{ kind: "icon", icon: statusIcon.warn, tone: "warn" }}
                    title={c.name}
                    when={t("lead.dupClient")}
                    edge="warn"
                    onPress={() => router.push(`/client/${c.id}`)}
                  />
                )
              )),
              ...dup.leads.map((l) => (
                <ListCard
                  key={l.id}
                  density="compact"
                  testID={`new-lead-dup-lead-${l.id}`}
                  lead={{ kind: "icon", icon: statusIcon.warn, tone: "warn" }}
                  title={l.name}
                  when={t("lead.dupLead", { date: day(l.receivedAt) })}
                  edge="warn"
                  onPress={() => router.push(`/lead/${l.id}`)}
                />
              )),
            ]}
          </CardGrid>
        </View>
      ) : null}

      <Button label={t("lead.save")} icon="check" full testID="lead-save" onPress={submit} />
    </Screen>
  );
}
