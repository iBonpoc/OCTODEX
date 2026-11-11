/**
 * «Замеры» — the module's home (spec 33 П25.3 А, PR-H1; before П20.22, founder 09.11 версия 475; founder 11.11:
 * «открываешь модуль — там кнопка „Новый замер“, внутри — карточки замеров»): every measurement the phone has, the
 * drafts without a client too, newest first. The search (client, lead, address, phone) and the chips by the computed
 * state (П25.4) — the chip is kept on this device. One ListCard per measurement (rule 12; recipe `measurement`, spec 06).
 * A card opens the measurement's card («Просмотр замера», `view`); 1280 — beside the list in the ListPanel.
 */
import { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { usePersistentState } from "@/data/persist";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { estimateStatusView } from "@/features/estimateStatus";
import { moduleHref } from "@/modules/registry";
import { useListPanel } from "@/nav/listPanel";
import { useDevice } from "@/theme/ThemeProvider";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { CardGrid, ListCard, ListCardHeader, type CardSign, type CardStatus } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { ListPanel } from "@/ui/listPanel";
import { Card, CardList, Empty, Screen } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { asMeasurementFilter, filterMeasurements, MEASUREMENT_FILTERS, measurementList, type MeasurementFilter, type MeasurementItem } from "../measurements";
import { MeasurementView } from "../view/ViewScreen";

const CHIP: Record<MeasurementFilter, DictKey> = {
  all: "mod.gutters.list.f.all",
  drafts: "mod.gutters.list.f.drafts",
  noEstimate: "mod.gutters.list.f.noEstimate",
  estimate: "mod.gutters.list.f.estimate",
  signed: "mod.gutters.list.f.signed",
};
const COLUMNS: readonly FactKey[] = ["addr", "lines"];
const COLUMNS_PANEL: readonly FactKey[] = ["addr"];

export default function MeasurementsScreen() {
  const store = useStore();
  const { t, day } = useI18n();
  const { device } = useDevice();
  const draw = moduleHref("gutters", "draw");
  const view = moduleHref("gutters", "view");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const [kept, setKept] = usePersistentState<MeasurementFilter>(`${filterStoreKey("gutters.measurements")}.status`, "all");
  const f = asMeasurementFilter(kept);
  const [q, setQ] = useState("");
  const items = measurementList(store.db);
  const { shown, counts } = filterMeasurements(items, f, q);
  const panel = useListPanel(
    shown.map((x) => x.id),
    (id) => `${view}?m=${encodeURIComponent(id)}`,
    (id) => items.some((x) => x.id === id),
  );
  const openItem = panel.openId ? items.find((x) => x.id === panel.openId) : undefined;
  const titleOf = (m: MeasurementItem) => (m.forKind === "lead" ? t("mod.gutters.list.lead", { name: m.forName ?? "" }) : (m.forName ?? t("mod.gutters.list.noClient")));

  /** П25.4: the state's chip; an estimate's — the core's own words and tone of its status */
  const statusOf = (m: MeasurementItem): CardStatus => {
    const v = m.view;
    if (v.state === "signed") return { tone: "ok", label: t("mod.gutters.list.s.signed") };
    if (v.state === "estimate" && v.estimate) {
      const s = estimateStatusView(v.estimate.status);
      return { tone: s.s, label: t(s.l) };
    }
    return { tone: "neutral", label: t(v.state === "unlinked" ? "mod.gutters.list.draft" : "mod.gutters.list.s.noEstimate") };
  };
  const signsOf = (m: MeasurementItem): CardSign[] | undefined =>
    m.view.changed ? [{ tone: "warn", label: t(m.view.state === "signed" ? "mod.gutters.list.s.changedSigned" : "mod.gutters.list.s.changed") }] : undefined;

  const desktop = device === "desktop";
  const card = (m: MeasurementItem) => (
    <ListCard
      key={m.id}
      testID={`measurement-${m.id}`}
      title={titleOf(m)}
      when={m.updatedAt ? day(m.updatedAt) : undefined}
      lead={{ kind: "icon", icon: "pencil" }}
      status={statusOf(m)}
      signs={signsOf(m)}
      facts={{
        addr: m.address ?? undefined,
        lines: t("mod.gutters.list.what", { runs: m.runs, ft: Math.round(m.lengthIn / 12), ds: m.downspouts }),
      }}
      // edge only for what needs action: the drawing changed after its estimate
      edge={m.view.changed ? "warn" : null}
      density={desktop ? "row" : "rich"}
      columns={panel.openId ? COLUMNS_PANEL : COLUMNS}
      selected={m.id === panel.openId}
      onPress={() => panel.open(m.id)}
    />
  );
  const pick = (x: MeasurementFilter) => setKept(x);

  return (
    <Screen
      title={t("mod.gutters.list.title")}
      subtitle={t("mod.gutters.title")}
      back={back}
      right={<Button label={t("mod.gutters.list.new")} icon="plus" size="sm" onPress={() => router.push(draw as Href)} />}
      aside={
        openItem ? (
          <ListPanel title={titleOf(openItem)} subtitle={openItem.address ?? undefined} outside={panel.outside} onOpen={panel.full} onClose={panel.close}>
            <MeasurementView key={openItem.id} mid={openItem.id} onGone={panel.close} panel />
          </ListPanel>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <Card>
          <T tone="mut">{t("mod.gutters.list.empty")}</T>
        </Card>
      ) : (
        <>
          <FilterBar<MeasurementFilter>
            search={{ value: q, onChange: setQ, placeholder: t("mod.gutters.list.search") }}
            value={f}
            onChange={pick}
            items={MEASUREMENT_FILTERS.map((k) => ({ key: k, label: t(CHIP[k]), count: counts[k] }))}
          />
          {shown.length === 0 ? (
            <Empty icon="note" title={t("mod.gutters.list.emptyFilter")} action={f !== "all" ? <View testID="measurements-show-all"><Button label={t("mod.gutters.list.showAll")} variant="secondary" onPress={() => pick("all")} /></View> : undefined} />
          ) : desktop ? (
            <>
              <ListCardHeader title={t("mod.gutters.list.colWho")} columns={panel.openId ? COLUMNS_PANEL : COLUMNS} />
              <CardList>{shown.map(card)}</CardList>
            </>
          ) : device === "tablet" ? (
            <CardGrid>{shown.map(card)}</CardGrid>
          ) : (
            <CardList>{shown.map(card)}</CardList>
          )}
        </>
      )}
    </Screen>
  );
}
