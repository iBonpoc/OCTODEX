import { useRef, useState, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Person } from "@/data/types";
import { useI18n } from "@/i18n";
import { DOC_LANG_LABEL } from "@/i18n/translate";
import { mailtoHref } from "@/features/contactLinks";
import { smsWithBody } from "@/features/sms";
import { Button, ChoiceChips, IconButton, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";
import {
  firstEmail, firstPhone, messageJobChoices, messageLanguage, messagePeople, messageSubject, messageTemplates, messageText, ownerName, ownerPeople, TEMPLATE_LABEL,
  type MessageTemplate, type Owner,
} from "./messages";

/**
 * «Новое сообщение» (docs/specs/20 «6-3»; 13 §2.1.1): to whom → SMS or email (what the person has) → a ready text in the
 * CLIENT's language (rule 7; the app's language is not used) → «Отправить»: the phone's own app opens with the text and
 * the event is written at that moment — OCTODEX does not know whether it was sent. Only the text is kept, never the
 * phone or the address. «Отменить» for 5 s; without the network the event waits in the queue.
 */
export type MessagePreset = { owner?: Owner; person?: Person };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="micro" tone="mut">
        {label}
      </T>
      {children}
    </View>
  );
}

export function MessageSheet({ preset, onClose }: { preset: MessagePreset | null; onClose: () => void }) {
  if (!preset) return null;
  return <MessageSheetBody key={`${preset.owner?.id ?? ""}-${preset.person?.id ?? ""}`} preset={preset} onClose={onClose} />;
}

function MessageSheetBody({ preset, onClose }: { preset: MessagePreset; onClose: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [to, setTo] = useState<{ owner: Owner; person: Person } | null>(
    preset.owner && preset.person ? { owner: preset.owner, person: preset.person } : null,
  );
  const [query, setQuery] = useState("");
  const phone = firstPhone(to?.person);
  const email = firstEmail(to?.person);
  const [channel, setChannel] = useState<"sms" | "email">(phone ? "sms" : "email");
  const [tpl, setTpl] = useState<MessageTemplate | null>(null);
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const sent = useRef(false);

  // the technician with several of his jobs at this client picks one (else the one job / the lead / the client itself)
  const jobs = to ? messageJobChoices(db, role, to.owner) : [];
  const subject = to ? (jobs.length > 1 ? (jobId ? { subjectType: "job" as const, subjectId: jobId } : undefined) : messageSubject(db, role, to.owner)) : undefined;
  const lang = to ? messageLanguage(db, to.owner, to.person) : undefined;
  const templates = to ? messageTemplates(db, to.owner) : [];
  const ch = channel === "sms" && !phone ? "email" : channel === "email" && !email ? "sms" : channel;
  const address = ch === "sms" ? phone : email;
  const ok = !!to && !!subject && !!address && text.trim().length > 0;

  const pick = (id: MessageTemplate) => {
    if (!to || !lang) return;
    setTpl(id);
    const params = templates.find((x) => x.id === id)?.params ?? {};
    const firstName = (to.person.name || ownerName(db, to.owner)).split(/\s+/)[0] ?? "";
    setText(messageText(lang, id, params, { firstName, company: db.company?.dba || db.company?.name || store.companyName || "" }));
  };

  const send = () => {
    if (sent.current || !ok || !to || !subject || !address) return;
    const body = text.trim();
    const url = ch === "sms" ? smsWithBody(address, body) : mailtoHref(address, { body });
    // nothing to open (a broken number / address): nothing is written either
    if (!url) {
      toast.show(t("w6.msg.noApp"));
      return;
    }
    sent.current = true;
    Linking.openURL(url).catch(() => {});
    const undo = store.logMessage({ ...subject, contactId: to.person.id, channel: ch, text: body });
    toast.show(store.online ? t("w6.msg.opened") : t("offline.queued"), undo);
    onClose();
  };

  // «Написать» in a client's / lead's conversation without a person: only that client's / lead's people
  const people = to
    ? []
    : (preset.owner
        ? ownerPeople(db, preset.owner).filter((p) => p.phones.length || p.emails.length).map((p) => ({ owner: preset.owner!, person: p, label: p.name || ownerName(db, preset.owner!) }))
        : messagePeople(db, role, query)
      ).slice(0, 20);
  return (
    <Sheet visible onClose={onClose} title={t("w6.msg.new")} dirty={text.trim().length > 0} onSave={ok ? send : undefined}>
      <View style={{ gap: space[3] }}>
        <Field label={t("w6.msg.to")}>
          {to ? (
            <ListRow
              title={to.person.name || ownerName(db, to.owner)}
              subtitle={to.person.name && to.person.name !== ownerName(db, to.owner) ? ownerName(db, to.owner) : undefined}
              right={!preset.person ? <IconButton icon="close" label={t("w6.task.subjectChange")} onPress={() => { setTo(null); setTpl(null); setText(""); }} /> : undefined}
            />
          ) : (
            <View style={{ gap: space[2] }} testID="msg-people">
              {preset.owner ? null : <TextField type="search" icon="search" value={query} onChangeText={setQuery} placeholder={t("w6.msg.toSearch")} />}
              <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
                {people.length === 0 ? (
                  <T v="caption" tone="mut">{t("w6.task.subjectNone")}</T>
                ) : (
                  people.map((a, i) => (
                    <View key={`${a.owner.id}-${a.person.id}`}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow title={a.label} onPress={() => { setTo({ owner: a.owner, person: a.person }); setChannel(firstPhone(a.person) ? "sms" : "email"); }} />
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </Field>
        {to && jobs.length > 1 ? (
          <Field label={t("w6.msg.job")}>
            <ChoiceChips<string> value={jobId ?? ""} onChange={setJobId} items={jobs.map((j) => ({ key: j.id, label: j.label }))} />
          </Field>
        ) : null}
        {to && !subject && jobs.length <= 1 ? <T v="caption" tone="warn">{`⚠ ${t("w6.msg.cannot")}`}</T> : null}
        {to && !phone && !email ? <T v="caption" tone="warn">{`⚠ ${t("w6.msg.noAddress")}`}</T> : null}
        {to && (subject || jobs.length > 1) && (phone || email) ? (
          <>
            {phone && email ? (
              <Field label={t("w6.msg.channel")}>
                <ChoiceChips<"sms" | "email">
                  value={ch}
                  onChange={setChannel}
                  items={[
                    { key: "sms", label: t("w6.msg.sms") },
                    { key: "email", label: t("w6.msg.email") },
                  ]}
                />
              </Field>
            ) : null}
            <Field label={t("w6.msg.template")}>
              <ChoiceChips<MessageTemplate> value={tpl ?? ("" as MessageTemplate)} onChange={pick} items={templates.map((x) => ({ key: x.id, label: t(TEMPLATE_LABEL[x.id]) }))} />
              {lang ? <T v="caption" tone="mut">{t("w6.msg.lang", { lang: DOC_LANG_LABEL[lang] })}</T> : null}
            </Field>
            <Field label={t("w6.msg.text")}>
              <TextField type="note" value={text} onChangeText={setText} placeholder={t("w6.msg.textPh")} />
            </Field>
            <Button label={t("w6.msg.send")} icon="send" variant="primary" full disabled={!ok} onPress={send} />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
