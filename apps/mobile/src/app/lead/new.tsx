import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { defaultSourceId, findDuplicates, phoneKey } from "@/features/leads";
import { statusOf } from "@/features/clients";
import { SourceField } from "@/features/lead/SourcePicker";
import { TextField } from "@/ui/controls";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { formatPhoneUS } from "@/ui/inputFormat";
import { useToast } from "@/ui/overlays";
import { FieldGroup } from "@/ui/surfaces";
import { FieldRow } from "@/ui/pairs";
import { useRequiredForm } from "@/ui/requiredForm";
import { EditorScreen } from "@/ui/templates";
import { moduleDef } from "@/modules/registry";

/**
 * Новый лид — шаблон «Редактор» (prototype v2, LAYOUT-RULES §3): the fields in two groups «Кто · Что нужно», the street and the city
 * in a row, ONE step «Сохранить лид» pinned at the bottom (EditorScreen) with what is still missing over it; «назад» with something
 * typed asks «Выйти без сохранения?» (rule 5). The same phone / email → «уже ваш клиент / открытый лид» rows before saving.
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
  const missing = [
    ...(phoneKey(phone).length === 10 ? [] : [{ id: "phone", text: t("form.req.phone") }]),
    ...(name.trim().length > 1 ? [] : [{ id: "name", text: t("form.req.name") }]),
    ...(sourceId ? [] : [{ id: "source", text: t("form.req.source") }]),
  ];
  const submit = () => form.submit(missing, save);
  const dirty = !!(phone || name.trim() || address.trim() || city.trim() || message.trim());
  const back = () => (router.canGoBack() ? router.back() : router.replace("/leads"));
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
    <EditorScreen
      testID="new-lead"
      title={t("lead.title")}
      back={back}
      dirty={dirty}
      // the step stays pressable: a tap shows each missing field (useRequiredForm); the first one is said over the button
      save={{ testID: "lead-save", label: t("lead.save"), reason: dirty ? missing[0]?.text : undefined, onPress: submit }}
    >
      {/* «Вставить» an icon inside the phone field (DS §11 п.17–18, #1411) */}
      <FieldGroup title={t("proto.leads.form.who")} under testID="new-lead-fields">
        <Labeled label={t("lead.phone")}>
          <TextField
            type="phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 555-0100"
            label={t("lead.phone")}
            icon="phone"
            field={form.field("phone")}
            action={{ icon: "copy", label: t("field.pastePhone"), onPress: paste, testID: "new-lead-paste" }}
          />
        </Labeled>
        <Labeled label={t("lead.name")}>
          <TextField type="name" value={name} onChangeText={setName} placeholder={t("lead.name")} icon="user" field={form.field("name")} />
        </Labeled>
        <FieldRow>
          <Labeled label={t("co.street")}>
            <TextField type="street" value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
          </Labeled>
          <Labeled label={t("co.city")}>
            <TextField type="city" value={city} onChangeText={setCity} placeholder="Pasadena" />
          </Labeled>
        </FieldRow>
      </FieldGroup>

      {dup.customers.length || dup.leads.length ? (
        // the clients / leads found by the phone: the lead is still saved (04 §4) — the mark is a warning, the decision is the director's
        <ListGroup title={t("lead.dupTitle")} testID="new-lead-dups">
          {dup.customers.map((c) => (
            <GroupRow
              key={c.id}
              testID={statusOf(c) === "do_not_service" ? `new-lead-noservice-${c.id}` : `new-lead-dup-client-${c.id}`}
              lead={{ icon: statusOf(c) === "do_not_service" ? "alert" : "user" }}
              title={statusOf(c) === "do_not_service" ? t("lead.noService", { name: c.name }) : c.name}
              subtitle={statusOf(c) === "do_not_service" ? t("lead.noServiceHint") : t("lead.dupClient")}
              status={statusOf(c) === "do_not_service" ? { status: "bad", label: t("client.st.doNotService") } : { status: "warn", label: t("proto.leads.dupSign") }}
              onPress={() => router.push(`/client/${c.id}`)}
            />
          ))}
          {dup.leads.map((l) => (
            <GroupRow
              key={l.id}
              testID={`new-lead-dup-lead-${l.id}`}
              lead={{ icon: "inbox" }}
              title={l.name}
              subtitle={t("lead.dupLead", { date: day(l.receivedAt) })}
              status={{ status: "warn", label: t("proto.leads.dupSign") }}
              onPress={() => router.push(`/lead/${l.id}`)}
            />
          ))}
        </ListGroup>
      ) : null}

      <FieldGroup title={t("lead.sec.request")}>
        <SourceField value={sourceId} onChange={setSourceId} field={form.field("source")} />
        <Labeled label={t("lead.message")}>
          <TextField type="note" value={message} onChangeText={setMessage} placeholder={t("lead.messagePh")} />
        </Labeled>
      </FieldGroup>
    </EditorScreen>
  );
}
