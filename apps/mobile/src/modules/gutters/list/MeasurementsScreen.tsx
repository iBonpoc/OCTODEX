/**
 * «Замеры» — the module's home (spec 33 П25.3 А, PR-H1; before П20.22, founder 09.11 версия 475; founder 11.11:
 * «открываешь модуль — там кнопка „Новый замер“, внутри — карточки замеров»): every measurement the phone has, the
 * drafts without a client too, newest first. The search (client, lead, address, phone) and the chips by the computed
 * state (П25.4) — the chip is kept on this device. One row per measurement (rule 12; lists B #2992).
 * A card opens the measurement's card («Просмотр замера», `view`); 1280 — beside the list in the ListPanel.
 */
import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { usePersistentState } from "@/data/persist";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { estimateStatusView } from "@/features/estimateStatus";
import { moduleDef, moduleHref, moduleState, moduleTabs } from "@/modules/registry";
import { Banner } from "@/ui/banner";
import { useListPanel } from "@/nav/listPanel";
import { useDevice } from "@/theme/ThemeProvider";
import { Button, IconButton } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import type { CardSign, CardStatus } from "@/ui/listCard";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { estimateListAmount } from "@/features/estimateDoc";
import { ListPanel } from "@/ui/listPanel";
import { Empty, RowView, Screen } from "@/ui/surfaces";
import { Menu } from "@/ui/overlays";
import { asMeasurementFilter, filterMeasurements, MEASUREMENT_FILTERS, measurementList, type MeasurementFilter, type MeasurementItem } from "../measurements";
import { MeasurementView } from "../view/ViewScreen";

const CHIP: Record<MeasurementFilter, DictKey> = {
  all: "mod.gutters.list.f.all",
  drafts: "mod.gutters.list.f.drafts",
  noEstimate: "mod.gutters.list.f.noEstimate",
  estimate: "mod.gutters.list.f.estimate",
  signed: "mod.gutters.list.f.signed",
};

export default function MeasurementsScreen() {
  const store = useStore();
  const { t, day, money } = useI18n();
  const { device } = useDevice();
  const draw = moduleHref("gutters", "draw");
  const view = moduleHref("gutters", "view");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // «Замеры» is a tab of the app for this person (the bottom bar, the side menu): a tab is a root — no «‹ Назад» over it, as the
  // core's tab lists (#1426, design review); opened where it is not a tab (the role has no such tab) it keeps its «back»
  const asTab = moduleTabs(store.db.company, store.role).some((m) => m.href === moduleHref("gutters", "list"));
  // the trial is over (founder 18.11: the tab stays, never «План» in its place silently): the screen says so and why —
  // drafts open, nothing is saved; the director gets the way to «Компания → Модули»
  const expired = moduleState(store.db.company?.modules?.gutters).access === "expired";
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
      return { tone: s.s, label: t(s.l), draft: s.d };
    }
    return { tone: "neutral", label: t(v.state === "unlinked" ? "mod.gutters.list.draft" : "mod.gutters.list.s.noEstimate"), draft: v.state === "unlinked" };
  };
  const signsOf = (m: MeasurementItem): CardSign[] | undefined => {
    const out: CardSign[] = [];
    if (m.view.changed) out.push({ tone: "warn", label: t(m.view.state === "signed" ? "mod.gutters.list.s.changedSigned" : "mod.gutters.list.s.changed") });
    // #1165: the engine's rule changed after the estimate was made (a signed one is only told)
    if (m.view.engineChanged) out.push({ tone: "warn", label: t(m.view.state === "signed" ? "mod.gutters.list.s.engineSigned" : "mod.gutters.list.s.engine") });
    return out.length ? out : undefined;
  };

  /**
   * Lists B (#2992, founder 27.11): a measurement is a row of one group (rule 12) — the measure's icon · who it is for, «адрес ·
   * пробеги · футы · водостоки» · on the right the estimate's sum (the office) or the day it was touched, under it the state; a
   * drawing changed after its estimate says so first (warn, icon + word), as the old card's sign did.
   */
  const office = store.role !== "tech";
  const row = (m: MeasurementItem) => {
    const sign = signsOf(m)?.[0];
    const st = statusOf(m);
    const sum = office && m.view.estimate ? estimateListAmount(m.view.estimate) : undefined;
    return (
      <GroupRow
        key={m.id}
        testID={`measurement-${m.id}`}
        title={titleOf(m)}
        // #3018 (founder #3017): 2 — the address; 3 — what is drawn (the module's own words)
        subtitle={m.address ?? undefined}
        extra={t("mod.gutters.list.what", { runs: m.runs, ft: Math.round(m.lengthIn / 12), ds: m.downspouts })}
        lead={{ icon: "pencil" }}
        value={sum ? money(sum.cents) : m.updatedAt ? day(m.updatedAt) : undefined}
        valueMark={!sum}
        status={sign ? { status: sign.tone, label: sign.label } : { status: st.tone, label: st.label, draft: st.draft }}
        selected={m.id === panel.openId}
        onPress={() => panel.open(m.id)}
      />
    );
  };
  const pick = (x: MeasurementFilter) => setKept(x);
  const startNew = () => router.push(draw as Href);
  // «＋» in the header is secondary (DS §12.2, #1426): an icon of 36 on the phone, the word from 820; yellow is only the
  // screen's main action — on an empty list that is the empty state's own «Новый замер»
  const add = (
    <View testID="measurements-new">
      {device === "phone" ? (
        <IconButton icon="plus" label={t("mod.gutters.list.new")} onPress={startNew} />
      ) : (
        <Button label={t("mod.gutters.list.new")} icon="plus" size="sm" variant="secondary" onPress={startNew} />
      )}
    </View>
  );

  // #1919 (founder 16.11: «настройки спрятаны очень далеко… открываешь Gutters, там сверху»): the module's settings and prices from
  // its own tab — «⋯» last in the header (DS §12.2 «прочие действия»), the same places and roles as «Компания → Модули» (one truth:
  // places.settings); nothing for this role (a tech) — no «⋯»
  const links = (moduleDef("gutters")?.places?.settings?.({ role: store.role }, store.db.moduleData?.gutters) ?? []).filter((a) => a.id === "settings" || a.id === "prices");
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const more = links.length ? (
    <View ref={moreRef} collapsable={false} testID="measurements-more">
      <IconButton
        icon="more"
        label={`${t("lead.more")}: ${t("mod.gutters.list.title")}`}
        onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))}
      />
    </View>
  ) : null;

  return (
    <Screen
      title={t("mod.gutters.list.title")}
      subtitle={t("mod.gutters.title")}
      back={asTab ? undefined : back}
      // DS §12.2: «?» first on the right of the header
      help={t("mod.gutters.list.help")}
      right={
        more ? (
          <RowView>
            {add}
            {more}
          </RowView>
        ) : (
          add
        )
      }
      aside={
        openItem ? (
          <ListPanel title={titleOf(openItem)} subtitle={openItem.address ?? undefined} outside={panel.outside} onOpen={panel.full} onClose={panel.close}>
            <MeasurementView key={openItem.id} mid={openItem.id} onGone={panel.close} panel />
          </ListPanel>
        ) : undefined
      }
    >
      {expired ? (
        <Banner
          tone="warn"
          testID="measurements-expired"
          title={t("mod.st.expired")}
          hint={t("mod.lockedHint")}
          action={store.role === "director" ? { label: t("mod.gutters.draw.connect"), onPress: () => router.push("/company/modules") } : undefined}
        />
      ) : null}
      {items.length === 0 ? (
        // DS §13 «Пусто — данных нет вообще»: the object's icon, the words, why, and the one button to start
        <Empty
          icon="note"
          testID="measurements-empty"
          title={t("mod.gutters.list.empty")}
          hint={t("mod.gutters.list.emptyHint")}
          action={
            <View testID="measurements-empty-new">
              <Button label={t("mod.gutters.list.new")} icon="plus" variant="primary" onPress={startNew} />
            </View>
          }
        />
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
          ) : (
            <GroupedList testID="measurements-list">
              <ListGroup separate>{shown.map(row)}</ListGroup>
            </GroupedList>
          )}
        </>
      )}
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={t("mod.gutters.list.title")}
        items={links.map((a) => ({ key: a.id, label: t(a.labelKey), icon: a.icon }))}
        onSelect={(k) => {
          setMoreAt(null);
          const a = links.find((x) => x.id === k);
          if (a) router.push(a.href as Href);
        }}
        onClose={() => setMoreAt(null)}
      />
    </Screen>
  );
}
