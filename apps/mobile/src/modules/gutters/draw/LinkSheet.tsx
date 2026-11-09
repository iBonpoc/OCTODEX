/**
 * «Сделать заявкой» → «Привязать замер» (founder 09.11, версия 475; spec 33 П20.23): a draft for nobody goes to a NEW
 * lead (the core's form, as before), to an open lead, or to a client's address — found by name. Picker rows are ListRow
 * (rule 12); a link can be undone for 5 s (rule 5).
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { ListRow } from "@/ui/surfaces";
import { linkChoices, linkLead, linkProperty } from "../data";
import type { Customer, Property } from "@/data/types";

export function LinkSheet({ visible, onClose, measurementId, onNew }: { visible: boolean; onClose: () => void; measurementId: string; onNew: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [client, setClient] = useState<{ c: Customer; places: Property[] } | null>(null);
  const { leads, clients } = linkChoices(store.db, q);
  const done = (undo: (() => void) | null, who: string) => {
    setClient(null);
    setQ("");
    onClose();
    toast.show(t("mod.gutters.link.done", { who }), undo ?? undefined);
  };
  const toPlace = (c: Customer, p: Property) => done(linkProperty(store, measurementId, p.id), `${c.name} · ${p.address}`);
  const close = () => {
    setClient(null);
    onClose();
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
            <View testID="link-new">
              <ListRow title={t("mod.gutters.link.new")} subtitle={t("mod.gutters.link.newHint")} left={<Icon name="plus" />} onPress={() => { close(); onNew(); }} />
            </View>
            <View testID="link-search">
              <TextField type="search" value={q} onChangeText={setQ} label={t("mod.gutters.link.search")} placeholder={t("mod.gutters.link.search")} icon="search" />
            </View>
            {leads.length ? <T v="caption" tone="mut">{t("mod.gutters.link.leads")}</T> : null}
            {leads.map((l) => (
              <View key={l.id} testID={`link-lead-${l.id}`}>
                <ListRow title={l.name} subtitle={l.address} left={<Icon name="inbox" />} onPress={() => done(linkLead(store, measurementId, l.id), l.name)} />
              </View>
            ))}
            {clients.length ? <T v="caption" tone="mut">{t("mod.gutters.link.clients")}</T> : null}
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
            {!leads.length && !clients.length ? <T tone="mut">{t("mod.gutters.link.none")}</T> : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
