import { useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { figureItems, FIGURES, type Figure, type Period } from "@/features/metrics";
import { invoiceList } from "@/features/moneyLists";
import { EST_COLUMNS, EstimateListCard, INV_COLUMNS, InvoiceListCard, LEAD_COLUMNS, LeadListCard, PAY_COLUMNS, PaymentListCard } from "@/features/listCards";
import { ListCardHeader } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";
import { CardList, Empty, Screen } from "@/ui/surfaces";

const TITLE: Record<Figure, DictKey> = {
  leads: "today.f.leads",
  sent: "today.f.sent",
  signed: "today.f.signed",
  received: "today.f.paid",
  awaiting: "today.awaiting",
};
const PERIOD: Record<Period, DictKey> = { today: "today.title", week: "plan.week", month: "plan.month" };

/**
 * A number from "Today", opened: exactly the records it counts, for the same period (founder 05.11).
 * Each card opens its record; "back" returns to "Today" (nav/hierarchy.ts → figures).
 */
export default function FigureScreen() {
  const { metric, period } = useLocalSearchParams<{ metric: string; period?: string }>();
  const { db } = useStore();
  const { t, money } = useI18n();
  const { device } = useDevice();
  const density = device === "desktop" ? "row" : "rich";
  const f: Figure = (FIGURES as string[]).includes(metric) ? (metric as Figure) : "leads";
  const p: Period = period === "week" || period === "month" ? period : "today";
  const items = figureItems(db, f, p);
  const count = items.leads.length + items.estimates.length + items.payments.length + items.invoices.length;
  const total =
    f === "received" ? money(items.payments.reduce((s, x) => s + x.amountCents, 0))
    : f === "awaiting" ? money(invoiceList(db, "owed").owedCents)
    : f === "signed" ? money(items.estimates.reduce((s, e) => s + e.totalCents, 0))
    : null;
  const columns = items.leads.length ? LEAD_COLUMNS : items.estimates.length ? EST_COLUMNS : items.payments.length ? PAY_COLUMNS : INV_COLUMNS;
  return (
    <Screen title={t(TITLE[f])} subtitle={[f === "awaiting" ? t("today.allTime") : t(PERIOD[p]), String(count), total].filter(Boolean).join(" · ")}>
      {count === 0 ? <Empty icon="check" title={t("figures.empty")} /> : null}
      {/* the same card as the main list of that object (features/listCards.tsx): same facts, same amount (spec 06, PR10b) */}
      {device === "desktop" && count > 0 ? <ListCardHeader title={t("card.fact.client")} columns={columns} /> : null}
      <CardList>
        {items.leads.map((l) => <LeadListCard key={l.id} l={l} density={density} />)}
        {items.estimates.map((e) => <EstimateListCard key={e.id} e={e} density={density} />)}
        {items.payments.map((x) => <PaymentListCard key={x.id} x={x} density={density} />)}
        {items.invoices.map((i) => <InvoiceListCard key={i.id} i={i} density={density} />)}
      </CardList>
    </Screen>
  );
}
