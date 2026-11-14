import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { canServe, visibleClients } from "@/features/clients";
import { mergedTarget } from "@/features/clientDuplicates";
import { clientRowsFor, isClientSection, isClientTab } from "@/features/clientRows";
import { ClientSection } from "@/features/client/ClientSections";
import { ClientCardBody } from "@/features/client/ClientCard";
import { useI18n, type DictKey } from "@/i18n";
import { Button } from "@/ui/controls";
import { Empty, Screen } from "@/ui/surfaces";

/**
 * Client card (docs/specs/13-app-structure.md §3.3; prototype v6 approved by the founder 14.11, #1343). Header: name;
 * one line "CLT-0001 · status · tags"; Позвонить · Написать · Маршрут; «Создать смету»; money (office). Below — view tabs
 * (DS §9 А1п): Обзор · Сметы · Счета · Работы · Задачи · Заметки · Файлы · История, the number — what waits. An old link
 * `/client/<id>?s=<row>` still opens that row's own list.
 */
export default function ClientScreen() {
  const { id, s, tab } = useLocalSearchParams<{ id: string; s?: string; tab?: string }>();
  const { db, role } = useStore();
  const { t } = useI18n();
  const c = visibleClients(db, role).find((x) => x.id === id);
  const toCard = () => router.replace(`/client/${id}`);
  const back = () => (router.canGoBack() ? router.back() : s ? toCard() : router.replace("/clients"));
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
  const rows = clientRowsFor(role);
  // a row's own list: the same address with ?s=<row>
  if (isClientSection(s) && rows.includes(s))
    return (
      <Screen title={t(`client.row.${s}` as DictKey)} subtitle={c.name} back={back} fab={canServe(db, c.id) ? "client" : undefined} fabCtx={{ customerId: c.id }}>
        <ClientSection c={c} s={s} />
      </Screen>
    );
  const office = role !== "tech";
  return (
    <Screen
      title={c.name}
      back={back}
      // no yellow round «＋» on the client card (prototype v6, founder 14.11, #1343): «Создать смету» and «＋ Новая …» in the tabs
      right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} /> : undefined}
    >
      {/* the open tab is in the address: back from a document returns to it */}
      <ClientCardBody c={c} tab={isClientTab(tab) ? tab : undefined} onTab={(k) => router.setParams({ tab: k })} />
    </Screen>
  );
}
