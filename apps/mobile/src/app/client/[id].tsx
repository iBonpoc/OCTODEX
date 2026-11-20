import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { visibleClients } from "@/features/clients";
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
import { showsTabBar } from "@/nav/tabBarRule";

/**
 * Client card — one page (redesign 20.11.2026, docs/design/2026-11-20-direction/06-decision.md; body — features/client/ClientCard):
 * the name, the address, «Позвонить · SMS · Маршрут»; «Сейчас»; «История»; notes; photos; «О клиенте»; one main button «the next
 * step» pinned at the bottom of a phone. A row's own list is `/client/<id>?s=<row>`; an old `?tab=<tab>` link opens the same list.
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
  // an old link to a view tab (`?tab=estimates`) opens that list: the card is one page now, its lists are `?s=<row>`
  if (isClientTab(tab) && tab !== "overview" && isClientSection(tab) && rows.includes(tab))
    return (
      <Screen title={t(`client.row.${tab}` as DictKey)} subtitle={c.name} back={back}>
        <ClientSection c={c} s={tab} />
      </Screen>
    );
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
  const pinBar = !showsTabBar("client/[id]");
  // one page (redesign 20.11.2026, 06-decision.md п.3): the next step pinned at the bottom of a phone, in the page from 820
  return (
    <ClientCardBody
      c={c}
      frame={({ summary, content, rest, next, bar }) =>
        device === "desktop" ? (
          // desktop (DS §12.3, #1416): the page on the left, the summary and the next step in a side column 360 on the right
          <Screen title={c.name} help={t("cw4.cardHelp")} back={back} right={edit}>
            {/* the summary first for a screen reader and the Tab key (DS §12.3), on the right to the eye */}
            <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: space[6] }}>
              <View testID="client-side" style={{ width: component.panelW, gap: space[3] }}>
                {summary}
                {next}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>{content}</View>
            </View>
            {rest}
          </Screen>
        ) : (
          // the pinned bar stands only where the phone has no tab bar under it (Screen `footer`); while «Клиенты» keeps its tab bar on
          // the card (nav/tabBarRule), the next step stands in the page right under the quick actions
          <Screen title={c.name} help={t("cw4.cardHelp")} back={back} right={edit} footer={pinBar ? bar : undefined}>
            <View style={{ gap: space[3] }}>
              {summary}
              {pinBar && device === "phone" ? null : next}
              {content}
            </View>
            {rest}
          </Screen>
        )
      }
    />
  );
}
