import { useState } from "react";
import { useI18n } from "@/i18n";
import { useStore } from "@/data/store";
import { canSeeEstimate } from "@/features/access";
import { EstimateCardBody, estimateSubtitle } from "@/features/EstimateCard";
import { useEstimateList } from "@/features/boards";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { MoneyTotal, useMoneyChips, useMoneyCreate } from "@/features/moneyTabs";
import { Empty } from "@/ui/surfaces";
import { ListScreen } from "@/ui/templates";

/**
 * «Деньги → Сметы» — the List template (prototype v2 #2350, LAYOUT-RULES §2–§3, BUILD-SPEC §2.9, wireframes-v2 №8).
 * The screen's one job: see which estimates wait for me or for the client, and open the one needed.
 * «Деньги» · search icon · «＋» (new estimate / from a template) → «Сметы · Счета · Оплаты» one strip → one line of its sums (MoneyTotal, #2993) →
 * grouped rows 56 (initials, name, «работа · что с ней», the sum once). No main button: making a new one is «＋».
 */
export default function Estimates() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [allDone, setAllDone] = useState(false);
  const chips = useMoneyChips("estimates");
  const { create, onCreate } = useMoneyCreate();
  const { groups, row } = useEstimateList(q, allDone, () => setAllDone(true));
  // 1280: the open estimate beside the list, `/estimates?open=<id>` (spec 06 «Панель 1280»); 390/820 — its own screen. The tech: only his own
  const { db, role, mode } = useStore();
  const mayOpen = (id: string) => canSeeEstimate(db, { role, mode, me: db.me }, id);
  const panel = useListPanel(groups.flatMap((g) => g.rows.map((e) => e.id)), (id) => `/estimate/${id}`, (id) => db.estimates.some((x) => x.id === id) && mayOpen(id));
  const openE = panel.openId && mayOpen(panel.openId) ? db.estimates.find((x) => x.id === panel.openId) : undefined;
  // #1412: as the estimate's screen — «⋯» in the panel's header row, the main button at the top of the card
  const aside = openE ? (
    <EstimateCardBody
      key={openE.id}
      e={openE}
      frame={({ more, main, body }) => (
        <ListPanel title={[openE.number, openE.title].filter(Boolean).join(" · ") || t("est.detail")} subtitle={estimateSubtitle(db, openE)} outside={panel.outside} more={more} onOpen={panel.full} onClose={panel.close}>
          {main}
          {body}
        </ListPanel>
      )}
    />
  ) : undefined;
  return (
    <ListScreen
      testID="est-list"
      title={t("nav.money")}
      // #3018 (founder #3017): each estimate its own card
      separate
      search={{ placeholder: t("card.filter.searchEstimates"), value: q, onChange: setQ }}
      chips={chips}
      chipsAs="segment"
      filters={<MoneyTotal tab="estimates" />}
      create={create}
      onCreate={onCreate}
      groups={groups}
      aside={aside}
      // #2992 (lists B): the sum alone on the right — no «Сумма» word over it in every row (DS §5.5: the words of the columns stand once)
      row={(e) => ({ ...row(e), onPress: () => panel.open(e.id), selected: e.id === panel.openId })}
      empty={<Empty icon="invoice" title={t("board.noEstimates")} />}
    />
  );
}
