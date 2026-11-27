import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeReports, categoryReport, collectedReport, NO_CATEGORY, owedReport, REPORTS, salesReport, sourcesReport, type ReportId, REPORT_TITLE } from "@/features/reports";
import type { IconKey } from "@/ui/primitives";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { Empty, Screen } from "@/ui/surfaces";

const TITLE = REPORT_TITLE;
const ICON: Record<ReportId, IconKey> = { owed: "invoice", collected: "wallet", sales: "chart", sources: "megaphone", categories: "toolbox" };

/** «Ещё» → Отчёты v1 (wave 8, 13 §3.15; S14; «По направлениям» — step 12б, 18 §11): five reports, each a row with its headline number for this month. */
export default function Reports() {
  const { db, role } = useStore();
  const { t, tn, moneyWhole } = useI18n();
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
    categories: (() => {
      const c = categoryReport(db, "month");
      // «Направлений: 0» next to $4,162 read as a contradiction: no directions set says so in words (#1427 045)
      const dirs = c.rows.filter((x) => x.key !== NO_CATEGORY).length;
      return { value: moneyWhole(c.total.revenueCents), label: t("mny.p.month"), note: dirs ? tn("rpt.cat.dirs", dirs) : t("rpt.cat.noDirs") };
    })(),
  };
  // lists B (#2992): a report is a row of one group (rule 12) — its icon · the name, «из чего число · за какой срок» · the figure
  const row = (id: ReportId) => (
    <GroupRow
      key={id}
      testID={`rpt-row-${id}`}
      title={t(TITLE[id])}
      subtitle={head[id].note}
      lead={{ icon: ICON[id] }}
      value={head[id].value}
      valueTop
      chevron
      // a sum in the line («просрочено $1,840.00») and a long name are never cut (Д-строка-2, rule 31)
      wrap
      onPress={() => router.push(`/reports/${id}`)}
    />
  );
  return (
    // «за этот месяц» once, under the title — not «Месяц ·» in four rows of five (layout review 27.11, Д-строка-5)
    <Screen title={t("rpt.title")} subtitle={t("rpt.monthLine")} back={back} help={t("rpt.help")} hintKey="reports">
      <GroupedList testID="rpt-list">
        {/* founder #3018: «каждой строке свою» — каталог и отчёты тоже */}
        <ListGroup separate>{REPORTS.map(row)}</ListGroup>
      </GroupedList>
    </Screen>
  );
}
