import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeReports, collectedReport, owedReport, REPORTS, salesReport, sourcesReport, type ReportId } from "@/features/reports";
import type { IconKey } from "@/ui/primitives";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";
import { CardList, Empty, Screen } from "@/ui/surfaces";

const TITLE: Record<ReportId, DictKey> = { owed: "rpt.owed.title", collected: "rpt.collected.title", sales: "rpt.sales.title", sources: "rpt.sources.title" };
const ICON: Record<ReportId, IconKey> = { owed: "invoice", collected: "wallet", sales: "chart", sources: "megaphone" };

/** «Ещё» → Отчёты v1 (wave 8, 13 §3.15; S14): four reports, each a card with its headline number for this month. */
export default function Reports() {
  const { db, role } = useStore();
  const { t, moneyWhole } = useI18n();
  const { device } = useDevice();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  if (!canSeeReports(role))
    return (
      <Screen title={t("rpt.title")} back={back}>
        <Empty icon="chart" title={t("mny.noAccess")} />
      </Screen>
    );
  const owed = owedReport(db);
  const head: Record<ReportId, { value: string; label: string; note: string }> = {
    owed: { value: moneyWhole(owed.owesCents), label: t("mny.owedTotal"), note: t("rpt.owed.note", { n: owed.rows.length, overdue: moneyWhole(owed.overdueCents) }) },
    collected: (() => {
      const c = collectedReport(db, "month");
      return { value: moneyWhole(c.totalCents), label: t("mny.p.month"), note: t("rpt.collected.note", { n: c.count }) };
    })(),
    sales: (() => {
      const s = salesReport(db, "month");
      return { value: moneyWhole(s.signedCents), label: t("mny.p.month"), note: t("rpt.sales.note", { sent: s.sent, signed: s.signed, pct: s.signedPct }) };
    })(),
    sources: (() => {
      const s = sourcesReport(db, "month");
      return { value: moneyWhole(s.totalCents), label: t("mny.p.month"), note: t("rpt.sources.note", { n: s.rows.length }) };
    })(),
  };
  const card = (id: ReportId) => (
    <ListCard
      key={id}
      title={t(TITLE[id])}
      lead={{ kind: "icon", icon: ICON[id] }}
      value={head[id].value}
      valueLabel={head[id].label}
      facts={{ desc: head[id].note }}
      density="rich"
      onPress={() => router.push(`/reports/${id}`)}
    />
  );
  return (
    <Screen title={t("rpt.title")} back={back} help={t("rpt.help")} hintKey="reports">
      {device === "tablet" ? <CardGrid>{REPORTS.map(card)}</CardGrid> : <CardList>{REPORTS.map(card)}</CardList>}
    </Screen>
  );
}
