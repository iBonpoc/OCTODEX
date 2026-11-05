import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { figureItems, FIGURES, type Figure, type Period } from "@/features/metrics";
import { leadStatusView, sourceName } from "@/features/leads";
import { StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { CardList, Empty, ItemCard, Screen } from "@/ui/surfaces";

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
  const { t, money, day } = useI18n();
  const f: Figure = (FIGURES as string[]).includes(metric) ? (metric as Figure) : "leads";
  const p: Period = period === "week" || period === "month" ? period : "today";
  const items = figureItems(db, f, p);
  const clientName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const count = items.leads.length + items.estimates.length + items.payments.length + items.invoices.length;
  const total =
    f === "received" ? money(items.payments.reduce((s, x) => s + x.amountCents, 0))
    : f === "awaiting" ? money(items.invoices.reduce((s, i) => s + i.totalCents - i.paidCents, 0))
    : f === "signed" ? money(items.estimates.reduce((s, e) => s + e.totalCents, 0))
    : null;
  return (
    <Screen title={t(TITLE[f])} subtitle={[f === "awaiting" ? t("today.allTime") : t(PERIOD[p]), String(count), total].filter(Boolean).join(" · ")}>
      {count === 0 ? <Empty icon="check" title={t("figures.empty")} /> : null}
      <CardList>
        {items.leads.map((l) => (
          <View key={l.id}>
            <ItemCard
              title={l.name}
              subtitle={[l.number, sourceName(db, l.sourceId), day(l.receivedAt)].filter(Boolean).join(" · ")}
              right={<StatusChip status={leadStatusView[l.status].status} label={t(leadStatusView[l.status].label)} soft />}
              onPress={() => router.push(`/lead/${l.id}`)}
            />
          </View>
        ))}
        {items.estimates.map((e) => (
          <View key={e.id}>
            <ItemCard
              title={[e.number, e.title].filter(Boolean).join(" · ")}
              subtitle={`${clientName(e.customerId)} · ${day((f === "signed" ? e.approvedAt : e.sentAt) ?? "")}`}
              right={<T v="body" w="semibold" tabular>{money(e.totalCents)}</T>}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          </View>
        ))}
        {items.payments.map((x) => (
          <View key={x.id}>
            <ItemCard
              title={clientName(x.customerId)}
              subtitle={[x.receiptNumber, t(`pay.${x.method}` as DictKey), day(x.at)].filter(Boolean).join(" · ")}
              right={<T v="body" w="semibold" tabular>{money(x.amountCents)}</T>}
              onPress={() => router.push(`/receipt/${x.id}`)}
            />
          </View>
        ))}
        {items.invoices.map((i) => (
          <View key={i.id}>
            <ItemCard
              title={clientName(i.customerId)}
              subtitle={[i.number, i.title, i.dueDate ? day(i.dueDate) : null].filter(Boolean).join(" · ")}
              right={<T v="body" w="semibold" tabular>{money(i.totalCents - i.paidCents)}</T>}
              onPress={() => router.push(`/invoice/${i.id}`)}
            />
          </View>
        ))}
      </CardList>
    </Screen>
  );
}
