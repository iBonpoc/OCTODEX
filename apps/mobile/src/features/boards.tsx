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
import { EstimateCardBody } from "@/features/EstimateCard";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { useDevice } from "@/theme/ThemeProvider";
import { T } from "@/ui/primitives";
import { useI18n, type DictKey } from "@/i18n";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { CardList, Empty } from "@/ui/surfaces";

/** status chip of an estimate — the one place for it (lists, client and property documents) */
export const estView: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
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
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  // spec 31 §6 п.7: the status is kept on this device for this list; the search is not
  const [kept, setF] = usePersistentState<EstimateFilter>(`${filterStoreKey("estimates")}.status`, "open");
  const f: EstimateFilter = ESTIMATE_LANE.includes(kept) ? kept : "open";
  const [q, setQ] = useState("");
  const now = Date.now();
  const all = db.estimates.map((e) => ({ e, g: estimateGroup(e, now) }));
  const count = (x: EstimateFilter) => all.filter(({ g }) => inEstimateFilter(g, x)).length;
  const list = all
    .filter(({ g }) => inEstimateFilter(g, f))
    .filter(({ e }) => matchEstimate(db, e, q))
    .sort((a, b) => (b.e.sentAt ?? b.e.approvedAt ?? "").localeCompare(a.e.sentAt ?? a.e.approvedAt ?? ""));
  // the one estimate card (features/listCards.tsx), shared with the «Today» figures
  const groups = ESTIMATE_GROUPS.map((g) => [g, list.filter((x) => x.g === g)] as const).filter(([, xs]) => xs.length);
  // 1280: the open estimate beside the list, `/estimates?open=<id>`; the order of the rows on screen is the groups'
  const panel = useListPanel(groups.flatMap(([, xs]) => xs.map((x) => x.e.id)), (id) => `/estimate/${id}`, (id) => db.estimates.some((x) => x.id === id));
  const openE = panel.openId ? db.estimates.find((x) => x.id === panel.openId) : undefined;
  const card = ({ e }: { e: Estimate; g: EstimateGroup }) => (
    <EstimateListCard key={e.id} e={e} density={device === "desktop" ? "row" : "rich"} panel={{ selected: e.id === panel.openId, open: () => panel.open(e.id), narrow: !!panel.openId }} />
  );
  const aside = openE ? (
    <ListPanel title={[openE.number, openE.title].filter(Boolean).join(" · ") || t("est.detail")} onOpen={panel.full} onClose={panel.close}>
      <EstimateCardBody key={openE.id} e={openE} />
    </ListPanel>
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
