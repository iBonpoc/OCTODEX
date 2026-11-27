import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { visibleClients } from "@/features/clients";
import { ClientFiles } from "@/features/client/ClientFiles";
import { useI18n } from "@/i18n";
import { Empty, Screen } from "@/ui/surfaces";

/** #3076 «Фото и файлы» клиента: `/client/files/<id>` — from the row «Фото и файлы · N» of the client's «Журнал» (body — features/client/ClientFiles). */
export default function ClientFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role } = useStore();
  const { t } = useI18n();
  const c = visibleClients(db, role).find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(c ? `/client/${c.id}?tab=log` : "/clients"));
  return (
    <Screen title={t("c3076.title")} back={back}>
      {c ? <ClientFiles c={c} /> : <Empty icon="user" title={t("clients.empty")} />}
    </Screen>
  );
}
