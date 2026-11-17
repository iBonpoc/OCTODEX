import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { canServe, visibleClients } from "@/features/clients";
import { mergedTarget } from "@/features/clientDuplicates";
import { clientRecords, clientRowsFor, isClientSection, isClientTab } from "@/features/clientRows";
import { AddObject } from "@/features/client/AddObject";
import { ClientSection } from "@/features/client/ClientSections";
import { ClientCardBody } from "@/features/client/ClientCard";
import { useI18n, type DictKey } from "@/i18n";
import { Button, IconButton } from "@/ui/controls";
import { Menu } from "@/ui/overlays";
import { useRef, useState } from "react";
import { Empty, Screen } from "@/ui/surfaces";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useDevice } from "@/theme/ThemeProvider";

/**
 * Client card (docs/specs/13-app-structure.md §3.3; prototype v6 approved by the founder 14.11, #1343). Header: name;
 * one line "CLT-0001 · status · tags"; Позвонить · Написать · Маршрут; «Создать смету»; money (office). Below — view tabs
 * (DS §9 А1п): Обзор · Сметы · Счета · Работы · Задачи · Заметки · Файлы · История, the number — what waits. An old link
 * `/client/<id>?s=<row>` still opens that row's own list.
 */
export default function ClientScreen() {
  const { id, s, tab } = useLocalSearchParams<{ id: string; s?: string; tab?: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const { device } = useDevice();
  const moreRef = useRef<React.ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
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
  // from 820 the list's «＋ …» button stands in the header on the right, not over the grid (DS §12.2, #1664); an empty list keeps its own
  const listAdd =
    device !== "phone" && (s === "jobs" || s === "estimates") && clientRecords(db, c, role, mode)[s].length ? (
      <AddObject kind={s === "jobs" ? "job" : "estimate"} customerId={c.id} testID={`client-section-new-${s === "jobs" ? "job" : "estimate"}`} />
    ) : undefined;
  // a row's own list: the same address with ?s=<row>
  if (isClientSection(s) && rows.includes(s))
    return (
      <Screen title={t(`client.row.${s}` as DictKey)} subtitle={c.name} back={back} right={listAdd}>
        <ClientSection c={c} s={s} />
      </Screen>
    );
  const office = role !== "tech";
  // the open tab is in the address: back from a document returns to it
  const onTab = (k: string) => router.setParams({ tab: k });
  // «⋯» on the right of the header, «Изменить» its first item (spec 56 §3а.6, DS §12.2): the card has no worded «✎ Изменить» any more
  const edit = office ? (
    <View ref={moreRef} collapsable={false} testID="client-more">
      <IconButton icon="more" label={`${t("lead.more")}: ${c.name}`} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))} />
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={t("lead.more")}
        items={[{ key: "edit", label: t("ue.edit"), icon: "pencil", testID: "client-act-edit" }]}
        onClose={() => setMoreAt(null)}
        onSelect={(k) => k === "edit" && router.push(`/client/edit?id=${c.id}`)}
      />
    </View>
  ) : undefined;
  // no yellow round «＋» on the client card (prototype v6, founder 14.11, #1343): «Создать смету» and «＋ Новая …» in the tabs
  return (
    <ClientCardBody
      c={c}
      tab={isClientTab(tab) ? tab : undefined}
      onTab={onTab}
      frame={({ summary, tabs, content, rest, mini }) =>
        device === "desktop" ? (
          // desktop (DS §12.3, #1416): the tabs and their content on the left, the summary in a side column 360 on the right
          <Screen title={c.name} help={t("cw4.cardHelp")} back={back} right={edit}>
            {/* the summary first for a screen reader and the Tab key (DS §12.3: header, summary, then the tabs), on the right to the eye */}
            <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: space[6] }}>
              <View testID="client-side" style={{ width: component.panelW, gap: space[3] }}>
                {summary}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
                {tabs}
                {content}
              </View>
            </View>
            {rest}
          </Screen>
        ) : (
          // phone, tablet: the tabs stick under a mini header (name · call · write · route) while the page scrolls (DS §9 А1п)
          <Screen title={c.name} help={t("cw4.cardHelp")} back={back} right={edit} tabs={tabs} tabKey={isClientTab(tab) ? tab : undefined} tabsMini={mini} below={<>{content}{rest}</>}>
            {summary}
          </Screen>
        )
      }
    />
  );
}
