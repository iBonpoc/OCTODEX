/**
 * «Замеры» (founder 09.11, версия 475; spec 33 П20.22): all the company's measurements the phone has — the drafts
 * without a client too, newest first; a card opens its canvas. From «Главная» next to «Замерить здесь» and from the
 * module's card. One ListCard per measurement (rule 12).
 */
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleHref } from "@/modules/registry";
import { useDevice } from "@/theme/ThemeProvider";
import { Button } from "@/ui/controls";
import { CardGrid, ListCard } from "@/ui/listCard";
import { T } from "@/ui/primitives";
import { Card, CardList, Screen } from "@/ui/surfaces";
import { measurementList } from "../measurements";

export default function MeasurementsScreen() {
  const store = useStore();
  const { t, day } = useI18n();
  const { device } = useDevice();
  const draw = moduleHref("gutters", "draw");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const items = measurementList(store.db);
  const cards = items.map((m) => (
    <ListCard
      key={m.id}
      testID={`measurement-${m.id}`}
      title={m.forName ?? t("mod.gutters.list.noClient")}
      when={m.updatedAt ? day(m.updatedAt) : undefined}
      lead={{ kind: "icon", icon: "pencil" }}
      status={m.status === "ready" ? { tone: "ok", label: t("mod.gutters.list.ready") } : { tone: "neutral", label: t("mod.gutters.list.draft") }}
      facts={{
        addr: m.forName !== m.address ? m.address : undefined,
        lines: t("mod.gutters.list.what", { runs: m.runs, ft: Math.round(m.lengthIn / 12), ds: m.downspouts }),
      }}
      edge={null}
      onPress={() => router.push(`${draw}?m=${encodeURIComponent(m.id)}`)}
    />
  ));
  return (
    <Screen
      title={t("mod.gutters.list.title")}
      subtitle={t("mod.gutters.title")}
      back={back}
      right={<Button label={t("mod.gutters.list.new")} icon="plus" size="sm" onPress={() => router.push(draw)} />}
    >
      {items.length === 0 ? (
        <Card>
          <T tone="mut">{t("mod.gutters.list.empty")}</T>
        </Card>
      ) : device === "phone" ? (
        <CardList>{cards}</CardList>
      ) : (
        <CardGrid>{cards}</CardGrid>
      )}
    </Screen>
  );
}
