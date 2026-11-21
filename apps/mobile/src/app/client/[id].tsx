import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { visibleClients } from "@/features/clients";
import { mergedTarget } from "@/features/clientDuplicates";
import { ClientObject } from "@/features/client/ClientCard";
import { clientSectionOf, type ClientSectionKey } from "@/features/client/nextStep";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Empty, Screen } from "@/ui/surfaces";

/**
 * Клиент — шаблон «Объект» (prototype v2, docs/design/client-card.html; the body — features/client/ClientCard `ClientObject`).
 * The open section is `/client/<id>?tab=<work|money|places|log>`; an old address of the 11 sections (`?tab=estimates`, `?s=notes`)
 * opens the section that holds it now (`clientSectionOf`).
 */
export default function ClientScreen() {
  const { id, s, tab } = useLocalSearchParams<{ id: string; s?: string; tab?: string }>();
  const { db, role } = useStore();
  const { t } = useI18n();
  const c = visibleClients(db, role).find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/clients"));
  // step 17 C3: an old link to a card merged into another — say where everything went (docs/specs/04 §13)
  const kept = !c ? mergedTarget(db, id) : undefined;
  if (!c && kept && visibleClients(db, role).some((x) => x.id === kept.id))
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty
          icon="user"
          title={t("clientDup.merged")}
          hint={t("clientDup.mergedHint", { name: kept.name })}
          action={<Button label={t("clientDup.open", { name: kept.name })} onPress={() => router.replace(`/client/${kept.id}`)} />}
        />
      </Screen>
    );
  if (!c)
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  const section = clientSectionOf(tab ?? s);
  // the choice goes to `?tab=` (an old `?s=` is read and dropped): «назад» leaves the client, not the section
  const onSection = (k: ClientSectionKey) => router.setParams({ tab: k === "overview" ? undefined : k, s: undefined });
  return <ClientObject key={c.id} c={c} section={section} onSection={onSection} back={back} />;
}
