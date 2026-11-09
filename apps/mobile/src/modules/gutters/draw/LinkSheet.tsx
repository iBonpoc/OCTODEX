/**
 * «Привязать замер» (founder 09.11, #688; spec 33 П24 Б1–Б3): on top «Лиды / Клиенты» and a search (no focus on open — the
 * founder saw an iOS «Вставить» and did not know why); a new lead right here by its phone (and a name, if wanted); an
 * open lead; a client's address. A measurement already linked goes to another one (relink, #692). Picker rows are
 * ListRow (rule 12); every link can be undone for 5 s (rule 5).
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { phoneKey } from "@/features/leads";
import { Button, Segmented, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { ListRow } from "@/ui/surfaces";
import { linkChoices, relink } from "../data";
import type { Customer, Property } from "@/data/types";

type Tab = "leads" | "clients";

export function LinkSheet({ visible, onClose, measurementId }: { visible: boolean; onClose: () => void; measurementId: string }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("leads");
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState<{ c: Customer; places: Property[] } | null>(null);
  const { leads, clients } = linkChoices(store.db, q);
  const reset = () => {
    setClient(null);
    setQ("");
    setPhone("");
    setName("");
  };
  const done = (undo: (() => void) | null, who: string) => {
    reset();
    onClose();
    toast.show(t("mod.gutters.link.done", { who }), undo ?? undefined);
  };
  const toPlace = (c: Customer, p: Property) => done(relink(store, measurementId, { propertyId: p.id }), `${c.name} · ${p.address}`);
  const close = () => {
    reset();
    onClose();
  };
  // a new lead by its phone (founder: «создать новый лид — можно ввести телефон»); the name is the phone if none
  const phoneOk = phoneKey(phone).length === 10;
  const newLead = () => {
    const source = store.db.sources.find((s) => s.active)?.id ?? "";
    const who = name.trim() || phone.trim();
    const r = store.addLead({ name: who, phone: phone.trim(), city: "", sourceId: source, message: "", service: undefined });
    const linked = relink(store, measurementId, { leadId: r.id });
    done(() => (linked?.(), r.undo()), who);
  };
  return (
    <Sheet visible={visible} onClose={close} title={t("mod.gutters.link.title")}>
      <View testID="link-sheet" style={{ gap: space[2] }}>
        {client ? (
          <View testID="link-places">
            <T v="caption" tone="mut">{t("mod.gutters.link.pickPlace", { name: client.c.name })}</T>
            {client.places.map((p) => (
              <View key={p.id} testID={`link-place-${p.id}`}>
                <ListRow title={p.address} subtitle={p.city} left={<Icon name="pin" />} onPress={() => toPlace(client.c, p)} />
              </View>
            ))}
          </View>
        ) : (
          <>
            <View testID="link-tabs">
              <Segmented full items={[{ key: "leads", label: t("mod.gutters.link.leads") }, { key: "clients", label: t("mod.gutters.link.clients") }]} value={tab} onChange={setTab} />
            </View>
            <View testID="link-search">
              <TextField type="search" value={q} onChangeText={setQ} label={t("mod.gutters.link.search")} placeholder={t("mod.gutters.link.search")} icon="search" />
            </View>
            {tab === "leads" ? (
              <>
                <View testID="link-new" style={{ gap: space[2] }}>
                  <T v="caption" tone="mut">{t("mod.gutters.link.new")}</T>
                  <View testID="link-new-phone"><TextField type="phone" value={phone} onChangeText={setPhone} label={t("mod.gutters.link.newPhone")} placeholder="(555) 555-0100" /></View>
                  <View testID="link-new-name"><TextField type="name" value={name} onChangeText={setName} label={t("mod.gutters.link.newName")} placeholder={t("mod.gutters.link.newName")} /></View>
                  <View testID="link-new-save"><Button label={t("mod.gutters.link.newSave")} size="sm" disabled={!phoneOk} onPress={newLead} /></View>
                </View>
                {leads.map((l) => (
                  <View key={l.id} testID={`link-lead-${l.id}`}>
                    <ListRow title={l.name} subtitle={l.address} left={<Icon name="inbox" />} onPress={() => done(relink(store, measurementId, { leadId: l.id }), l.name)} />
                  </View>
                ))}
                {!leads.length ? <T tone="mut">{t("mod.gutters.link.none")}</T> : null}
              </>
            ) : (
              <>
                {clients.map((x) => (
                  <View key={x.c.id} testID={`link-client-${x.c.id}`}>
                    <ListRow
                      title={x.c.name}
                      subtitle={x.places.length ? x.places.map((p) => p.address).join(" · ") : t("mod.gutters.link.noPlace")}
                      left={<Icon name="user" />}
                      onPress={x.places.length === 1 ? () => toPlace(x.c, x.places[0]!) : x.places.length > 1 ? () => setClient(x) : undefined}
                    />
                  </View>
                ))}
                {!clients.length ? <T tone="mut">{t("mod.gutters.link.none")}</T> : null}
              </>
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}
