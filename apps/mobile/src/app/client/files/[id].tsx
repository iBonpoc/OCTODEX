import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { visibleClients } from "@/features/clients";
import { ClientFiles } from "@/features/client/ClientFiles";
import { canAddClientPhoto } from "@/features/client/clientMedia";
import { useI18n } from "@/i18n";
import { Empty, Screen } from "@/ui/surfaces";
import { useToast } from "@/ui/overlays";
import { usePhotoPick } from "@/features/usePhotoPick";

/** #3076 «Фото и файлы» клиента: `/client/files/<id>` — from the row «Фото и файлы · N» of the client's «Журнал» (body — features/client/ClientFiles). */
export default function ClientFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const toast = useToast();
  const { t } = useI18n();
  const c = visibleClients(db, role).find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(c ? `/client/${c.id}?tab=log` : "/clients"));
  // #3085: «＋» — a photo of the client (from the client by SMS or mail): the same camera / library as a visit's strip; on the
  // client at once (offline too), «Вернуть» for 5 s
  const add = usePhotoPick((uri) => {
    if (c) toast.show(t("toast.photo"), store.addClientFile(c.id, uri));
  });
  // #3161: «＋» only to whom the database lets add it (the office; a tech of this client; never a subcontractor)
  const mayAdd = !!c && canAddClientPhoto(db, role, c.id);
  return (
    <Screen title={t("c3076.title")} back={back} headerIcons={mayAdd ? [{ icon: "plus", a11y: t("c3076.add"), onPress: () => void add(), testID: "client-files-add" }] : undefined}>
      {c ? <ClientFiles c={c} /> : <Empty icon="user" title={t("clients.empty")} />}
    </Screen>
  );
}
