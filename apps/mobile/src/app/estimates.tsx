import { useState } from "react";
import { useI18n } from "@/i18n";
import { useEstimateList } from "@/features/boards";
import { MoneyTiles, useMoneyChips, useMoneyCreate } from "@/features/moneyTabs";
import { Empty } from "@/ui/surfaces";
import { ListScreen } from "@/ui/templates";

/**
 * «Деньги → Сметы» — the List template (prototype v2 #2350, LAYOUT-RULES §2–§3, BUILD-SPEC §2.9, wireframes-v2 №8).
 * The screen's one job: see which estimates wait for me or for the client, and open the one needed.
 * «Деньги» · search icon · «＋» (new estimate / from a template) → «Сметы · Счета · Оплаты» one strip → the money tiles 2×2 →
 * grouped rows 56 (initials, name, «работа · что с ней», the sum once). No main button: making a new one is «＋».
 */
export default function Estimates() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [allDone, setAllDone] = useState(false);
  const chips = useMoneyChips("estimates");
  const { create, onCreate } = useMoneyCreate();
  const { groups, row } = useEstimateList(q, allDone, () => setAllDone(true));
  return (
    <ListScreen
      testID="est-list"
      title={t("nav.money")}
      search={{ placeholder: t("card.filter.searchEstimates"), value: q, onChange: setQ }}
      chips={chips}
      filters={<MoneyTiles />}
      create={create}
      onCreate={onCreate}
      groups={groups}
      row={row}
      empty={<Empty icon="invoice" title={t("board.noEstimates")} />}
    />
  );
}
