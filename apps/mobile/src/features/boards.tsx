/** «Сметы» (a section of its own, spec 31 §7а): estimates as cards with the list filters. Invoices — /invoice. */
import { useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { space, type StatusName } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { DB, Estimate, EstimateStatus } from "@/data/types";
import { ESTIMATE_GROUPS, estimateGroup, inEstimateFilter, type EstimateFilter, type EstimateGroup } from "@/features/listGroups";
import { CardGrid, ListCardHeader } from "@/ui/listCard";
import { EST_COLUMNS, EST_COLUMNS_PANEL, EstimateListCard } from "@/features/listCards";
import { EstimateCardBody, estimateSubtitle } from "@/features/EstimateCard";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { SwipeRow } from "@/ui/swipeRow";
import { useDevice } from "@/theme/ThemeProvider";
import { T } from "@/ui/primitives";
import { useI18n, type DictKey } from "@/i18n";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { CardList, Empty } from "@/ui/surfaces";
import { estimateStatusView } from "@/features/estimateStatus";
import { canSeeEstimate } from "@/features/access";
import { estimateSigns } from "@/features/listSigns";
import { estimateListAmount } from "@/features/estimateDoc";
import { initialsOf } from "@/features/invoice/moneySummary";
import { router } from "expo-router";
import type { GroupRowProps } from "@/ui/groupedList";

/** status chip of an estimate — the one place for it (lists, client and property documents) */
export const estView: Record<EstimateStatus, { s: StatusName; l: DictKey; d?: true }> = {
  draft: estimateStatusView("draft"),
  sent: estimateStatusView("sent"),
  awaiting_countersign: estimateStatusView("awaiting_countersign"),
  approved: estimateStatusView("approved"),
  declined: estimateStatusView("declined"),
};

/** the lane of «Сметы» (spec 31 §7): the open ones first, then the closed, «Все» last */
const ESTIMATE_LANE: readonly EstimateFilter[] = ["open", "closed", "all"];
const LANE_LABEL: Record<EstimateFilter, DictKey> = { open: "board.open", closed: "card.f.closed", all: "cat.all" };

/** the search of «Сметы»: the client's name, the number, the title of the work, the address of the property */
export function matchEstimate(db: DB, e: Estimate, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const client = db.customers.find((c) => c.id === e.customerId);
  const prop = db.properties.find((p) => p.id === e.propertyId);
  return [client?.name, e.number, e.title, prop?.address, prop?.city].some((x) => (x ?? "").toLowerCase().includes(needle));
}

/** `wrap` — the screen around the board: on 1280 it gets the open estimate as its `aside` (spec 06 «Панель 1280») */
export function EstimatesBoard({ wrap }: { wrap: (body: ReactNode, aside?: ReactNode) => ReactElement }) {
  const { db, role, mode } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  // spec 31 §6 п.7: the status is kept on this device for this list; the search is not
  const [kept, setF] = usePersistentState<EstimateFilter>(`${filterStoreKey("estimates")}.status`, "open");
  const f: EstimateFilter = ESTIMATE_LANE.includes(kept) ? kept : "open";
  const [q, setQ] = useState("");
  const now = Date.now();
  // the tech: only estimates of his work (#868; estimates_select in the database)
  const all = db.estimates.filter((e) => canSeeEstimate(db, { role, mode, me: db.me }, e.id)).map((e) => ({ e, g: estimateGroup(e, now) }));
  const count = (x: EstimateFilter) => all.filter(({ g }) => inEstimateFilter(g, x)).length;
  const list = all
    .filter(({ g }) => inEstimateFilter(g, f))
    .filter(({ e }) => matchEstimate(db, e, q))
    .sort((a, b) => (b.e.sentAt ?? b.e.approvedAt ?? "").localeCompare(a.e.sentAt ?? a.e.approvedAt ?? ""));
  // the one estimate card (features/listCards.tsx), shared with the «Today» figures
  const groups = ESTIMATE_GROUPS.map((g) => [g, list.filter((x) => x.g === g)] as const).filter(([, xs]) => xs.length);
  // 1280: the open estimate beside the list, `/estimates?open=<id>`; the order of the rows on screen is the groups'
  // the tech: only his own opens in the panel by `?open=` too (director's review of #1134 Б3; as invoice/index.tsx)
  const mayOpen = (id: string) => canSeeEstimate(db, { role, mode, me: db.me }, id);
  const panel = useListPanel(groups.flatMap(([, xs]) => xs.map((x) => x.e.id)), (id) => `/estimate/${id}`, (id) => db.estimates.some((x) => x.id === id) && mayOpen(id));
  const openE = panel.openId && mayOpen(panel.openId) ? db.estimates.find((x) => x.id === panel.openId) : undefined;
  // #2350: a swipe right opens the estimate (phone / tablet). No swipe to the left: the store has no deleting or copying of an
  // estimate with «Отменить» (rule 5), so nothing irreversible is put under a finger
  const card = ({ e }: { e: Estimate; g: EstimateGroup }) => (
    <SwipeRow key={e.id} testID={`est-swipe-${e.id}`} left={device === "desktop" ? [] : [{ key: "open", label: t("swipe.open"), icon: "eye", full: true, onPress: () => panel.open(e.id) }]}>
      <EstimateListCard e={e} density={device === "desktop" ? "row" : "rich"} panel={{ selected: e.id === panel.openId, open: () => panel.open(e.id), narrow: !!panel.openId }} />
    </SwipeRow>
  );
  // #1412: as the estimate's screen — «⋯» in the panel's header row, the main button at the top of the card
  const aside = openE ? (
    <EstimateCardBody
      key={openE.id}
      e={openE}
      frame={({ more, main, body }) => (
        <ListPanel
          title={[openE.number, openE.title].filter(Boolean).join(" · ") || t("est.detail")}
          // as the estimate's screen: the client and the address under the title
          subtitle={estimateSubtitle(db, openE)}
          outside={panel.outside}
          more={more}
          onOpen={panel.full}
          onClose={panel.close}
        >
          {main}
          {body}
        </ListPanel>
      )}
    />
  ) : undefined;
  return wrap(
    <View style={{ gap: space[3] }}>
      {/* spec 31 (variant Б): the search (client, address, EST, work) and one lane of statuses; nothing in the sheet yet */}
      <FilterBar<EstimateFilter>
        search={{ value: q, onChange: setQ, placeholder: t("card.filter.searchEstimates") }}
        value={f}
        onChange={setF}
        items={ESTIMATE_LANE.map((k) => ({ key: k, label: t(LANE_LABEL[k]), count: count(k) }))}
      />
      {list.length === 0 ? (
        <Empty icon="invoice" title={t("board.noEstimates")} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={panel.openId ? EST_COLUMNS_PANEL : EST_COLUMNS} value={t("card.val.total")} /> : null}
          {groups.map(([g, xs]) => (
            <View key={g} style={{ gap: space[2] }}>
              <T v="caption" w="semibold" tone="mut">{`${t(`card.group.${g}`)} · ${xs.length}`}</T>
              {device === "tablet" ? <CardGrid>{xs.map(card)}</CardGrid> : <CardList>{xs.map(card)}</CardList>}
            </View>
          ))}
        </>
      )}
    </View>,
    aside,
  );
}

/** how many closed estimates «Готово» shows before «Все ›» (the list stays short: the open ones are the work) */
export const DONE_SHOWN = 5;

/**
 * «Деньги → Сметы» of prototype v2 (#2350, BUILD-SPEC §2.9, wireframes-v2 №8): the estimates the role may see, as the groups and
 * rows of the List template — «Нужно действие · Черновики · Ждём клиента · Готово» (an empty group is not drawn), each row the
 * client's initials, the name, «работа · что с ней» and the sum once. The search narrows every group; «Готово» shows the last
 * `DONE_SHOWN` until «Все ›». A swipe right opens the estimate (no swipe left: the store has no deleting with «Отменить», rule 5).
 */
export function useEstimateList(q: string, allDone: boolean, onAllDone: () => void) {
  const { db, role, mode } = useStore();
  const { t, money, day } = useI18n();
  const now = Date.now();
  const list = db.estimates
    .filter((e) => canSeeEstimate(db, { role, mode, me: db.me }, e.id))
    .filter((e) => matchEstimate(db, e, q))
    .map((e) => ({ e, g: estimateGroup(e, now) }))
    .sort((a, b) => (b.e.sentAt ?? b.e.approvedAt ?? "").localeCompare(a.e.sentAt ?? a.e.approvedAt ?? ""));
  const groups = ESTIMATE_GROUPS.map((g) => {
    const rows = list.filter((x) => x.g === g).map((x) => x.e);
    const cut = g === "done" && !allDone && !q.trim() && rows.length > DONE_SHOWN;
    return {
      key: g,
      title: `${t(`card.group.${g}` as DictKey)} · ${rows.length}`,
      rows: cut ? rows.slice(0, DONE_SHOWN) : rows,
      all: cut ? { label: t("proto.money.all"), onPress: onAllDone } : undefined,
    };
  });
  const row = (e: Estimate): GroupRowProps & { key: string } => {
    const c = db.customers.find((x) => x.id === e.customerId);
    const sign = estimateSigns(e, now)[0];
    const amount = estimateListAmount(e);
    // what is with it now, once: the sign («Без ответа 6 дн»), else the last event, else its status word
    // an estimate waiting for OUR signature says so first: it is in «Нужно действие» for that, not for how long it was silent
    const what = e.status === "awaiting_countersign"
      ? t(estView[e.status].l)
      : sign
      ? t(sign.key, sign.params)
      : e.approval
        ? `${t(estView[e.status].l)} ${day(e.approval.at)}`
        : e.viewedAt
          ? t("ue.viewed", { date: day(e.viewedAt) })
          : e.sentAt
            ? `${t("st.sent")} ${day(e.sentAt)}`
            : t(estView[e.status].l);
    return {
      key: e.id,
      testID: `est-row-${e.id}`,
      title: c?.name ?? "—",
      subtitle: [what, e.title].filter(Boolean).join(" · "),
      lead: { initials: initialsOf(c?.name) },
      value: amount.from ? t("card.fromAmount", { amount: money(amount.cents) }) : money(amount.cents),
      onPress: () => router.push(`/estimate/${e.id}`),
      swipe: { left: [{ key: "open", label: t("swipe.open"), icon: "eye", full: true, onPress: () => router.push(`/estimate/${e.id}`), testID: `est-swipe-${e.id}` }] },
    };
  };
  return { groups, row, count: list.length };
}
