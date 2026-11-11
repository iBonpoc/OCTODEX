/**
 * «Замер желобов» from a client's card (spec 33 П24 А3, #697): a measurement is always an address's. One address →
 * straight to its measurement (the newest one's card, else a new one on the canvas); several → pick the address (a card each, rule 12); none →
 * the client's card is where an address is added.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleHref } from "@/modules/registry";
import { Button } from "@/ui/controls";
import { CardGrid, ListCard } from "@/ui/listCard";
import { T } from "@/ui/primitives";
import { Card, Screen } from "@/ui/surfaces";
import { clientStart } from "../data";

export default function StartScreen() {
  const { db } = useStore();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ customer?: string }>();
  const customerId = typeof params.customer === "string" ? params.customer : "";
  const c = db.customers.find((x) => x.id === customerId);
  const to = clientStart({ draw: moduleHref("gutters", "draw"), view: moduleHref("gutters", "view") }, db, customerId);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // one address: no question — straight on (replace: «назад» from the canvas comes back to the client)
  useEffect(() => {
    if (to.kind === "go") router.replace(to.href as Href);
  }, [to.kind, to.kind === "go" ? to.href : ""]);
  return (
    <Screen title={t("mod.gutters.measure")} subtitle={c?.name} back={back}>
      {to.kind === "pick" ? (
        <>
          <T v="body" tone="mut">{t("mod.gutters.start.pick")}</T>
          <CardGrid>
            {to.places.map((p) => (
              <ListCard key={p.id} testID={`start-place-${p.id}`} title={p.address} facts={{ addr: p.city }} lead={{ kind: "icon", icon: "pin" }} edge={null} onPress={() => router.replace(p.href as Href)} />
            ))}
          </CardGrid>
        </>
      ) : to.kind === "none" ? (
        <Card style={{ gap: space[3] }}>
          <View testID="start-no-place"><T>{t("mod.gutters.start.noPlace")}</T></View>
          <Button label={t("mod.gutters.start.toClient")} variant="secondary" onPress={() => (c ? router.replace(`/client/${c.id}` as Href) : back())} />
        </Card>
      ) : null}
    </Screen>
  );
}
