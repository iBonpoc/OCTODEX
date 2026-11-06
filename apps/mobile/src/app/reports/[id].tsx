import { router, useLocalSearchParams } from "expo-router";
import { AGING_BUCKETS, type AgingBucket, type CentsTotal } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { asPaymentPeriod, PAYMENT_PERIODS, type PaymentPeriod } from "@/features/moneyLists";
import { asReport, canExportCsv, canSeeReports, collectedReport, csvMoney, owedReport, REPEAT, salesReport, sourcesReport, toCsv, UNKNOWN, type ReportId } from "@/features/reports";
import { shareCsv } from "@/features/csvShare";
import { useDevice } from "@/theme/ThemeProvider";
import { Button, Segmented } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { CardGrid, ListCard } from "@/ui/listCard";
import { Card, CardList, Divider, Empty, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { memberName } from "@/features/team";

const TITLE: Record<ReportId, DictKey> = { owed: "rpt.owed.title", collected: "rpt.collected.title", sales: "rpt.sales.title", sources: "rpt.sources.title" };
const PERIOD: Record<PaymentPeriod, DictKey> = { today: "mny.p.today", week: "mny.p.week", month: "mny.p.month", all: "mny.p.all" };
const AGE: Record<AgingBucket, DictKey> = { current: "rpt.age.current", d1_30: "rpt.age.d1_30", d31_60: "rpt.age.d31_60", d61_90: "rpt.age.d61_90", d90p: "rpt.age.d90p" };

/** One report of «Отчёты v1» (S14). Every number is the engine's; CSV — the owner only. */
export default function Report() {
  const { id, p: pParam } = useLocalSearchParams<{ id: string; p?: string }>();
  const { db, role } = useStore();
  const { t, money, moneyWhole } = useI18n();
  const { device } = useDevice();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/reports"));
  const r = asReport(id);
  if (!r || !canSeeReports(role))
    return (
      <Screen title={t("rpt.title")} back={back}>
        <Empty icon="chart" title={t(r ? "mny.noAccess" : "rpt.none")} />
      </Screen>
    );
  const p = asPaymentPeriod(pParam);
  const custName = (cid: string) => db.customers.find((c) => c.id === cid)?.name ?? "—";
  const personName = (k: string) => (k === UNKNOWN ? t("rpt.unknownPerson") : (memberName(db, k, t) ?? "—"));
  const sourceName = (k: string) => (k === REPEAT ? t("rpt.repeat") : (db.sources.find((s) => s.id === k)?.name ?? "—"));
  const method = (k: string) => t(`pay.${k}` as DictKey);
  const csvBtn = (rows: (string | number)[][], header: string[]) =>
    canExportCsv(db, role) ? (
      <Button label={t("rpt.csv")} icon="doc" size="sm" variant="secondary" onPress={() => shareCsv(`${r}-${p}.csv`, toCsv(header, rows)).catch(() => {})} />
    ) : undefined;
  const periods = r === "owed" ? null : (
    <Segmented<PaymentPeriod> scroll value={p} onChange={(x) => router.setParams({ p: x })} items={PAYMENT_PERIODS.map((k) => ({ key: k, label: t(PERIOD[k]) }))} />
  );
  const total = (label: string, cents: number, note?: string) => (
    <Card>
      <T v="caption" tone="mut">{label}</T>
      <T v="display" tabular>{money(cents)}</T>
      {note ? <T v="caption" tone="mut">{note}</T> : null}
    </Card>
  );
  /** rows of one breakdown: a detail of the one report (rule 12: lines inside one card) */
  const breakdown = (title: string, rows: CentsTotal<string>[], name: (k: string) => string, whole: number) => (
    <Card>
      <SectionTitle title={title} />
      {rows.map((x, n) => (
        <ListRow key={x.key} title={name(x.key)} subtitle={t("rpt.share", { n: x.count, pct: whole > 0 ? Math.floor((x.cents * 200 + whole) / (2 * whole)) : 0 })} right={<T v="body" tabular>{money(x.cents)}</T>} />
      ))}
    </Card>
  );

  let body;
  if (r === "owed") {
    const o = owedReport(db);
    const rows = o.rows.map((x) => [custName(x.customerId), csvMoney(x.owesCents), csvMoney(x.overdueCents), x.maxDaysOverdue, ...AGING_BUCKETS.map((b) => csvMoney(x.buckets[b]))]);
    const card = (x: (typeof o.rows)[number]) => (
      <ListCard
        key={x.customerId}
        title={custName(x.customerId)}
        lead={{ kind: "icon", icon: "user" }}
        value={moneyWhole(x.owesCents)}
        valueLabel={t("card.val.toPay")}
        signs={x.overdueCents > 0 ? [{ tone: "bad", label: t("card.sign.overdueDays", { d: x.maxDaysOverdue }) }] : undefined}
        edge={x.overdueCents > 0 ? "bad" : null}
        figures={AGING_BUCKETS.filter((b) => x.buckets[b] > 0).map((b) => ({ label: t(AGE[b]), value: moneyWhole(x.buckets[b]) }))}
        density="rich"
        // the one path to debts: this client's invoices
        onPress={() => router.push(`/invoice?f=owed&customer=${x.customerId}`)}
      />
    );
    body = (
      <>
        <RowView style={{ justifyContent: "flex-end" }}>{csvBtn(rows, [t("card.fact.client"), t("mny.owedTotal"), t("mny.g.overdue"), t("rpt.maxDays"), ...AGING_BUCKETS.map((b) => t(AGE[b]))])}</RowView>
        {total(t("mny.owedTotal"), o.owesCents, t("rpt.owed.note", { n: o.rows.length, overdue: moneyWhole(o.overdueCents) }))}
        {o.rows.length === 0 ? <Empty icon="check" title={t("mny.empty.owed")} /> : device === "tablet" ? <CardGrid>{o.rows.map(card)}</CardGrid> : <CardList>{o.rows.map(card)}</CardList>}
      </>
    );
  } else if (r === "collected") {
    const c = collectedReport(db, p);
    const rows = [...c.byMethod.map((x) => [t("rpt.byMethod"), method(x.key), x.count, csvMoney(x.cents)]), ...c.byPerson.map((x) => [t("rpt.byPerson"), personName(x.key), x.count, csvMoney(x.cents)])];
    body = (
      <>
        <RowView style={{ justifyContent: "space-between", flexWrap: "wrap" }}>{periods}{csvBtn(rows, [t("rpt.group"), t("rpt.name"), t("rpt.count"), t("rpt.amount")])}</RowView>
        {total(t("rpt.collected.title"), c.totalCents, t("rpt.collected.note", { n: c.count }))}
        {c.count === 0 ? <Empty icon="wallet" title={t("mny.payments.empty")} /> : (
          <>
            {breakdown(t("rpt.byMethod"), c.byMethod, method, c.totalCents)}
            {breakdown(t("rpt.byPerson"), c.byPerson, personName, c.totalCents)}
          </>
        )}
      </>
    );
  } else if (r === "sales") {
    const s = salesReport(db, p);
    const line = (label: string, v: string) => <ListRow title={label} right={<T v="body" tabular>{v}</T>} />;
    body = (
      <>
        <RowView style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          {periods}
          {csvBtn([[t("rpt.sales.sent"), s.sent], [t("rpt.sales.signed"), s.signed], [t("rpt.sales.value"), csvMoney(s.signedCents)], [t("rpt.sales.pct"), s.signedPct]], [t("rpt.name"), t("rpt.amount")])}
        </RowView>
        {total(t("rpt.sales.value"), s.signedCents)}
        <Card>
          {line(t("rpt.sales.sent"), String(s.sent))}
          <Divider />
          {line(t("rpt.sales.signed"), String(s.signed))}
          <Divider />
          {line(t("rpt.sales.pct"), `${s.signedPct}%`)}
        </Card>
      </>
    );
  } else {
    const s = sourcesReport(db, p);
    const rows = s.rows.map((x) => [sourceName(x.key), x.count, csvMoney(x.cents)]);
    body = (
      <>
        <RowView style={{ justifyContent: "space-between", flexWrap: "wrap" }}>{periods}{csvBtn(rows, [t("rpt.source"), t("rpt.count"), t("rpt.amount")])}</RowView>
        {total(t("rpt.sources.revenue"), s.totalCents, t("rpt.sources.hint"))}
        {s.rows.length === 0 ? <Empty icon="megaphone" title={t("rpt.sources.empty")} /> : breakdown(t("rpt.source"), s.rows, sourceName, s.totalCents)}
      </>
    );
  }
  return (
    <Screen title={t(TITLE[r])} back={back}>
      {body}
    </Screen>
  );
}
