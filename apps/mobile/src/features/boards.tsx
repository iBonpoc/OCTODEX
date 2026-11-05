/** Lists for the Sales hub and Money: estimates and invoices as cards with status filters. */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space, type StatusName } from "@octo/design-tokens";
import { daysSince, isOverdue, useStore } from "@/data/store";
import type { EstimateStatus, Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { ChoiceChips, StatusChip } from "@/ui/controls";
import { CardList, Empty, ItemCard, SectionTitle } from "@/ui/surfaces";

/** status chip of an estimate — the one place for it (lists, client and property documents) */
export const estView: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

export function EstimatesBoard() {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const [f, setF] = useState<"open" | EstimateStatus | "all">("open");
  const count = (s: EstimateStatus) => db.estimates.filter((e) => e.status === s).length;
  const list = db.estimates
    .filter((e) => (f === "all" ? true : f === "open" ? e.status === "draft" || e.status === "sent" : e.status === f))
    .sort((a, b) => (b.sentAt ?? b.approvedAt ?? "").localeCompare(a.sentAt ?? a.approvedAt ?? ""));
  return (
    <View style={{ gap: space[3] }}>
      <ChoiceChips
        value={f}
        onChange={setF}
        items={[
          { key: "open", label: `${t("board.open")} · ${count("draft") + count("sent")}` },
          { key: "approved", label: `${t("st.approved")} · ${count("approved")}` },
          { key: "declined", label: `${t("st.declined")} · ${count("declined")}` },
          { key: "all", label: t("cat.all") },
        ]}
      />
      {list.length === 0 ? (
        <Empty icon="invoice" title={t("board.noEstimates")} />
      ) : (
        <CardList>
          {list.map((e) => {
            const c = db.customers.find((x) => x.id === e.customerId);
            const v = estView[e.status];
            const stale = e.status === "sent" && e.sentAt ? daysSince(e.sentAt) : 0;
            const sub = [
              money(e.totalCents),
              e.number,
              e.status === "sent" && e.viewedAt ? t("ue.viewed", { date: day(e.viewedAt) }) : e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : t("st.draft"),
            ].filter(Boolean);
            return (
              <ItemCard
                key={e.id}
                status={stale >= 5 ? "bad" : stale >= 2 ? "warn" : v.s}
                title={`${c?.name ?? "—"} · ${e.title}`}
                subtitle={sub.join(" · ")}
                right={<StatusChip status={v.s} label={t(v.l)} />}
                onPress={() => router.push(`/estimate/${e.id}`)}
              />
            );
          })}
        </CardList>
      )}
    </View>
  );
}

/** Invoices grouped: overdue → awaiting → paid (each invoice is a card). */
export function InvoicesBoard() {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const now = Date.now();
  const open = db.invoices.filter((i) => i.paidCents < i.totalCents);
  const overdue = open.filter((i) => isOverdue(i.dueDate, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const awaiting = open.filter((i) => !isOverdue(i.dueDate, now));
  const paid = db.invoices.filter((i) => i.paidCents >= i.totalCents).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const name = (i: Invoice) => db.customers.find((c) => c.id === i.customerId)?.name ?? "";
  const section = (title: string, list: Invoice[], kind: "bad" | "warn" | "ok") =>
    list.length ? (
      <View style={{ gap: space[2] }}>
        <SectionTitle title={`${title} · ${money(list.reduce((s, i) => s + (kind === "ok" ? i.paidCents : i.totalCents - i.paidCents), 0))}`} />
        <CardList>
          {list.map((i) => (
            <ItemCard
              key={i.id}
              status={kind}
              title={name(i)}
              onPress={() => router.push(`/invoice/${i.id}`)}
              subtitle={[
                i.number,
                i.title ?? (i.kind === "deposit" ? t("money.deposit") : undefined),
                kind === "ok" && i.paidAt ? t("money.paidOn", { date: day(i.paidAt) }) : t("money.due", { date: day(i.dueDate) }),
                i.paidCents > 0 && kind !== "ok" ? t("inv.paidPart", { amount: money(i.paidCents) }) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              right={<StatusChip status={kind} label={money(kind === "ok" ? i.paidCents : i.totalCents - i.paidCents)} />}
            />
          ))}
        </CardList>
      </View>
    ) : null;
  return (
    <View style={{ gap: space[3] }}>
      {db.invoices.length === 0 ? <Empty icon="invoice" title={t("money.empty")} /> : null}
      {section(t("money.overdue"), overdue, "bad")}
      {section(t("money.awaiting"), awaiting, "warn")}
      {section(t("money.paid"), paid, "ok")}
    </View>
  );
}
